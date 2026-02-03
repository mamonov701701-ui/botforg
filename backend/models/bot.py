from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from backend.database import Base


class Bot(Base):
    __tablename__ = "bots"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)  # Описание бота
    username = Column(String, nullable=False)
    token = Column(String, nullable=False)
    webhook_url = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    content = Column(JSON, nullable=True)  # Для хранения графа бота
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    
    # 152-ФЗ: срок хранения сообщений (дней), по умолчанию 30 (применяется при store_messages=True)
    message_retention_days = Column(Integer, default=30, nullable=False)
    # 152-ФЗ / AI safety: разрешить отправку текста пользователей в AI (по умолчанию OFF)
    allow_ai_text = Column(Boolean, default=False, nullable=False)
    # Режим минимального хранения ПДн: хранить тексты сообщений (OFF = только агрегаты)
    store_messages = Column(Boolean, default=False, nullable=False)

    # Поля блокировки бота
    is_suspended = Column(Boolean, default=False)  # Приостановлен ли бот
    suspension_type = Column(String, nullable=True)  # warning, temporary, permanent
    suspension_reason = Column(Text, nullable=True)  # Причина блокировки
    suspended_at = Column(DateTime, nullable=True)  # Когда заблокирован
    suspended_until = Column(DateTime, nullable=True)  # До какого времени
    suspended_by_id = Column(Integer, nullable=True)  # Кто заблокировал

    user = relationship("User", back_populates="bots")
    channel_connections = relationship(
        "BotChannelConnection",
        back_populates="bot",
        cascade="all, delete-orphan",
    )


# Оставляем старую модель для совместимости
class BotInstance(Base):
    __tablename__ = "bot_instances"
    __table_args__ = {"extend_existing": True}
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String, nullable=False)
    username = Column(String, nullable=True)
    template_id = Column(Integer, ForeignKey("templates.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    webhook_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="bot_instances")
    template = relationship("Template")
