from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.database import Base

class BotUserState(Base):
    __tablename__ = 'bot_user_states'
    id = Column(Integer, primary_key=True, index=True)
    telegram_user_id = Column(String, index=True, nullable=False)
    bot_id = Column(Integer, ForeignKey('bot_instances.id'), nullable=False)
    current_node_id = Column(String, nullable=True)
    history = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    bot = relationship('BotInstance') 