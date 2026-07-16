"""
Тарифная система BotForg: каталог пакетов, подписки, usage, подарки, аудит админки.

Таблицы создаются на Этапе 3 (Alembic). До миграции модели только регистрируются в metadata.
"""
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Enum as SQLEnum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from backend.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


# --- Enums ---


class AddonPackageType(str, Enum):
    """Тип пакета расширения лимитов."""
    MESSAGES = "messages"
    ACTIVE_BOT = "active_bot"
    TEAM_MEMBER = "team_member"


class SubscriptionStatus(str, Enum):
    """Статус подписки пользователя на тариф."""
    ACTIVE = "active"
    TRIALING = "trialing"
    PAST_DUE = "past_due"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class UserAddonStatus(str, Enum):
    """Статус активного пакета у пользователя."""
    ACTIVE = "active"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class UserAddonSource(str, Enum):
    """Источник подключения пакета."""
    PURCHASE = "purchase"
    GIFT = "gift"
    ADMIN = "admin"
    PROMO = "promo"


class GiftType(str, Enum):
    """Тип подарочного начисления."""
    PLAN = "plan"
    ADDON = "addon"
    MESSAGES = "messages"
    ACTIVE_BOT = "active_bot"
    TEAM_MEMBER = "team_member"


class GiftGrantStatus(str, Enum):
    """Статус подарочного начисления."""
    ACTIVE = "active"
    SCHEDULED = "scheduled"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


def _value_enum(enum_cls):
    """SQLAlchemy Enum: persist/read PEP-435 .value (matches Alembic seed), not .name."""
    return SQLEnum(
        enum_cls,
        values_callable=lambda cls: [item.value for item in cls],
    )


class AddonPackage(Base):
    """Каталог пакетов расширения (сообщения, боты, участники команды)."""
    __tablename__ = "addon_packages"
    __table_args__ = (
        Index("ix_addon_packages_code", "code", unique=True),
        Index("ix_addon_packages_type", "type"),
        Index("ix_addon_packages_is_active", "is_active"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(64), unique=True, nullable=False, index=True)
    name_ru = Column(String(255), nullable=False)
    description_ru = Column(Text, nullable=True)
    type = Column(_value_enum(AddonPackageType), nullable=False)
    amount = Column(Integer, nullable=False, default=0)
    price = Column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    currency = Column(String(10), nullable=False, default="RUB")
    duration_type = Column(String(64), nullable=False, default="current_billing_period")
    available_from_plan = Column(JSON, nullable=True)
    max_per_period = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_public = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    user_addons = relationship("UserAddon", back_populates="addon_package")
    gift_grants = relationship("GiftGrant", back_populates="addon_package")


class UserSubscription(Base):
    """Подписка пользователя на тарифный план."""
    __tablename__ = "user_subscriptions"
    __table_args__ = (
        Index("ix_user_subscriptions_user_id", "user_id"),
        Index("ix_user_subscriptions_plan_id", "plan_id"),
        Index("ix_user_subscriptions_status", "status"),
        Index(
            "ix_user_subscriptions_user_period",
            "user_id",
            "current_period_start",
            "current_period_end",
        ),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    workspace_id = Column(Integer, nullable=True)
    plan_id = Column(Integer, ForeignKey("plans.id", ondelete="RESTRICT"), nullable=False)
    status = Column(
        _value_enum(SubscriptionStatus),
        default=SubscriptionStatus.ACTIVE,
        nullable=False,
    )
    current_period_start = Column(DateTime, nullable=False)
    current_period_end = Column(DateTime, nullable=False)
    auto_renew = Column(Boolean, default=True, nullable=False)
    payment_provider = Column(String(64), nullable=True)
    provider_subscription_id = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)
    cancelled_at = Column(DateTime, nullable=True)

    user = relationship("User", foreign_keys=[user_id], backref="tariff_subscriptions")
    plan = relationship("Plan", backref="user_subscriptions")


class UserAddon(Base):
    """Активный пакет расширения у пользователя на расчётный период."""
    __tablename__ = "user_addons"
    __table_args__ = (
        Index("ix_user_addons_user_id", "user_id"),
        Index("ix_user_addons_addon_package_id", "addon_package_id"),
        Index("ix_user_addons_status", "status"),
        Index("ix_user_addons_period", "period_start", "period_end"),
        Index("ix_user_addons_provider_ref", "provider_ref", unique=True),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    workspace_id = Column(Integer, nullable=True)
    addon_package_id = Column(
        Integer, ForeignKey("addon_packages.id", ondelete="RESTRICT"), nullable=False
    )
    amount = Column(Integer, nullable=False, default=0)
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)
    status = Column(
        _value_enum(UserAddonStatus),
        default=UserAddonStatus.ACTIVE,
        nullable=False,
    )
    source = Column(_value_enum(UserAddonSource), nullable=False)
    provider_ref = Column(String(255), nullable=True, unique=True)
    created_by_admin_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_id], backref="tariff_addons")
    addon_package = relationship("AddonPackage", back_populates="user_addons")
    created_by_admin = relationship("User", foreign_keys=[created_by_admin_id])


class UsageCounter(Base):
    """Учёт использования лимитов за расчётный период (без списания в runtime на этом этапе)."""
    __tablename__ = "usage_counters"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "period_start",
            "period_end",
            name="uq_usage_counters_user_period",
        ),
        Index("ix_usage_counters_user_id", "user_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    workspace_id = Column(Integer, nullable=True)
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)
    messages_used = Column(Integer, default=0, nullable=False)
    active_bots_used = Column(Integer, default=0, nullable=False)
    team_members_used = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_id], backref="usage_counters")


class GiftGrant(Base):
    """Подарочное начисление тарифа или пакета администратором платформы."""
    __tablename__ = "gift_grants"
    __table_args__ = (
        Index("ix_gift_grants_target_user_id", "target_user_id"),
        Index("ix_gift_grants_status", "status"),
        Index("ix_gift_grants_granted_by_user_id", "granted_by_user_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    target_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    target_workspace_id = Column(Integer, nullable=True)
    gift_type = Column(_value_enum(GiftType), nullable=False)
    plan_id = Column(Integer, ForeignKey("plans.id", ondelete="SET NULL"), nullable=True)
    addon_package_id = Column(
        Integer, ForeignKey("addon_packages.id", ondelete="SET NULL"), nullable=True
    )
    amount = Column(Integer, nullable=True)
    starts_at = Column(DateTime, nullable=False)
    ends_at = Column(DateTime, nullable=False)
    granted_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    reason = Column(Text, nullable=True)
    admin_comment = Column(Text, nullable=True)
    status = Column(
        _value_enum(GiftGrantStatus),
        default=GiftGrantStatus.ACTIVE,
        nullable=False,
    )
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    target_user = relationship("User", foreign_keys=[target_user_id], backref="gift_grants_received")
    plan = relationship("Plan", backref="gift_grants")
    addon_package = relationship("AddonPackage", back_populates="gift_grants")
    granted_by = relationship(
        "User", foreign_keys=[granted_by_user_id], backref="gift_grants_issued"
    )


class AdminAuditLog(Base):
    """Журнал действий администратора с тарифами, пакетами и подарками."""
    __tablename__ = "admin_audit_log"
    __table_args__ = (
        Index("ix_admin_audit_log_admin_user_id", "admin_user_id"),
        Index("ix_admin_audit_log_entity", "entity_type", "entity_id"),
        Index("ix_admin_audit_log_created_at", "created_at"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    admin_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    action = Column(String(64), nullable=False)
    entity_type = Column(String(64), nullable=False)
    entity_id = Column(Integer, nullable=True)
    old_value = Column(JSON, nullable=True)
    new_value = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False, index=True)
    comment = Column(Text, nullable=True)

    admin_user = relationship("User", foreign_keys=[admin_user_id], backref="tariff_admin_audit_logs")
