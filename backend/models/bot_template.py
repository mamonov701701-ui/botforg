from sqlalchemy import Column, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class BotTemplate(Base):
    __tablename__ = 'bot_templates'
    
    id = Column(Integer, primary_key=True, index=True)
    bot_id = Column(Integer, ForeignKey('bots.id', ondelete='CASCADE'), nullable=False)
    user_template_id = Column(Integer, ForeignKey('user_templates.id', ondelete='SET NULL'), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Связи
    bot = relationship("Bot", foreign_keys=[bot_id])
    user_template = relationship("UserTemplate", foreign_keys=[user_template_id])

