from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.database import Base

class Bot(Base):
    __tablename__ = 'bots'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    title = Column(String, nullable=False)
    username = Column(String, nullable=False)
    token = Column(String, nullable=False)
    webhook_url = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    content = Column(JSON, nullable=True)  # Для хранения графа бота
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="bots")

# Оставляем старую модель для совместимости
class BotInstance(Base):
    __tablename__ = 'bot_instances'
    __table_args__ = {'extend_existing': True}
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    token = Column(String, nullable=False)
    username = Column(String, nullable=True)
    template_id = Column(Integer, ForeignKey('templates.id'), nullable=False)
    is_active = Column(Boolean, default=True)
    webhook_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship('User', back_populates='bot_instances')
    template = relationship('Template') 
