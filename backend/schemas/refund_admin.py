"""Админские схемы refund API (Этап 6.14.3.4 read / 6.14.3.5 write)."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RefundAdminListItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    user_email: str | None = None
    checkout_intent_id: int
    payment_attempt_id: int
    status: str
    reason_category: str
    user_comment: str | None = None
    current_revision_number: int
    approved_revision_id: int | None = None
    version: int
    recommended_refund_amount: str | None = None
    proposed_amount_undefined: bool = False
    manual_review_required: bool = False
    product_type: str | None = None
    product_code: str | None = None
    product_name: str | None = None
    amount: str | None = None
    currency: str | None = None
    refund_type: str | None = None
    calculation_status: str | None = None
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime
    completed_at: datetime | None = None


class RefundAdminListOut(BaseModel):
    items: list[RefundAdminListItemOut]
    total: int
    limit: int
    offset: int


class RefundAdminUserOut(BaseModel):
    id: int
    public_id: int | None = None
    email: str
    name: str | None = None
    role: str | None = None
    # Legacy users.plan_code — не путать с текущим effective тарифом.
    plan_code: str | None = None
    effective_plan_code: str | None = None
    effective_plan_name: str | None = None
    is_suspended: bool = False
    created_at: datetime | None = None


class RefundAdminCheckoutIntentOut(BaseModel):
    id: int
    user_id: int
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
    paid_at: datetime | None = None
    fulfilled_at: datetime | None = None
    failed_at: datetime | None = None
    cancelled_at: datetime | None = None
    refunded_at: datetime | None = None
    fulfilled_subscription_id: int | None = None
    fulfilled_addon_id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class RefundAdminPaymentAttemptOut(BaseModel):
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


class RefundAdminProductOut(BaseModel):
    product_type: str
    product_code: str
    product_name: str
    amount: str
    currency: str
    product_units: int | None = None
    validity_days: int | None = None
    duration_kind: str | None = None
    terms_confirmed: bool = False
    terms_confirmed_at: str | None = None
    purchase_kind: str | None = None
    average_unit_price: str | None = None
    pricing_grid_version_id: int | None = None


class RefundAdminRequestCoreOut(BaseModel):
    id: int
    user_id: int
    checkout_intent_id: int
    payment_attempt_id: int
    status: str
    reason_category: str
    user_comment: str | None = None
    current_revision_number: int
    approved_revision_id: int | None = None
    version: int
    recommended_refund_amount: str | None = None
    proposed_amount_undefined: bool = False
    manual_review_required: bool = False
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime
    completed_at: datetime | None = None


class RefundAdminRevisionOut(BaseModel):
    id: int
    refund_request_id: int
    revision_number: int
    revision_type: str
    created_by_user_id: int | None = None
    based_on_revision_id: int | None = None
    calculation_status: str
    refund_type: str
    currency: str
    paid_amount: str
    prior_refunded_amount: str
    proposed_refund_amount: str | None = None
    final_refund_amount: str | None = None
    proposed_amount_undefined: bool = False
    calculation_at: datetime
    period_start: datetime | None = None
    period_end: datetime | None = None
    used_time_seconds: int | None = None
    total_time_seconds: int | None = None
    addon_total_units: int | None = None
    addon_used_units: int | None = None
    addon_revoke_units: int | None = None
    entitlement_action: str
    entitlement_effective_at: datetime | None = None
    adjustment_reason_category: str | None = None
    adjustment_comment: str | None = None
    calculation_snapshot: dict[str, Any] | None = None
    entitlement_snapshot: dict[str, Any] | None = None
    usage_snapshot: dict[str, Any] | None = None
    created_at: datetime


class RefundAdminAuditEventOut(BaseModel):
    id: int
    refund_request_id: int
    refund_revision_id: int | None = None
    actor_user_id: int | None = None
    actor_type: str
    action: str
    # 6.14.10A — русское название для UI.
    title: str | None = None
    previous_status: str | None = None
    new_status: str | None = None
    changed_fields: Any = None
    reason: str | None = None
    # Whitelist-проекция (не полный event_metadata).
    event_metadata: Any = None
    details: dict[str, Any] | None = None
    created_at: datetime


class RefundAdminDetailOut(BaseModel):
    request: RefundAdminRequestCoreOut
    user: RefundAdminUserOut | None = None
    checkout_intent: RefundAdminCheckoutIntentOut | None = None
    payment_attempt: RefundAdminPaymentAttemptOut | None = None
    product: RefundAdminProductOut | None = None
    usage_snapshot: dict[str, Any] | None = None
    financial_snapshot: dict[str, Any] | None = None
    current_revision: RefundAdminRevisionOut | None = None
    approved_revision: RefundAdminRevisionOut | None = None
    revisions: list[RefundAdminRevisionOut] = Field(default_factory=list)
    audit_timeline: list[RefundAdminAuditEventOut] = Field(default_factory=list)


# --- Write inputs (6.14.3.5) ---


class RefundAdminExpectedVersionIn(BaseModel):
    expected_version: int = Field(..., ge=1)


class RefundAdminRecalculateIn(RefundAdminExpectedVersionIn):
    pass


class RefundAdminEditIn(BaseModel):
    expected_version: int = Field(..., ge=1)
    based_on_revision_id: int = Field(..., ge=1)
    # Required for tariff; for addon derive from addon_revoke_units.
    proposed_refund_amount: Decimal | None = None
    adjustment_reason_category: str = Field(..., min_length=1, max_length=64)
    adjustment_comment: str = Field(..., min_length=1, max_length=4000)
    refund_type: str | None = Field(default=None, max_length=32)
    entitlement_action: str | None = Field(default=None, max_length=64)
    entitlement_effective_at: datetime | None = None
    # Required for addon correction (units-first).
    addon_revoke_units: int | None = Field(default=None, ge=0)


class RefundAdminEntitlementRecoveryIn(BaseModel):
    """Post-money entitlement/reservation recovery (no provider call)."""

    expected_version: int = Field(..., ge=1)
    addon_revoke_units: int = Field(..., gt=0)
    adjustment_comment: str = Field(..., min_length=1, max_length=4000)


class RefundAdminEntitlementRecoveryOut(BaseModel):
    confirmed_refunded_amount: str
    equivalent_units_money: str
    money_units_delta: str
    addon_revoke_units: int
    entitlement_action: str
    detail: RefundAdminDetailOut



class RefundAdminNeedsInformationIn(BaseModel):
    expected_version: int = Field(..., ge=1)
    reason: str = Field(..., min_length=1, max_length=2000)


class RefundAdminRejectIn(BaseModel):
    expected_version: int = Field(..., ge=1)
    reason: str = Field(..., min_length=1, max_length=2000)


class RefundAdminConfirmIn(RefundAdminExpectedVersionIn):
    pass


class RefundAdminApproveIn(BaseModel):
    expected_version: int = Field(..., ge=1)
    revision_id: int = Field(..., ge=1)


class RefundAdminExecuteIn(RefundAdminExpectedVersionIn):
    """Запуск provider refund для approved / recoverable заявки (6.14.6)."""

    pass


class RefundAdminExecuteOut(BaseModel):
    outcome: str
    provider_refund_id: str | None = None
    ledger_entry_id: int | None = None
    already_completed: bool = False
    detail: RefundAdminDetailOut


class RefundAdminApplyEntitlementIn(RefundAdminExpectedVersionIn):
    """Применение изменения доступа после money-confirmed возврата (6.14.8)."""

    pass


class RefundAdminApplyEntitlementOut(BaseModel):
    outcome: str
    applied_action: str
    target_type: str | None = None
    target_id: int | None = None
    already_applied: bool = False
    error_code: str | None = None
    error_message: str | None = None
    detail: RefundAdminDetailOut
