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


def ensure_ctor_bot_id(db: Session, platform_bot_id: int) -> Optional[int]:
    """
    Возвращает ctor_bot_id; если связки нет — создаёт минимальную запись ctor_bots
    и системные переменные на основе platform bots/users.
    """
    cid = resolve_ctor_bot_id(db, platform_bot_id)
    if cid:
        return cid
    try:
        from backend.models.bot import Bot
        from backend.models.constructor_core import CtorBot, PlatformUser
        from backend.models.user import User
        from backend.seeds.constructor_system_variables import ensure_system_variable_definitions
    except Exception as e:
        logger.warning("ensure_ctor_bot_id import failed: %s", e)
        return None
    try:
        bot = db.query(Bot).filter(Bot.id == platform_bot_id).first()
        if bot is None:
            return None
        owner = db.query(PlatformUser).filter(PlatformUser.id == bot.owner_id).first()
        if owner is None:
            legacy_user = db.query(User).filter(User.id == bot.owner_id).first()
            email = (
                legacy_user.email
                if legacy_user and getattr(legacy_user, "email", None)
                else f"owner_{bot.owner_id}@local.invalid"
            )
            owner = PlatformUser(
                id=bot.owner_id,
                email=email,
                name=getattr(legacy_user, "name", None) if legacy_user else None,
            )
            db.add(owner)
            db.flush()
        slug = (bot.username or f"bot_{bot.id}").strip().lstrip("@").lower()
        if not slug:
            slug = f"bot_{bot.id}"
        exists_slug = db.query(CtorBot).filter(CtorBot.slug == slug).first()
        if exists_slug is not None:
            suffix = 1
            base = slug
            while db.query(CtorBot).filter(CtorBot.slug == f"{base}_{suffix}").first() is not None:
                suffix += 1
            slug = f"{base}_{suffix}"
        ctor = CtorBot(
            id=bot.id,
            owner_id=bot.owner_id,
            name=bot.title or bot.username or f"Bot {bot.id}",
            slug=slug,
            status="draft",
        )
        db.add(ctor)
        db.flush()
        ensure_system_variable_definitions(db, ctor.id)
        db.commit()
        return int(ctor.id)
    except OperationalError as e:
        logger.warning("ensure_ctor_bot_id operational error: %s", e)
        db.rollback()
        return None
    except Exception as e:
        logger.warning("ensure_ctor_bot_id failed: %s", e)
        db.rollback()
        return None
