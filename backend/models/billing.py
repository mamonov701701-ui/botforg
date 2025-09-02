from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime
from decimal import Decimal
from backend.database import Base

class BillingRecord(Base):
    __tablename__ = "billing_records"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    message_id = Column(Integer, ForeignKey("messages.id", ondelete="SET NULL"), nullable=True)

    action = Column(String(50))  # "message", "purchase", "subscription"
    direction = Column(String(10))  # "incoming" / "outgoing"
    is_paid = Column(Boolean, default=False)
    price = Column(Numeric(10, 2), default=Decimal("0.00"))

    created_at = Column(DateTime, default=datetime.utcnow)

    # Связи
    user = relationship("User", foreign_keys=[user_id])
    message = relationship("Message", foreign_keys=[message_id])


class UserQuota(Base):
    __tablename__ = "user_quotas"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True)

    monthly_limit = Column(Integer, default=1000)
    used_messages = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow)

    # Связи
    user = relationship("User", foreign_keys=[user_id])

