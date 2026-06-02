"""API управления подключениями каналов к боту (GET/POST/DELETE)."""
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.bot import Bot
from backend.models.bot_channel import BotChannelConnection
from backend.models.user import User
from backend.schemas.channels import BotChannelConnectionCreate, BotChannelConnectionOut
from backend.utils.bot_access import check_bot_edit_permission
from backend.services.bot_usage import is_placeholder_bot_token
from backend.services.tariff_enforcement import (
    TariffLimitExceeded,
    ensure_can_connect_channel,
    tariff_limit_to_http,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/bots/{bot_id}/channels", tags=["channels"])


def _get_bot_and_check_edit(bot_id: int, db: Session, current_user: User) -> Bot:
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found")
    if not check_bot_edit_permission(bot, current_user.id, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No permission to manage channels")
    return bot


@router.get("", response_model=list[BotChannelConnectionOut])
def list_channels(
    bot_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Список подключённых каналов бота (без секретов)."""
    _get_bot_and_check_edit(bot_id, db, current_user)
    conns = db.query(BotChannelConnection).filter(BotChannelConnection.bot_id == bot_id).all()
    return [BotChannelConnectionOut.model_validate(c) for c in conns]


@router.post("", response_model=BotChannelConnectionOut, status_code=status.HTTP_201_CREATED)
def upsert_channel(
    bot_id: int,
    payload: BotChannelConnectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Создать или обновить подключение канала. credentials передаются только при создании/обновлении, в ответе не возвращаются."""
    bot = _get_bot_and_check_edit(bot_id, db, current_user)
    channel_key = payload.channel.lower().strip()
    if not channel_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="channel is required")

    conn = db.query(BotChannelConnection).filter(
        BotChannelConnection.bot_id == bot_id,
        BotChannelConnection.channel == channel_key,
    ).first()

    credentials_json = None
    if payload.credentials is not None:
        credentials_json = json.dumps(payload.credentials)

    if conn:
        conn.is_enabled = payload.is_enabled
        if credentials_json is not None:
            conn.credentials_json = credentials_json
        db.commit()
        db.refresh(conn)
        return BotChannelConnectionOut.model_validate(conn)

    try:
        ensure_can_connect_channel(
            db,
            bot.owner_id,
            bot_id,
            channel_key,
            updating_existing=False,
        )
    except TariffLimitExceeded as exc:
        raise tariff_limit_to_http(exc) from exc

    conn = BotChannelConnection(
        bot_id=bot_id,
        channel=channel_key,
        is_enabled=payload.is_enabled,
        credentials_json=credentials_json,
    )
    db.add(conn)
    if payload.is_enabled and (not bot.is_active or is_placeholder_bot_token(bot.token)):
        bot.is_active = True
    db.commit()
    db.refresh(conn)
    return BotChannelConnectionOut.model_validate(conn)


@router.delete("/{channel}", status_code=status.HTTP_204_NO_CONTENT)
def delete_channel(
    bot_id: int,
    channel: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Отключить канал от бота."""
    _get_bot_and_check_edit(bot_id, db, current_user)
    channel_key = channel.lower().strip()
    conn = db.query(BotChannelConnection).filter(
        BotChannelConnection.bot_id == bot_id,
        BotChannelConnection.channel == channel_key,
    ).first()
    if not conn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Channel connection not found")
    db.delete(conn)
    db.commit()
    return None
