"""Дедупликация входящих обновлений каналов (bot_id, channel, message_id)."""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from backend.database import Base


class ProcessedUpdate(Base):
    """Запись об обработанном входящем сообщении для идемпотентности webhook."""
    __tablename__ = "processed_updates"
    __table_args__ = (
        UniqueConstraint("bot_id", "channel", "message_id", name="uq_processed_updates_bot_channel_message"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id", ondelete="CASCADE"), nullable=False, index=True)
    channel = Column(String(32), nullable=False, index=True)
    message_id = Column(String(255), nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    bot = relationship("Bot", backref="processed_updates")
