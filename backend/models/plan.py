"""
Модель тарифов (Plans) для ограничения возможностей пользователей.
"""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, JSON, String

from backend.database import Base


class Plan(Base):
    """Тарифный план с лимитами."""
    __tablename__ = "plans"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(32), unique=True, nullable=False, index=True)  # free, pro, team
    name = Column(String(128), nullable=False)
    # Лимиты: max_bots, can_publish, can_use_analytics, max_team_members,
    # can_publish_templates, can_sell_templates, can_view_marketplace_stats
    limits = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
