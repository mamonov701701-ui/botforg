from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, constr, field_validator


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

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v):
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v


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

    model_config = ConfigDict(from_attributes=True)
