from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.database import Base

class Message(Base):
    __tablename__ = 'messages'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey('bots.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    direction = Column(String(10), nullable=False)  # 'incoming', 'outgoing'
    content = Column(Text, nullable=False)
    status = Column(String(20), default='sent')  # 'sent', 'received', 'error'
    error = Column(Text, nullable=True)
    language = Column(String(10), nullable=True)  # 'ru', 'en', etc.
    is_paid = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Связи
    bot = relationship("Bot", foreign_keys=[bot_id])
    user = relationship("User", foreign_keys=[user_id])

