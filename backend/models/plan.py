"""
Модель тарифов (Plans) для ограничения возможностей пользователей.
"""
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, Numeric, String, Text

from backend.database import Base


class Plan(Base):
    """Тарифный план с лимитами."""
    __tablename__ = "plans"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(32), unique=True, nullable=False, index=True)  # free, pro, team
    name = Column(String(128), nullable=False)
    name_ru = Column(String(255), nullable=True)
    description_ru = Column(Text, nullable=True)
    price_month = Column(Numeric(10, 2), nullable=True)
    currency = Column(String(10), nullable=True, default="RUB")
    is_active = Column(Boolean, nullable=True, default=True)
    is_public = Column(Boolean, nullable=True, default=True)
    is_recommended = Column(Boolean, nullable=True, default=False)
    sort_order = Column(Integer, nullable=True, default=0)
    # Лимиты: max_bots, can_publish, can_use_analytics, max_team_members,
    # can_publish_templates, can_sell_templates, can_view_marketplace_stats
    limits = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
