"""Модели для соответствия 152-ФЗ: согласия пользователей на обработку ПДн."""
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text

from backend.database import Base


class Consent(Base):
    """Факт принятия пользователем документа (Политика ПДн, Пользовательское соглашение)."""
    __tablename__ = "consents"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    doc_type = Column(String(64), nullable=False)  # e.g. "privacy_policy", "terms"
    doc_version = Column(String(32), nullable=False)  # e.g. "1.0"
    accepted_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    ip = Column(String(45), nullable=True)  # IPv4 or IPv6
    user_agent = Column(Text, nullable=True)
