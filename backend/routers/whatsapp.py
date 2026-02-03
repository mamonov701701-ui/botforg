"""
Роуты управления каналом WhatsApp: enable / disable / status.
Только OWNER/ADMIN бота. Секреты в ответ не возвращаются.
Провайдер задаётся в credentials.provider (meta_cloud, twilio, dialog360).
"""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.channels.whatsapp.providers.registry import get_whatsapp_provider, get_whatsapp_provider_names
from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.bot import Bot
from backend.models.bot_channel import BotChannelConnection
from backend.models.user import User
from backend.utils.bot_access import check_bot_edit_permission

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/bots/{bot_id}/channels", tags=["channels-whatsapp"])


def _get_bot_and_check_edit(bot_id: int, db: Session, current_user: User) -> Bot:
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found")
    if not check_bot_edit_permission(bot, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No permission to manage WhatsApp channel",
        )
    return bot


def _get_whatsapp_connection(bot_id: int, db: Session) -> BotChannelConnection:
    conn = db.query(BotChannelConnection).filter(
        BotChannelConnection.bot_id == bot_id,
        BotChannelConnection.channel == "whatsapp",
    ).first()
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="WhatsApp channel connection not found. Create via POST /bots/{bot_id}/channels with channel=whatsapp and credentials.provider",
        )
    return conn


def _get_credentials(conn: BotChannelConnection) -> dict:
    if not conn or not conn.credentials_json:
        return {}
    try:
        return json.loads(conn.credentials_json)
    except Exception:
        return {}


@router.post("/whatsapp/enable")
def whatsapp_enable(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Включает канал WhatsApp: is_enabled=True.
    Требует: credentials.provider задан и известен (meta_cloud, twilio, dialog360).
    """
    _get_bot_and_check_edit(bot_id, db, current_user)
    conn = _get_whatsapp_connection(bot_id, db)
    creds = _get_credentials(conn)
    provider_name = (creds.get("provider") or "").strip().lower()
    if not provider_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="WhatsApp credentials.provider not set. Set via POST /bots/{bot_id}/channels.",
        )
    if not get_whatsapp_provider(provider_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown WhatsApp provider: {provider_name}. Allowed: {', '.join(get_whatsapp_provider_names())}",
        )
    conn.is_enabled = True
    db.commit()
    db.refresh(conn)
    return {"ok": True, "is_enabled": True, "provider": provider_name}


@router.post("/whatsapp/disable")
def whatsapp_disable(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Выключает канал WhatsApp (is_enabled=False)."""
    _get_bot_and_check_edit(bot_id, db, current_user)
    conn = db.query(BotChannelConnection).filter(
        BotChannelConnection.bot_id == bot_id,
        BotChannelConnection.channel == "whatsapp",
    ).first()
    if not conn:
        return {"ok": True, "is_enabled": False}
    conn.is_enabled = False
    db.commit()
    db.refresh(conn)
    return {"ok": True, "is_enabled": False}


@router.get("/whatsapp/status")
def whatsapp_status(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Возвращает provider, is_enabled (без секретов)."""
    _get_bot_and_check_edit(bot_id, db, current_user)
    conn = db.query(BotChannelConnection).filter(
        BotChannelConnection.bot_id == bot_id,
        BotChannelConnection.channel == "whatsapp",
    ).first()
    if not conn:
        return {"is_enabled": False, "provider": None}
    creds = _get_credentials(conn)
    provider_name = (creds.get("provider") or "").strip().lower() or None
    return {
        "is_enabled": conn.is_enabled,
        "provider": provider_name,
    }
