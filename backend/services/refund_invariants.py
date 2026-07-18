"""
Service-level invariants for refund data foundation (Этап 6.14.1).

Нет provider calls, formula calc или entitlement revoke — только проверки моделей.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable

from backend.models.refund import (
    REFUND_FINANCIAL_FROZEN_STATUSES,
    REFUND_TERMINAL_STATUSES,
    RefundRequest,
    RefundRequestStatus,
    RefundRevision,
)

MONEY_QUANT = Decimal("0.01")


class RefundInvariantError(Exception):
    def __init__(self, message: str, *, code: str) -> None:
        self.message = message
        self.code = code
        super().__init__(message)


# Allowed transitions for data-foundation / future workflow (subset enforced early).
ALLOWED_STATUS_TRANSITIONS: dict[str, frozenset[str]] = {
    RefundRequestStatus.SUBMITTED.value: frozenset(
        {
            RefundRequestStatus.CALCULATING.value,
            RefundRequestStatus.CANCELED.value,
        }
    ),
    RefundRequestStatus.CALCULATING.value: frozenset(
        {
            RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
            RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value,
            RefundRequestStatus.CALCULATION_FAILED.value,
            RefundRequestStatus.CANCELED.value,
        }
    ),
    RefundRequestStatus.AWAITING_ADMIN_REVIEW.value: frozenset(
        {
            RefundRequestStatus.ADMIN_EDITED.value,
            RefundRequestStatus.AWAITING_FINAL_CONFIRMATION.value,
            RefundRequestStatus.APPROVED.value,
            RefundRequestStatus.NEEDS_INFORMATION.value,
            RefundRequestStatus.REJECTED.value,
            RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value,
            RefundRequestStatus.CANCELED.value,
        }
    ),
    RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value: frozenset(
        {
            RefundRequestStatus.ADMIN_EDITED.value,
            RefundRequestStatus.AWAITING_FINAL_CONFIRMATION.value,
            RefundRequestStatus.NEEDS_INFORMATION.value,
            RefundRequestStatus.REJECTED.value,
            RefundRequestStatus.CANCELED.value,
        }
    ),
    RefundRequestStatus.ADMIN_EDITED.value: frozenset(
        {
            RefundRequestStatus.AWAITING_FINAL_CONFIRMATION.value,
            RefundRequestStatus.NEEDS_INFORMATION.value,
            RefundRequestStatus.REJECTED.value,
            RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
            RefundRequestStatus.CANCELED.value,
        }
    ),
    RefundRequestStatus.NEEDS_INFORMATION.value: frozenset(
        {
            RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
            RefundRequestStatus.ADMIN_EDITED.value,
            RefundRequestStatus.CANCELED.value,
            RefundRequestStatus.REJECTED.value,
        }
    ),
    RefundRequestStatus.AWAITING_FINAL_CONFIRMATION.value: frozenset(
        {
            RefundRequestStatus.APPROVED.value,
            RefundRequestStatus.ADMIN_EDITED.value,
            RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
            RefundRequestStatus.CANCELED.value,
            RefundRequestStatus.REJECTED.value,
        }
    ),
    RefundRequestStatus.APPROVED.value: frozenset(
        {
            RefundRequestStatus.REFUND_PROCESSING.value,
            RefundRequestStatus.CANCELED.value,
        }
    ),
    RefundRequestStatus.REFUND_PROCESSING.value: frozenset(
        {
            RefundRequestStatus.REFUNDED.value,
            RefundRequestStatus.PARTIALLY_REFUNDED.value,
            RefundRequestStatus.PROVIDER_UNKNOWN.value,
            RefundRequestStatus.REFUND_FAILED.value,
        }
    ),
    RefundRequestStatus.PROVIDER_UNKNOWN.value: frozenset(
        {
            RefundRequestStatus.REFUNDED.value,
            RefundRequestStatus.PARTIALLY_REFUNDED.value,
            RefundRequestStatus.REFUND_FAILED.value,
            RefundRequestStatus.REFUND_PROCESSING.value,
        }
    ),
    RefundRequestStatus.REFUND_FAILED.value: frozenset(
        {
            RefundRequestStatus.REFUND_PROCESSING.value,
            RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
            RefundRequestStatus.CANCELED.value,
        }
    ),
    RefundRequestStatus.REFUNDED.value: frozenset(
        {
            RefundRequestStatus.ENTITLEMENT_PROCESSING.value,
            RefundRequestStatus.COMPLETED.value,
        }
    ),
    RefundRequestStatus.PARTIALLY_REFUNDED.value: frozenset(
        {
            RefundRequestStatus.ENTITLEMENT_PROCESSING.value,
            RefundRequestStatus.COMPLETED.value,
            RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
        }
    ),
    RefundRequestStatus.ENTITLEMENT_PROCESSING.value: frozenset(
        {
            RefundRequestStatus.COMPLETED.value,
            RefundRequestStatus.ENTITLEMENT_FAILED.value,
        }
    ),
    RefundRequestStatus.ENTITLEMENT_FAILED.value: frozenset(
        {
            RefundRequestStatus.ENTITLEMENT_PROCESSING.value,
            RefundRequestStatus.CHARGEBACK_REVIEW.value,
        }
    ),
    RefundRequestStatus.CALCULATION_FAILED.value: frozenset(
        {
            RefundRequestStatus.CALCULATING.value,
            RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value,
            RefundRequestStatus.CANCELED.value,
        }
    ),
    RefundRequestStatus.CHARGEBACK_REVIEW.value: frozenset(
        {
            RefundRequestStatus.COMPLETED.value,
            RefundRequestStatus.CANCELED.value,
            RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
        }
    ),
    RefundRequestStatus.COMPLETED.value: frozenset(),
    RefundRequestStatus.REJECTED.value: frozenset(),
    RefundRequestStatus.CANCELED.value: frozenset(),
}


def normalize_currency(currency: str | None) -> str:
    text = (currency or "").strip().upper()
    if not text or len(text) > 10:
        raise RefundInvariantError("Invalid currency", code="invalid_currency")
    return text


def round_money(value: Decimal | str | int | float) -> Decimal:
    return Decimal(str(value)).quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def validate_refund_amount_bounds(
    *,
    refund_amount: Decimal | str,
    paid_amount: Decimal | str,
    prior_refunded_amount: Decimal | str = Decimal("0.00"),
) -> Decimal:
    """0 ≤ refund ≤ paid − prior."""
    refund = round_money(refund_amount)
    paid = round_money(paid_amount)
    prior = round_money(prior_refunded_amount)
    if paid < Decimal("0.00"):
        raise RefundInvariantError("paid_amount must be >= 0", code="paid_negative")
    if prior < Decimal("0.00"):
        raise RefundInvariantError("prior_refunded_amount must be >= 0", code="prior_negative")
    if prior > paid:
        raise RefundInvariantError(
            "prior_refunded_amount exceeds paid_amount",
            code="prior_exceeds_paid",
        )
    max_refundable = paid - prior
    if refund < Decimal("0.00"):
        raise RefundInvariantError("refund_amount must be >= 0", code="refund_negative")
    if refund > max_refundable:
        raise RefundInvariantError(
            "refund_amount exceeds paid − prior",
            code="refund_exceeds_cap",
        )
    return refund


def validate_revision_ownership(
    request: RefundRequest, revision: RefundRevision
) -> None:
    if revision.refund_request_id != request.id:
        raise RefundInvariantError(
            "Revision does not belong to refund request",
            code="revision_ownership",
        )


def validate_current_revision(
    request: RefundRequest, revision: RefundRevision
) -> None:
    validate_revision_ownership(request, revision)
    if int(revision.revision_number) != int(request.current_revision_number):
        raise RefundInvariantError(
            "Revision is not the current revision",
            code="stale_revision",
        )


def validate_approved_revision(
    request: RefundRequest, revision: RefundRevision
) -> None:
    validate_revision_ownership(request, revision)
    if request.approved_revision_id is not None and request.approved_revision_id != revision.id:
        # Setting a new approved revision is ok; ownership still required.
        pass
    validate_revision_ownership(request, revision)


def assert_financials_not_frozen(request: RefundRequest) -> None:
    if (request.status or "") in REFUND_FINANCIAL_FROZEN_STATUSES:
        raise RefundInvariantError(
            "Financial data is frozen for this request status",
            code="financials_frozen",
        )


def assert_revision_immutable_update_forbidden() -> None:
    raise RefundInvariantError(
        "RefundRevision rows are immutable; create a new revision",
        code="revision_immutable",
    )


def validate_status_transition(*, current: str, new: str) -> None:
    cur = (current or "").strip()
    nxt = (new or "").strip()
    if cur == nxt:
        return
    if nxt not in {s.value for s in RefundRequestStatus}:
        raise RefundInvariantError(
            f"Unknown status {nxt!r}",
            code="unknown_status",
        )
    allowed = ALLOWED_STATUS_TRANSITIONS.get(cur)
    if allowed is None:
        raise RefundInvariantError(
            f"Unknown current status {cur!r}",
            code="unknown_status",
        )
    if nxt not in allowed:
        raise RefundInvariantError(
            f"Status transition {cur!r} → {nxt!r} is not allowed",
            code="invalid_status_transition",
        )


def validate_optimistic_version(
    request: RefundRequest, *, expected_version: int
) -> None:
    if int(request.version) != int(expected_version):
        raise RefundInvariantError(
            "RefundRequest version conflict",
            code="version_conflict",
        )


def sum_ledger_amounts(amounts: Iterable[Decimal | str]) -> Decimal:
    total = Decimal("0.00")
    for raw in amounts:
        total += round_money(raw)
    return round_money(total)


def validate_ledger_total_within_paid(
    *,
    paid_amount: Decimal | str,
    existing_ledger_amounts: Iterable[Decimal | str],
    new_amount: Decimal | str,
) -> Decimal:
    paid = round_money(paid_amount)
    new_amt = round_money(new_amount)
    if new_amt < Decimal("0.00"):
        raise RefundInvariantError("ledger amount must be >= 0", code="refund_negative")
    total = sum_ledger_amounts(existing_ledger_amounts) + new_amt
    if total > paid:
        raise RefundInvariantError(
            "Sum of ledger refunds exceeds paid amount",
            code="ledger_exceeds_paid",
        )
    return new_amt


def is_terminal_status(status: str) -> bool:
    return (status or "") in REFUND_TERMINAL_STATUSES


def is_financially_frozen(status: str) -> bool:
    return (status or "") in REFUND_FINANCIAL_FROZEN_STATUSES
