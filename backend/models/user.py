from datetime import datetime, timezone
import random
import secrets

from sqlalchemy import Column, Date, DateTime, Integer, String, BigInteger, Boolean, Text, ForeignKey, JSON, event, text
from sqlalchemy.orm import relationship

from backend.database import Base

ROLES = ["owner", "admin", "developer", "templates_manager", "support", "viewer", "user"]

# Типы блокировок
SUSPENSION_TYPES = ["warning", "temporary", "permanent"]


class User(Base):
    __tablename__ = "users"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(BigInteger, unique=True, nullable=False, index=True, default=lambda: random.randint(10000000, 99999999))  # 8-значный публичный ID
    email = Column(String, unique=True, nullable=False, index=True)
    username = Column(String(30), nullable=True)
    username_key = Column(String(120), unique=True, nullable=True)
    name = Column(String, nullable=True)
    avatar = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    hashed_password = Column(String, nullable=True)  # NULL for OAuth-only users
    password_hash = Column(String, nullable=True)  # Alias for OAuth compatibility
    role = Column(String, default="user", nullable=False)
    email_verified_at = Column(DateTime, nullable=True)
    email_verification_required = Column(Boolean, default=False, nullable=False)
    date_of_birth = Column(Date, nullable=True)
    phone = Column(String(32), nullable=True)
    phone_verified_at = Column(DateTime, nullable=True)
    pending_email = Column(String(320), nullable=True)
    session_required = Column(Boolean, default=False, nullable=False)
    
    # Поля блокировки пользователя
    is_suspended = Column(Boolean, default=False)  # Приостановлен ли аккаунт
    suspension_type = Column(String, nullable=True)  # warning, temporary, permanent
    suspension_reason = Column(Text, nullable=True)  # Причина блокировки
    suspended_at = Column(DateTime, nullable=True)  # Когда заблокирован
    suspended_until = Column(DateTime, nullable=True)  # До какого времени (для временной)
    suspended_by_id = Column(Integer, nullable=True)  # Кто заблокировал (admin id)
    token_version = Column(Integer, default=0, nullable=False)  # 152-ФЗ: отзыв токенов при /privacy/delete
    plan_code = Column(String(32), default="free", nullable=False)  # free, pro, team

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
    settings = relationship(
        "UserSettings", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class UserSettings(Base):
    """Настройки личного кабинета: профиль, интерфейс, уведомления, BF Agent."""
    __tablename__ = "user_settings"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    language = Column(String(10), nullable=True, default="ru")
    timezone = Column(String(64), nullable=True, default="Europe/Moscow")
    two_factor_enabled = Column(Boolean, default=False, nullable=False)
    interface_settings = Column(JSON, nullable=True)  # { theme, density, fontSize, demo_content_created }
    notification_settings = Column(JSON, nullable=True)  # { email: {...}, telegram: {...} }
    agent_settings = Column(JSON, nullable=True)  # { enabled, mode, dataPolicy }
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="settings")


class ReservedPublicId(Base):
    """Permanent reservation: deleting an account never makes its public ID reusable."""
    __tablename__ = "reserved_user_public_ids"

    public_id = Column(BigInteger, primary_key=True)


@event.listens_for(User, "before_insert")
def reserve_public_id(_mapper, connection, target):
    for _ in range(32):
        candidate = target.public_id or (10_000_000 + secrets.randbelow(90_000_000))
        result = connection.execute(
            text("INSERT INTO reserved_user_public_ids (public_id) VALUES (:value) ON CONFLICT DO NOTHING"),
            {"value": candidate},
        )
        if result.rowcount == 1:
            target.public_id = candidate
            return
        if target.public_id is not None:
            raise ValueError("Public user ID is already reserved")
    raise RuntimeError("Unable to allocate public user ID")
