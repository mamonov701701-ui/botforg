from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, field_validator
from pydantic.config import ConfigDict


class BillingBase(BaseModel):
    user_id: int
    message_id: Optional[int] = None
    action: str
    direction: str
    is_paid: bool = False
    price: Decimal = Decimal("0.00")

    @field_validator("user_id")
    @classmethod
    def validate_user_id(cls, v):
        if v <= 0:
            raise ValueError("User ID must be positive")
        return v

    @field_validator("message_id")
    @classmethod
    def validate_message_id(cls, v):
        if v is not None and v <= 0:
            raise ValueError("Message ID must be positive")
        return v

    @field_validator("action")
    @classmethod
    def validate_action(cls, v):
        if v not in ["message", "purchase", "subscription"]:
            raise ValueError("Action must be one of: message, purchase, subscription")
        return v

    @field_validator("direction")
    @classmethod
    def validate_direction(cls, v):
        if v not in ["incoming", "outgoing"]:
            raise ValueError('Direction must be either "incoming" or "outgoing"')
        return v

    @field_validator("price")
    @classmethod
    def validate_price(cls, v):
        if v < 0:
            raise ValueError("Price cannot be negative")
        return v


class BillingCreate(BillingBase):
    pass


class BillingOut(BaseModel):
    id: int
    user_id: int
    message_id: Optional[int] = None
    direction: str
    action: str
    price: Decimal
    is_paid: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class BillingListOut(BaseModel):
    total: int
    items: list[BillingOut]


class UserQuotaOut(BaseModel):
    id: int
    user_id: int
    monthly_limit: int
    used_messages: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserQuotaUpdate(BaseModel):
    monthly_limit: Optional[int] = None
    used_messages: Optional[int] = None

    @field_validator("monthly_limit")
    @classmethod
    def validate_monthly_limit(cls, v):
        if v is not None and v < 0:
            raise ValueError("Monthly limit cannot be negative")
        return v

    @field_validator("used_messages")
    @classmethod
    def validate_used_messages(cls, v):
        if v is not None and v < 0:
            raise ValueError("Used messages cannot be negative")
        return v
