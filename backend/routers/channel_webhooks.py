"""
Общий endpoint входящих событий от каналов: POST /webhooks/{channel}/{bot_id}.
GET /webhooks/whatsapp/{bot_id} — верификация webhook Meta (hub.mode, hub.verify_token, hub.challenge).
Для MAX проверяется заголовок X-Max-Bot-Api-Secret. Для WhatsApp — provider.validate_webhook.
Нормализует payload через adapter/провайдер, далее — движок сценариев или track_event без PII.
"""
import json
import logging
from typing import Any

from fastapi import APIRouter, Request, Depends, HTTPException, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from backend.channels.base import NormalizedUpdate
from backend.channels.registry import get_adapter
from backend.channels.whatsapp.providers.registry import get_whatsapp_provider
from backend.database import get_db
from backend.models.bot import Bot
from backend.models.bot_channel import BotChannelConnection
from backend.services.analytics_service import get_analytics_service
from backend.services.channel_runtime import process_channel_update
from backend.services.message_idempotency import (
    build_processed_update_key,
    try_register_processed_update,
)
from backend.settings import settings
from backend.utils.chat_hash import make_chat_hash

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Заголовок, который MAX присылает с webhook-запросами (значение = secret из подписки)
MAX_WEBHOOK_SECRET_HEADER = "X-Max-Bot-Api-Secret"


def _get_max_webhook_secret(conn: BotChannelConnection) -> str | None:
    if not conn or not conn.credentials_json:
        return None
    try:
        creds = json.loads(conn.credentials_json)
        return creds.get("webhook_secret") if isinstance(creds, dict) else None
    except Exception:
        return None


def _get_whatsapp_credentials(conn: BotChannelConnection) -> dict[str, Any]:
    if not conn or not conn.credentials_json:
        return {}
    try:
        creds = json.loads(conn.credentials_json)
        return creds if isinstance(creds, dict) else {}
    except Exception:
        return {}


def _request_headers_dict(request: Request) -> dict[str, str]:
    """Словарь заголовков для validate_webhook (нижний регистр ключей)."""
    return {k.lower(): v for k, v in request.headers.items()}


def _dispatch_channel_update(
    db: Session,
    *,
    bot: Bot,
    conn: BotChannelConnection,
    adapter: Any,
    channel_key: str,
    bot_id: int,
    body: dict[str, Any],
    normalized: NormalizedUpdate,
    analytics_event_type: str | None = None,
) -> dict[str, Any]:
    """
    Единая точка dedup + runtime для POST /webhooks/{channel}/{bot_id}.

    Dedup: атомарная регистрация через try_register_processed_update до runtime
    (см. docs/TARIFFS_STAGE_5_2_1_MESSAGE_IDEMPOTENCY.md).
    """
    external_id = build_processed_update_key(channel_key, bot_id, body)
    if external_id and not try_register_processed_update(db, channel_key, bot_id, external_id):
        return {"ok": True, "duplicate": True}

    if channel_key == "whatsapp" and normalized.chat_id and (settings.CHAT_HASH_SALT or "").strip():
        normalized = NormalizedUpdate(
            channel=normalized.channel,
            chat_id=normalized.chat_id,
            chat_hash=make_chat_hash("whatsapp", normalized.chat_id),
            user_id=normalized.user_id,
            text=normalized.text,
            buttons=normalized.buttons,
            media_url=normalized.media_url,
            raw=normalized.raw,
        )

    logger.info(
        "channel_webhook received: channel=%s bot_id=%s has_chat_hash=%s dedup_key=%s",
        channel_key,
        bot_id,
        normalized.chat_hash is not None,
        "yes" if external_id else "no",
    )
    process_channel_update(
        db,
        bot=bot,
        conn=conn,
        adapter=adapter,
        normalized=normalized,
    )

    if analytics_event_type:
        analytics = get_analytics_service(db)
        analytics.track_event(
            event_type=analytics_event_type,
            event_name=analytics_event_type,
            bot_id=bot_id,
            channel=channel_key,
            chat_hash=normalized.chat_hash,
            node_id=None,
            minimal_storage=True,
        )
    return {"ok": True}


@router.get("/whatsapp/{bot_id}", response_class=PlainTextResponse)
async def whatsapp_webhook_verify(
    bot_id: int,
    hub_mode: str | None = Query(None, alias="hub.mode"),
    hub_verify_token: str | None = Query(None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(None, alias="hub.challenge"),
    db: Session = Depends(get_db),
):
    """
    Верификация webhook Meta: GET с hub.mode=subscribe и hub.verify_token.
    Если verify_token совпадает с credentials["verify_token"], возвращаем hub.challenge (plain text).
    """
    if hub_mode != "subscribe" or not hub_challenge:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid verification request")
    conn = (
        db.query(BotChannelConnection)
        .filter(
            BotChannelConnection.bot_id == bot_id,
            BotChannelConnection.channel == "whatsapp",
            BotChannelConnection.is_enabled == True,
        )
        .first()
    )
    if not conn or not conn.credentials_json:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Channel not found or disabled")
    try:
        creds = json.loads(conn.credentials_json)
    except Exception:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid credentials")
    if not isinstance(creds, dict):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid credentials")
    if (creds.get("provider") or "").strip().lower() != "meta_cloud":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not Meta Cloud provider")
    expected_token = (creds.get("verify_token") or "").strip()
    if not expected_token or hub_verify_token != expected_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid verify_token")
    return PlainTextResponse(content=hub_challenge)


@router.post("/{channel}/{bot_id}")
async def channel_webhook(
    channel: str,
    bot_id: int,
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Принимает сырой payload от канала, нормализует через адаптер.
    Для channel=max обязателен заголовок X-Max-Bot-Api-Secret (иначе 401).
    Дальше — движок сценариев (если реализовано) или track_event в агрегированном виде без PII.
    """
    channel_key = channel.lower()
    adapter = get_adapter(channel_key)
    if not adapter:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown channel: {channel}",
        )
    bot = db.query(Bot).filter(Bot.id == bot_id, Bot.is_active == True).first()
    if not bot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found or inactive")
    conn = db.query(BotChannelConnection).filter(
        BotChannelConnection.bot_id == bot_id,
        BotChannelConnection.channel == channel_key,
        BotChannelConnection.is_enabled == True,
    ).first()
    if not conn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel not connected or disabled")

    # WhatsApp: для проверки подписи Meta нужен raw body; читаем bytes до parse
    body_bytes: bytes | None = None
    body: dict[str, Any] = {}
    if channel_key == "whatsapp":
        body_bytes = await request.body()
        try:
            body = json.loads(body_bytes) if body_bytes else {}
        except Exception:
            pass
    else:
        try:
            body = await request.json()
        except Exception:
            pass

    # WhatsApp: провайдер из credentials, validate_webhook (с raw_body для Meta), нормализация, chat_hash
    if channel_key == "whatsapp":
        creds = _get_whatsapp_credentials(conn)
        provider_name = (creds.get("provider") or "").strip().lower()
        if not provider_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="WhatsApp credentials.provider not set",
            )
        provider = get_whatsapp_provider(provider_name)
        if not provider:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown WhatsApp provider: {provider_name}",
            )
        headers_dict = _request_headers_dict(request)
        if not provider.validate_webhook(headers_dict, body, raw_body=body_bytes, credentials=creds):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook signature")
        try:
            normalized = provider.normalize_incoming(body)
        except Exception as e:
            logger.warning(
                "channel_webhook whatsapp normalize_incoming failed: bot_id=%s error=%s",
                bot_id,
                str(e),
            )
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload for WhatsApp")
        return _dispatch_channel_update(
            db,
            bot=bot,
            conn=conn,
            adapter=adapter,
            channel_key=channel_key,
            bot_id=bot_id,
            body=body,
            normalized=normalized,
            analytics_event_type="whatsapp_update_received",
        )

    # MAX: проверка секрета webhook (документация MAX — header X-Max-Bot-Api-Secret)
    if channel_key == "max":
        expected_secret = _get_max_webhook_secret(conn)
        received_secret = request.headers.get(MAX_WEBHOOK_SECRET_HEADER)
        if not expected_secret or received_secret != expected_secret:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or missing webhook secret")

    try:
        normalized: NormalizedUpdate = adapter.normalize_incoming(body)
    except Exception as e:
        logger.warning(
            "channel_webhook normalize_incoming failed: channel=%s bot_id=%s error=%s",
            channel_key,
            bot_id,
            str(e),
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload for channel")

    analytics_event = "max_update_received" if channel_key == "max" else None
    return _dispatch_channel_update(
        db,
        bot=bot,
        conn=conn,
        adapter=adapter,
        channel_key=channel_key,
        bot_id=bot_id,
        body=body,
        normalized=normalized,
        analytics_event_type=analytics_event,
    )