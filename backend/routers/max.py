"""
Роуты управления каналом MAX: enable / disable / status.
Только OWNER/ADMIN бота. Секреты в ответ не возвращаются.
"""
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.bot import Bot
from backend.models.bot_channel import BotChannelConnection
from backend.models.user import User
from backend.services.max_subscriptions import (
    ensure_webhook_subscribed,
    get_subscriptions,
    unsubscribe_webhook,
)
from backend.utils.bot_access import check_bot_edit_permission

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/bots/{bot_id}/channels", tags=["channels-max"])


def _get_bot_and_check_edit(bot_id: int, db: Session, current_user: User) -> Bot:
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found")
    if not check_bot_edit_permission(bot, current_user.id, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No permission to manage MAX channel",
        )
    return bot


def _get_max_connection(bot_id: int, db: Session) -> BotChannelConnection:
    conn = db.query(BotChannelConnection).filter(
        BotChannelConnection.bot_id == bot_id,
        BotChannelConnection.channel == "max",
    ).first()
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="MAX channel connection not found. Create it via POST /bots/{bot_id}/channels with channel=max and credentials.token",
        )
    return conn


@router.post("/max/enable")
def max_enable(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Включает канал MAX: is_enabled=True, при отсутствии webhook_secret генерирует и сохраняет,
    регистрирует webhook в MAX (ensure_webhook_subscribed).
    Требует: подключение max уже создано с credentials.token.
    """
    _get_bot_and_check_edit(bot_id, db, current_user)
    conn = _get_max_connection(bot_id, db)
    creds = {}
    if conn.credentials_json:
        try:
            creds = json.loads(conn.credentials_json)
        except Exception:
            pass
    if not creds.get("token"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MAX token not set. Set credentials.token via POST /bots/{bot_id}/channels.",
        )
    try:
        ensure_webhook_subscribed(bot_id, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    conn.is_enabled = True
    db.commit()
    db.refresh(conn)
    return {"ok": True, "is_enabled": True}


@router.post("/max/disable")
def max_disable(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Отписывает webhook в MAX и выключает канал (is_enabled=False)."""
    _get_bot_and_check_edit(bot_id, db, current_user)
    conn = db.query(BotChannelConnection).filter(
        BotChannelConnection.bot_id == bot_id,
        BotChannelConnection.channel == "max",
    ).first()
    if not conn:
        return {"ok": True, "is_enabled": False}
    try:
        unsubscribe_webhook(bot_id, db)
    except Exception:
        pass
    conn.is_enabled = False
    db.commit()
    db.refresh(conn)
    return {"ok": True, "is_enabled": False}


@router.get("/max/status")
def max_status(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Возвращает is_enabled и список подписок из MAX (без токенов и секретов)."""
    _get_bot_and_check_edit(bot_id, db, current_user)
    conn = db.query(BotChannelConnection).filter(
        BotChannelConnection.bot_id == bot_id,
        BotChannelConnection.channel == "max",
    ).first()
    if not conn:
        return {"is_enabled": False, "subscriptions": []}
    subscriptions = get_subscriptions(bot_id, db)
    return {
        "is_enabled": conn.is_enabled,
        "subscriptions": subscriptions,
    }
