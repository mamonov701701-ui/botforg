"""Ежедневная очистка старых сообщений и событий по настройке retention (152-ФЗ)."""
import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy.orm import Session
from sqlalchemy import and_, delete

from backend.database import SessionLocal
from backend.models.bot import Bot
from backend.models.message import Message
from backend.models.event import Event
from backend.models.processed_update import ProcessedUpdate

logger = logging.getLogger(__name__)

PROCESSED_UPDATES_RETENTION_DAYS = 7


def run_retention_cleanup(db: Session) -> tuple[int, int, int]:
    """
    Удаляет сообщения и события старше срока хранения для каждого бота,
    и старые записи processed_updates (дедуп webhook).
    Возвращает (deleted_messages, deleted_events, deleted_processed_updates).
    """
    now = datetime.now(timezone.utc)
    deleted_messages = 0
    deleted_events = 0

    cutoff_processed = now - timedelta(days=PROCESSED_UPDATES_RETENTION_DAYS)
    r_pu = db.execute(delete(ProcessedUpdate).where(ProcessedUpdate.created_at < cutoff_processed))
    deleted_processed_updates = r_pu.rowcount or 0

    bots = db.query(Bot).all()
    for bot in bots:
        days = getattr(bot, "message_retention_days", 30) or 30
        cutoff = now - timedelta(days=days)

        # Сообщения бота (при store_messages=False в БД лежат строки с content='' — тоже чистим по сроку)
        r = db.execute(delete(Message).where(and_(Message.bot_id == bot.id, Message.created_at < cutoff)))
        deleted_messages += r.rowcount or 0

        # События по боту (агрегаты и аналитика) — очистка по сроку
        r2 = db.execute(delete(Event).where(and_(Event.bot_id == bot.id, Event.created_at < cutoff)))
        deleted_events += r2.rowcount or 0

    db.commit()
    if deleted_messages or deleted_events or deleted_processed_updates:
        logger.info(
            "retention_cleanup: deleted_messages=%s deleted_events=%s deleted_processed_updates=%s",
            deleted_messages,
            deleted_events,
            deleted_processed_updates,
        )
    return deleted_messages, deleted_events, deleted_processed_updates


def run_retention_cleanup_once() -> None:
    """Один запуск очистки (для вызова из cron или планировщика)."""
    db = SessionLocal()
    try:
        run_retention_cleanup(db)
    finally:
        db.close()
