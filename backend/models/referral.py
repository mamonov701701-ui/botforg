from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.database import Base

class Referral(Base):
    __tablename__ = 'referrals'
    id = Column(Integer, primary_key=True, index=True)
    referrer_user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    referred_user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    template_id = Column(Integer, ForeignKey('templates.id'), nullable=False)
    reward = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    referrer = relationship('User', foreign_keys=[referrer_user_id])
    referred = relationship('User', foreign_keys=[referred_user_id])
    template = relationship('Template') 