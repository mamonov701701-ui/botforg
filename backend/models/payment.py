from sqlalchemy import Column, Integer, String, ForeignKey, Numeric, DateTime, Enum
from sqlalchemy.orm import relationship
from backend.database import Base
import enum
from datetime import datetime

class PaymentStatus(str, enum.Enum):
    pending = "pending"
    success = "success"
    failed = "failed"

class PaymentType(str, enum.Enum):
    purchase = "purchase"
    subscription = "subscription"
    messages = "messages"

class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(10), default="RUB")
    status = Column(Enum(PaymentStatus), default=PaymentStatus.pending)
    type = Column(Enum(PaymentType), nullable=False)
    telegram_payment_charge_id = Column(String(100), nullable=True)
    payload = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="payments") 
