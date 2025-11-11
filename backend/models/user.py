from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.orm import relationship

from backend.database import Base

ROLES = ["owner", "admin", "developer", "templates_manager", "support", "viewer", "user"]


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=True)
    avatar = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    hashed_password = Column(String, nullable=True)  # NULL for OAuth-only users
    password_hash = Column(String, nullable=True)  # Alias for OAuth compatibility
    role = Column(String, default="viewer", nullable=False)
    email_verified_at = Column(DateTime, nullable=True)

    templates = relationship("Template", back_populates="user", cascade="all, delete")
    ratings = relationship("Rating", back_populates="user", cascade="all, delete")
    comments = relationship("Comment", back_populates="user", cascade="all, delete")
    purchases = relationship("Purchase", back_populates="user", cascade="all, delete")
    payments = relationship("Payment", back_populates="user", cascade="all, delete")
    owned_teams = relationship(
        "TeamMember", back_populates="owner", foreign_keys="[TeamMember.owner_id]"
    )
    member_in_teams = relationship(
        "TeamMember", back_populates="user", foreign_keys="[TeamMember.user_id]"
    )
    bots = relationship("Bot", back_populates="user", cascade="all, delete")
    bot_instances = relationship(
        "BotInstance", back_populates="user", cascade="all, delete"
    )
    user_templates = relationship(
        "UserTemplate", back_populates="owner", cascade="all, delete"
    )
    accounts = relationship(
        "Account", back_populates="user", cascade="all, delete-orphan"
    )
