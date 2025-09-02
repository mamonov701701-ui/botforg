from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.orm import relationship

from datetime import datetime
from typing import Optional
from backend.models.team import TeamMember
from backend.models.bot import BotInstance
from backend.database import Base

ROLES = ["owner", "admin", "manager", "developer", "support", "observer", "user"]

class User(Base):
    __tablename__ = "users"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="user", nullable=False)

    templates = relationship("Template", back_populates="user", cascade="all, delete")
    ratings = relationship("Rating", back_populates="user", cascade="all, delete")
    comments = relationship("Comment", back_populates="user", cascade="all, delete")
    purchases = relationship("Purchase", back_populates="user", cascade="all, delete")
    payments = relationship("Payment", back_populates="user", cascade="all, delete")
    owned_teams = relationship("TeamMember", back_populates="owner", foreign_keys="[TeamMember.owner_id]")
    member_in_teams = relationship("TeamMember", back_populates="user", foreign_keys="[TeamMember.user_id]")
    bots = relationship('Bot', back_populates='user', cascade='all, delete')
    bot_instances = relationship('BotInstance', back_populates='user', cascade='all, delete')
    user_templates = relationship('UserTemplate', back_populates='owner', cascade='all, delete') 
