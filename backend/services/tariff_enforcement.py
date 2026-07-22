"""
Enforcement тарифных лимитов (Этап 5.1+): активные боты, каналы, участники команды.

Не трогает сообщения, webhook runtime и marketplace.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.models.bot import Bot
from backend.services.bot_usage import (
    bot_active_channel_keys,
    count_production_active_bots,
    is_bot_production_active,
)
from backend.services.tariff_limits import get_user_tariff_limits
from backend.services.team_usage import count_team_members_for_owner

MSG_ACTIVE_BOTS_EXCEEDED = "Лимит активных ботов по вашему тарифу исчерпан."
MSG_ONE_BOT_ONE_CHANNEL = "Один бот может быть подключён только к одному каналу."
MSG_TEAM_NOT_AVAILABLE = "Команда недоступна на вашем текущем тарифе."
MSG_TEAM_MEMBERS_EXCEEDED = "Лимит участников команды по вашему тарифу исчерпан."


class TariffLimitExceeded(Exception):
    """Доменное исключение при превышении тарифного лимита."""

    def __init__(self, message: str, *, code: str = "tariff_limit") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


def tariff_limit_to_http(exc: TariffLimitExceeded) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=exc.message)


def ensure_can_activate_bot(
    db: Session,
    user_id: int,
    *,
    bot_id: int | None = None,
    at: datetime | None = None,
) -> None:
    """
    Проверить, можно ли сделать ещё один активный бот (подключение / активация).

    Если bot_id уже production-active — проверка пропускается.
    """
    if bot_id is not None:
        bot = db.query(Bot).filter(Bot.id == bot_id).first()
        if bot and is_bot_production_active(bot, db):
            return

    summary = get_user_tariff_limits(db, user_id, at=at)
    limit = summary.active_bots_limit
    if limit is None:
        return

    used = count_production_active_bots(db, user_id, exclude_bot_id=bot_id)
    if used >= limit:
        raise TariffLimitExceeded(MSG_ACTIVE_BOTS_EXCEEDED, code="active_bots")


def ensure_can_connect_channel(
    db: Session,
    user_id: int,
    bot_id: int,
    channel_key: str,
    *,
    updating_existing: bool,
    at: datetime | None = None,
) -> None:
    """
    Правило «1 активный бот = 1 канал» и лимит активных ботов при первом подключении.

    updating_existing=True — обновление credentials того же channel, без нового слота.
    """
    channel_key = channel_key.lower().strip()
    bot = db.query(Bot).filter(Bot.id == bot_id).first()
    if not bot:
        raise ValueError(f"Bot {bot_id} not found")

    if updating_existing:
        return

    active_channels = bot_active_channel_keys(db, bot)
    if active_channels and channel_key not in active_channels:
        raise TariffLimitExceeded(MSG_ONE_BOT_ONE_CHANNEL, code="one_channel_per_bot")

    if channel_key in active_channels:
        return

    if active_channels:
        raise TariffLimitExceeded(MSG_ONE_BOT_ONE_CHANNEL, code="one_channel_per_bot")

    ensure_can_activate_bot(db, user_id, bot_id=bot_id, at=at)


def ensure_can_add_team_member(
    db: Session,
    owner_id: int,
    *,
    at: datetime | None = None,
) -> None:
    """
    Проверить, можно ли добавить ещё одного участника в команду владельца.

    Лимит и usage — через get_user_tariff_limits / count_team_members_for_owner
    (согласовано с GET /me/tariff/summary).
    """
    summary = get_user_tariff_limits(db, owner_id, at=at)
    limit = summary.team_members_limit
    if limit is None:
        return
    if limit <= 0:
        raise TariffLimitExceeded(
            MSG_TEAM_NOT_AVAILABLE,
            code="team_members_unavailable",
        )
    used = count_team_members_for_owner(db, owner_id)
    if used >= limit:
        raise TariffLimitExceeded(
            MSG_TEAM_MEMBERS_EXCEEDED,
            code="team_members_limit_exceeded",
        )
