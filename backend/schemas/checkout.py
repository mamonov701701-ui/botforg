"""Схемы checkout intent API (Этап 6.5)."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field


class CheckoutIntentCreateIn(BaseModel):
    product_type: Literal["tariff", "addon"]
    code: str = Field(..., min_length=1, max_length=64)
    idempotency_key: str = Field(..., min_length=1, max_length=128)


class CheckoutIntentOut(BaseModel):
    id: int
    product_type: str
    product_code: str
    product_name: str
    description: str | None = None
    amount: Decimal
    currency: str
    status: str
    idempotency_key: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
