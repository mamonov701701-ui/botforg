"""Схемы пользовательского refund API (Этап 6.14.3.3 / 6.14.4)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RefundRequestCreateIn(BaseModel):
    checkout_intent_id: int = Field(..., ge=1)
    reason_category: str = Field(..., min_length=1, max_length=64)
    idempotency_key: str = Field(..., min_length=1, max_length=128)
    user_comment: str | None = Field(default=None, max_length=4000)
    payment_attempt_id: int | None = Field(default=None, ge=1)


class RefundRequestCancelIn(BaseModel):
    expected_version: int = Field(..., ge=1)
    reason: str | None = Field(default=None, max_length=1000)


class RefundRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    checkout_intent_id: int
    payment_attempt_id: int
    status: str
    reason_category: str
    user_comment: str | None = None
    current_revision_number: int
    version: int
    # Money as "190.00" / null when manual review placeholder.
    recommended_refund_amount: str | None = None
    currency: str | None = None
    refund_type: str | None = None
    calculation_status: str | None = None
    proposed_amount_undefined: bool = False
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime
    completed_at: datetime | None = None


class RefundablePurchaseOut(BaseModel):
    checkout_intent_id: int
    payment_attempt_id: int
    product_type: str
    product_code: str
    product_name: str
    amount: str
    currency: str
    paid_at: datetime | None = None
    current_refund_status: str | None = None
    current_refund_request_id: int | None = None
    can_request_refund: bool
    unavailable_reason: str | None = None


class RefundablePurchaseListOut(BaseModel):
    items: list[RefundablePurchaseOut]
    total: int
    limit: int
    offset: int
