"""
Единый подсчёт production-active ботов и каналов (Этап 5.1).

Источник истины для активных ботов (enforcement + tariff summary).
UsageCounter.active_bots_used на этом этапе намеренно не используется —
см. docs/TARIFFS_STAGE_5_1_BOT_ENFORCEMENT.md («UsageCounter.active_bots_used»).
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from backend.models.bot import Bot
from backend.models.bot_channel import BotChannelConnection

# Неявный канал Telegram при POST /bots/connect (без BotChannelConnection).
IMPLICIT_TELEGRAM_CHANNEL = "telegram"


def is_placeholder_bot_token(token: str | None) -> bool:
    if not token:
        return True
    return token.startswith("placeholder_")


def bot_has_implicit_telegram_channel(bot: Bot) -> bool:
    """Legacy: бот подключён через /bots/connect (реальный токен, is_active)."""
    return bool(bot.is_active) and not is_placeholder_bot_token(bot.token)


def bot_has_enabled_channel_connection(db: Session, bot_id: int) -> bool:
    return (
        db.query(BotChannelConnection.id)
        .filter(
            BotChannelConnection.bot_id == bot_id,
            BotChannelConnection.is_enabled.is_(True),
        )
        .first()
        is not None
    )


def is_bot_production_active(bot: Bot, db: Session) -> bool:
    """
    Production-active: подключён к каналу или Telegram, не черновик.

    Черновик: placeholder token без включённого BotChannelConnection.
    """
    if bot.is_suspended:
        return False
    if bot_has_enabled_channel_connection(db, bot.id):
        return True
    return bot_has_implicit_telegram_channel(bot)


def count_production_active_bots(
    db: Session,
    owner_id: int,
    *,
    exclude_bot_id: int | None = None,
) -> int:
    """Фактическое число production-active ботов владельца."""
    bots = db.query(Bot).filter(Bot.owner_id == owner_id).all()
    total = 0
    for bot in bots:
        if exclude_bot_id is not None and bot.id == exclude_bot_id:
            continue
        if is_bot_production_active(bot, db):
            total += 1
    return total


def bot_active_channel_keys(db: Session, bot: Bot) -> set[str]:
    """Каналы, уже занятые ботом (включая неявный telegram)."""
    keys: set[str] = set()
    rows = (
        db.query(BotChannelConnection.channel)
        .filter(
            BotChannelConnection.bot_id == bot.id,
            BotChannelConnection.is_enabled.is_(True),
        )
        .all()
    )
    keys.update(row[0] for row in rows)
    if bot_has_implicit_telegram_channel(bot):
        keys.add(IMPLICIT_TELEGRAM_CHANNEL)
    return keys
