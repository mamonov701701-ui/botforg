"""Схемы checkout intent API (Этап 6.5)."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from backend.services.addon_custom_pack import MAX_CUSTOM_QUANTITY, MIN_CUSTOM_QUANTITY


class CheckoutIntentCreateIn(BaseModel):
    product_type: Literal["tariff", "addon"]
    code: str = Field(..., min_length=1, max_length=64)
    idempotency_key: str = Field(..., min_length=1, max_length=128)
    # Custom message pack only. Ignored/rejected for fixed catalog items.
    quantity: int | None = Field(
        default=None, ge=MIN_CUSTOM_QUANTITY, le=MAX_CUSTOM_QUANTITY
    )


class ConfirmAddonTermsIn(BaseModel):
    """User acknowledgment of locked custom-pack quote before payment."""

    confirmed_amount: Decimal
    confirmed_currency: str = Field(default="RUB", min_length=1, max_length=10)
    confirmed_quantity: int = Field(
        ..., ge=MIN_CUSTOM_QUANTITY, le=MAX_CUSTOM_QUANTITY
    )


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
    payment_provider: str | None = None
    provider_payment_id: str | None = None
    paid_at: datetime | None = None
    fulfilled_at: datetime | None = None
    failed_at: datetime | None = None
    cancelled_at: datetime | None = None
    refunded_at: datetime | None = None
    fulfilled_subscription_id: int | None = None
    fulfilled_addon_id: int | None = None
    created_at: datetime
    updated_at: datetime
    # Purchase snapshot (nullable on legacy rows).
    product_units: int | None = None
    price_grid_snapshot: dict | None = None
    terms_confirmed: bool = False
    terms_confirmed_at: datetime | None = None

    class Config:
        from_attributes = True


class CheckoutPurchaseListItemOut(BaseModel):
    """Compact purchase-history row (Этап 8.3.1). Без secrets / raw provider payload."""

    id: int
    created_at: datetime
    product_type: str
    product_code: str
    product_name: str
    amount: Decimal
    currency: str
    intent_status: str
    purchase_status: str
    paid_at: datetime | None = None
    fulfilled_at: datetime | None = None
    cancelled_at: datetime | None = None
    refunded_at: datetime | None = None
    failed_at: datetime | None = None
    payment_provider: str | None = None
    latest_attempt_status: str | None = None
    fulfilled_subscription_id: int | None = None
    fulfilled_addon_id: int | None = None
    fulfillment_result_type: Literal["subscription", "addon"] | None = None


class CheckoutPurchaseListOut(BaseModel):
    items: list[CheckoutPurchaseListItemOut]
    total: int
    limit: int
    offset: int
