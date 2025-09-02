from pydantic import BaseModel, constr
from enum import Enum
from typing import Optional
from decimal import Decimal
from datetime import datetime

class PaymentStatus(str, Enum):
    pending = "pending"
    success = "success"
    failed = "failed"

class PaymentType(str, Enum):
    purchase = "purchase"
    subscription = "subscription"
    messages = "messages"

class PaymentCreate(BaseModel):
    amount: Decimal
    currency: constr(min_length=1, max_length=10) = "RUB"
    type: PaymentType
    payload: constr(min_length=1, max_length=100)

class PaymentOut(BaseModel):
    id: int
    user_id: int
    amount: Decimal
    currency: str
    status: PaymentStatus
    type: PaymentType
    telegram_payment_charge_id: Optional[str]
    payload: str
    created_at: datetime

    class Config:
        from_attributes = True 
