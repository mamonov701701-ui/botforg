"""
Идемпотентность входящих webhook для нового message runtime (/webhooks/{channel}/{bot_id}).

Ключ дедупликации хранится в ProcessedUpdate.message_id (внешний update/message id провайдера).
Уникальность: (bot_id, channel, message_id).
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.processed_update import ProcessedUpdate

logger = logging.getLogger(__name__)


def _normalize_channel(channel: str) -> str:
    return channel.strip().lower()


def _extract_whatsapp_message_id(payload: dict[str, Any]) -> str | None:
    """Стабильный id сообщения Meta Cloud (messages[].id), без hash payload."""
    messages = payload.get("messages") or []
    if messages:
        msg = messages[0] if isinstance(messages, list) else messages
        if isinstance(msg, dict) and msg.get("id") is not None:
            return str(msg["id"])
    entry = payload.get("entry")
    if not isinstance(entry, list) or not entry:
        return None
    changes = (entry[0] or {}).get("changes")
    if not isinstance(changes, list) or not changes:
        return None
    value = (changes[0] or {}).get("value") or {}
    messages = value.get("messages") or []
    if not messages:
        return None
    msg = messages[0] if isinstance(messages, list) else messages
    if isinstance(msg, dict) and msg.get("id") is not None:
        return str(msg["id"])
    return None


def build_processed_update_key(channel: str, bot_id: int, payload: dict[str, Any]) -> str | None:
    """
    Возвращает стабильный внешний id события для dedup или None, если id ненадёжен.

    bot_id не входит в строку ключа — scope задаётся колонкой bot_id в ProcessedUpdate.
    """
    channel_key = _normalize_channel(channel)
    if channel_key == "telegram":
        update_id = payload.get("update_id")
        if update_id is not None:
            return str(update_id)
        return None

    if channel_key == "whatsapp":
        return _extract_whatsapp_message_id(payload)

    if channel_key == "max":
        for field in ("message_id", "id", "event_id", "eventId"):
            value = payload.get(field)
            if value is not None:
                return str(value)
        msg = payload.get("message")
        if isinstance(msg, dict):
            mid = msg.get("message_id") or msg.get("id")
            if mid is not None:
                return str(mid)
        return None

    return None


def get_whatsapp_inbound_message_type(payload: dict[str, Any]) -> str | None:
    """Meta Cloud: messages[0].type (text, image, document, ...)."""
    messages = payload.get("messages") or []
    if messages:
        msg = messages[0] if isinstance(messages, list) else messages
        if isinstance(msg, dict) and msg.get("type") is not None:
            return str(msg["type"]).lower()
    entry = payload.get("entry")
    if not isinstance(entry, list) or not entry:
        return None
    changes = (entry[0] or {}).get("changes")
    if not isinstance(changes, list) or not changes:
        return None
    value = (changes[0] or {}).get("value") or {}
    messages = value.get("messages") or []
    if not messages:
        return None
    msg = messages[0] if isinstance(messages, list) else messages
    if isinstance(msg, dict) and msg.get("type") is not None:
        return str(msg["type"]).lower()
    return None


def try_register_processed_update(
    db: Session,
    channel: str,
    bot_id: int,
    external_update_id: str,
) -> bool:
    """
    Атомарная регистрация update (INSERT + unique constraint).

    True — update зарегистрирован впервые, можно запускать runtime.
    False — duplicate (IntegrityError), runtime не запускать.
    """
    channel_key = _normalize_channel(channel)
    record = ProcessedUpdate(
        bot_id=bot_id,
        channel=channel_key,
        message_id=str(external_update_id),
    )
    db.add(record)
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        logger.debug(
            "message_idempotency: duplicate register bot_id=%s channel=%s update_id=%s",
            bot_id,
            channel_key,
            external_update_id,
        )
        return False


def is_update_already_processed(
    db: Session,
    channel: str,
    bot_id: int,
    external_update_id: str,
) -> bool:
    channel_key = _normalize_channel(channel)
    return (
        db.query(ProcessedUpdate)
        .filter(
            ProcessedUpdate.bot_id == bot_id,
            ProcessedUpdate.channel == channel_key,
            ProcessedUpdate.message_id == str(external_update_id),
        )
        .first()
        is not None
    )


def mark_update_processed(
    db: Session,
    channel: str,
    bot_id: int,
    external_update_id: str,
) -> None:
    """
    Совместимость: тихая регистрация без проверки результата.

    Router использует try_register_processed_update; эта функция — для тестов/read-only сценариев.
    """
    try_register_processed_update(db, channel, bot_id, external_update_id)
