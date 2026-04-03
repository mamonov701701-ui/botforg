"""Сопоставление platform Bot (bots.id) с CtorBot (ctor_bots.id)."""

from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def resolve_ctor_bot_id(db: Session, platform_bot_id: int) -> Optional[int]:
    """
    1) Если запись ctor_bots с тем же id существует — используем её.
    2) Иначе ищем CtorBot.slug по bots.username (без @, lower).
    Если таблиц ctor нет или бот не связан — None.
    """
    try:
        from backend.models.bot import Bot
        from backend.models.constructor_core import CtorBot
    except Exception as e:
        logger.debug("ctor_bot_resolve import: %s", e)
        return None

    try:
        row = db.query(CtorBot).filter(CtorBot.id == platform_bot_id).first()
        if row is not None:
            return int(row.id)

        bot = db.query(Bot).filter(Bot.id == platform_bot_id).first()
        if bot is None:
            return None
        slug = (bot.username or "").strip().lstrip("@").lower()
        if slug:
            r2 = db.query(CtorBot).filter(CtorBot.slug == slug).first()
            if r2 is not None:
                return int(r2.id)
    except OperationalError as e:
        logger.warning("ctor_bot_resolve: DB operational error (ctor_* migrated?): %s", e)
        return None
    return None
