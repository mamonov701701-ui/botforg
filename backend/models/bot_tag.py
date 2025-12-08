"""
Модели для системы тегов пользователей ботов
"""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Table
from sqlalchemy.orm import relationship

from backend.database import Base

# Таблица связи многие-ко-многим между контактами и тегами
bot_contact_tags = Table(
    "bot_contact_tags",
    Base.metadata,
    Column("bot_contact_id", Integer, ForeignKey("bot_user_states.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("bot_tags.id", ondelete="CASCADE"), primary_key=True),
    Column("assigned_at", DateTime, default=lambda: datetime.now(timezone.utc)),
    extend_existing=True,
)


class BotTag(Base):
    """
    Справочник тегов для бота
    Каждый бот может иметь свой набор тегов
    """
    __tablename__ = "bot_tags"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey("bot_instances.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)  # Название тега (например, "VIP", "интересуется_скидками")
    description = Column(String(255), nullable=True)  # Описание тега (опционально)
    color = Column(String(7), nullable=True)  # Цвет тега в UI (hex, например "#3b82f6")
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    bot = relationship("BotInstance")
    contacts = relationship(
        "BotUserState",
        secondary=bot_contact_tags,
        back_populates="tags"
    )

