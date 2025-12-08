from datetime import datetime, timezone
import random

from sqlalchemy import JSON, BigInteger, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from backend.database import Base


class BotUserState(Base):
    __tablename__ = "bot_user_states"
    __table_args__ = {"extend_existing": True}
    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(BigInteger, unique=True, nullable=False, index=True, default=lambda: random.randint(100000000000, 999999999999))  # 12-значный публичный ID
    telegram_user_id = Column(String, index=True, nullable=False)
    bot_id = Column(Integer, ForeignKey("bot_instances.id"), nullable=False)
    
    # Канал связи
    channel = Column(String(20), default="telegram", nullable=False)  # telegram, vk, whatsapp, webchat
    
    # Статус подписчика
    status = Column(String(20), default="active", nullable=False, index=True)  # active, unsubscribed, banned, inactive
    
    # Текущий сценарий и узел
    current_scenario_id = Column(Integer, ForeignKey("scenarios.id"), nullable=True)
    current_node_id = Column(String, nullable=True)
    
    # Полный контекст выполнения (переменные, история и т.д.)
    context = Column(JSON, nullable=True)
    
    # История посещённых узлов
    history = Column(JSON, nullable=True)
    
    # Время последнего взаимодействия
    last_interaction_at = Column(DateTime, nullable=True, index=True)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    bot = relationship("BotInstance")
