from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship
from backend.database import Base

class UserBonusAccount(Base):
    __tablename__ = 'user_bonus_accounts'
    user_id = Column(Integer, ForeignKey('users.id'), primary_key=True)
    total_earned = Column(Integer, default=0)
    total_spent = Column(Integer, default=0)
    available_balance = Column(Integer, default=0)

    user = relationship('User') 