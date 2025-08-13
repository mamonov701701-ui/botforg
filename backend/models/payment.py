from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.database import Base

class Payment(Base):
    __tablename__ = 'payments'
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    bot_id = Column(Integer, ForeignKey('bot_instances.id'), nullable=True)
    template_id = Column(Integer, ForeignKey('templates.id'), nullable=True)
    amount = Column(Integer, nullable=False)
    currency = Column(String, default='RUB')
    status = Column(String, default='pending')
    reference = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship('User', back_populates='payments')
    bot = relationship('BotInstance')
    template = relationship('Template') 