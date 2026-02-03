"""Подключения каналов к боту (MAX, WhatsApp, Telegram и др.)."""
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from backend.database import Base


class BotChannelConnection(Base):
    """Подключение канала к боту: токены/секреты хранятся в credentials_json, в API не отдаются."""
    __tablename__ = "bot_channel_connections"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bots.id", ondelete="CASCADE"), nullable=False, index=True)
    channel = Column(String(32), nullable=False, index=True)  # max, whatsapp, telegram, ...
    is_enabled = Column(Boolean, default=True, nullable=False)
    credentials_json = Column(Text, nullable=True)  # write-only: токены/ключи, не возвращать в API
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    bot = relationship("Bot", back_populates="channel_connections")
