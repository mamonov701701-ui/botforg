"""
Админ-схемы журнала платёжных операций (Этап 6.11.3).

Без credentials, ciphertext, raw provider payload и внутренних исключений.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PaymentOperationListItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    checkout_intent_id: int
    user_id: int
    user_email: str | None = None
    product_type: str
    product_code: str
    product_name: str
    amount: str
    currency: str
    status: str
    payment_provider: str | None = None
    provider_payment_id: str | None = None
    latest_attempt_status: str | None = None
    attempt_count: int = 0
    webhook_event_count: int = 0
    fulfilled: bool = False
    created_at: datetime | None = None
    paid_at: datetime | None = None
    fulfilled_at: datetime | None = None
    cancelled_at: datetime | None = None


class PaymentOperationListOut(BaseModel):
    items: list[PaymentOperationListItemOut]
    total: int
    limit: int
    offset: int


class ConnectionSummaryOut(BaseModel):
    """Безопасное описание connection — без ciphertext/nonce/секретов."""

    id: int
    provider_code: str
    connection_name: str
    mode: str
    enabled: bool
    verified: bool
    is_default: bool
    currency: str | None = None
    public_identifier_masked: str | None = None
    has_credentials: bool = False
    adapter_status: str | None = None


class PaymentAttemptAdminOut(BaseModel):
    id: int
    checkout_intent_id: int
    user_id: int
    provider: str
    connection_id: int | None = None
    provider_payment_id: str | None = None
    amount: str
    currency: str
    status: str
    idempotency_key: str
    confirmation_url: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    connection: ConnectionSummaryOut | None = None


class WebhookEventAdminOut(BaseModel):
    """Webhook без raw payload."""

    id: int
    provider: str
    provider_event_id: str
    event_type: str
    process_status: str
    error_message: str | None = None
    payment_attempt_id: int | None = None
    checkout_intent_id: int | None = None
    processed_at: datetime | None = None
    created_at: datetime | None = None


class SubscriptionSummaryOut(BaseModel):
    id: int
    user_id: int
    plan_id: int
    plan_code: str | None = None
    status: str
    current_period_start: datetime | None = None
    current_period_end: datetime | None = None
    payment_provider: str | None = None
    provider_subscription_id: str | None = None
    created_at: datetime | None = None


class AddonSummaryOut(BaseModel):
    id: int
    user_id: int
    addon_package_id: int
    addon_code: str | None = None
    amount: int
    status: str
    source: str
    provider_ref: str | None = None
    period_start: datetime | None = None
    period_end: datetime | None = None
    created_at: datetime | None = None


class FulfillmentSummaryOut(BaseModel):
    status: str
    fulfilled: bool
    paid_at: datetime | None = None
    fulfilled_at: datetime | None = None
    failed_at: datetime | None = None
    cancelled_at: datetime | None = None
    fulfilled_subscription_id: int | None = None
    fulfilled_addon_id: int | None = None
    subscription: SubscriptionSummaryOut | None = None
    addon: AddonSummaryOut | None = None


class PaymentOperationDetailOut(BaseModel):
    checkout_intent_id: int
    user_id: int
    user_email: str | None = None
    product_type: str
    product_code: str
    product_name: str
    description: str | None = None
    amount: str
    currency: str
    status: str
    idempotency_key: str
    payment_provider: str | None = None
    provider_payment_id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    product_units: int | None = None
    price_grid_snapshot: dict | None = None
    terms_confirmed: bool = False
    attempts: list[PaymentAttemptAdminOut] = Field(default_factory=list)
    webhook_events: list[WebhookEventAdminOut] = Field(default_factory=list)
    fulfillment: FulfillmentSummaryOut
    model_config = ConfigDict(extra="forbid")
