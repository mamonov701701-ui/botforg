"""
Автоматический расчёт refund (Этап 6.14.2).

Server-side only: суммы из CheckoutIntent / PaymentAttempt, периоды из entitlements.
Provider refund / entitlement mutate — вне scope.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutProductType,
    PaymentAttempt,
    PaymentAttemptStatus,
)
from backend.models.refund import (
    REFUND_LEDGER_ACTIVE_RESERVATION_TYPES,
    REFUND_LEDGER_CONFIRMED_TYPES,
    REFUND_LEDGER_INACTIVE_TYPES,
    REFUND_LEDGER_PROVIDER_UNKNOWN_TYPES,
    RefundCalculationStatus,
    RefundEntitlementAction,
    RefundLedgerEntry,
    RefundRequest,
    RefundRequestStatus,
    RefundType,
)
from backend.models.tariff import (
    SubscriptionStatus,
    UsageCounter,
    UserAddon,
    UserAddonStatus,
    UserSubscription,
)
from backend.services.refund_invariants import (
    RefundInvariantError,
    normalize_currency,
    round_money,
    validate_refund_amount_bounds,
)

GRACE_PERIOD = timedelta(hours=24)
ZERO = Decimal("0.00")


class RefundCalculationError(Exception):
    def __init__(self, message: str, *, code: str) -> None:
        self.message = message
        self.code = code
        super().__init__(message)


@dataclass(frozen=True)
class LedgerBalance:
    """
    Separated ledger buckets for one checkout intent.

    confirmed_refunded_amount — actually completed refunds (succeeded).
    active_reserved_amount — planned/reserved holds (not yet returned).
    provider_unknown_amount — conservative hold, not confirmed.
    failed_or_canceled_amount — informational only (does not reduce available).
    refundable_available_amount =
        paid − confirmed − active_reserved − provider_unknown.
    """

    paid_amount: Decimal
    confirmed_refunded_amount: Decimal
    active_reserved_amount: Decimal
    provider_unknown_amount: Decimal
    failed_or_canceled_amount: Decimal
    refundable_available_amount: Decimal

    def as_snapshot(self) -> dict[str, Any]:
        return {
            "confirmed_refunded_amount": str(self.confirmed_refunded_amount),
            "active_reserved_amount": str(self.active_reserved_amount),
            "provider_unknown_amount": str(self.provider_unknown_amount),
            "failed_or_canceled_amount": str(self.failed_or_canceled_amount),
            "refundable_available_amount": str(self.refundable_available_amount),
            "paid_amount": str(self.paid_amount),
            "note": (
                "RefundRevision.prior_refunded_amount stores confirmed_refunded_amount only. "
                "planned/reserved are active_reserved_amount, not money returned."
            ),
        }


@dataclass(frozen=True)
class RefundCalculationResult:
    calculation_status: str
    refund_type: str
    currency: str
    paid_amount: Decimal
    # DB column compatibility: confirmed completed refunds only (not reservations).
    prior_refunded_amount: Decimal
    confirmed_refunded_amount: Decimal
    active_reserved_amount: Decimal
    provider_unknown_amount: Decimal
    refundable_available_amount: Decimal
    proposed_refund_amount: Decimal
    calculation_at: datetime
    period_start: datetime | None
    period_end: datetime | None
    used_time_seconds: int | None
    total_time_seconds: int | None
    addon_total_units: int | None
    addon_used_units: int | None
    addon_revoke_units: int | None
    entitlement_action: str
    entitlement_effective_at: datetime | None
    calculation_snapshot: dict[str, Any]
    entitlement_snapshot: dict[str, Any]
    usage_snapshot: dict[str, Any]
    input_fingerprint: str
    request_status_after: str


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def ensure_aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _iso(dt: datetime | None) -> str | None:
    aware = ensure_aware(dt)
    return aware.isoformat() if aware is not None else None


def compute_input_fingerprint(payload: dict[str, Any]) -> str:
    """Stable hash of calculation inputs (no secrets / provider payloads)."""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def load_ledger_balance(
    db: Session,
    *,
    checkout_intent_id: int,
    paid_amount: Decimal | str,
) -> LedgerBalance:
    """
    Bucket ledger rows for refund math.

    - succeeded → confirmed_refunded_amount (reduces paid balance)
    - planned/reserved → active_reserved_amount (blocks re-reservation only)
    - provider_unknown → provider_unknown_amount (conservative hold on available)
    - failed/canceled → ignored for available/confirmed
    """
    paid = round_money(paid_amount)
    rows = (
        db.query(RefundLedgerEntry)
        .filter(RefundLedgerEntry.checkout_intent_id == int(checkout_intent_id))
        .all()
    )
    confirmed = ZERO
    reserved = ZERO
    unknown = ZERO
    inactive = ZERO
    for row in rows:
        entry_type = (row.entry_type or "").strip()
        amount = round_money(row.amount)
        if entry_type in REFUND_LEDGER_CONFIRMED_TYPES:
            confirmed += amount
        elif entry_type in REFUND_LEDGER_ACTIVE_RESERVATION_TYPES:
            reserved += amount
        elif entry_type in REFUND_LEDGER_PROVIDER_UNKNOWN_TYPES:
            unknown += amount
        elif entry_type in REFUND_LEDGER_INACTIVE_TYPES:
            inactive += amount
        # Unknown future types: treat conservatively as reservation hold.
        else:
            reserved += amount

    confirmed = round_money(confirmed)
    reserved = round_money(reserved)
    unknown = round_money(unknown)
    inactive = round_money(inactive)
    allocated = round_money(confirmed + reserved + unknown)
    if allocated > paid:
        available = ZERO
    else:
        available = round_money(paid - allocated)
    return LedgerBalance(
        paid_amount=paid,
        confirmed_refunded_amount=confirmed,
        active_reserved_amount=reserved,
        provider_unknown_amount=unknown,
        failed_or_canceled_amount=inactive,
        refundable_available_amount=available,
    )


def load_prior_refunded_amount(
    db: Session, *, checkout_intent_id: int, paid_amount: Decimal | str = ZERO
) -> Decimal:
    """Confirmed completed refunds only (not planned/reserved)."""
    return load_ledger_balance(
        db, checkout_intent_id=checkout_intent_id, paid_amount=paid_amount
    ).confirmed_refunded_amount


def load_usage_snapshot(db: Session, *, user_id: int, paid_at: datetime | None) -> dict[str, Any]:
    paid_at_aware = ensure_aware(paid_at)
    counters = (
        db.query(UsageCounter).filter(UsageCounter.user_id == int(user_id)).all()
    )
    items: list[dict[str, Any]] = []
    messages_total = 0
    bots_total = 0
    team_total = 0
    detectable_pool_usage = False
    max_updated: datetime | None = None

    for c in counters:
        messages_total += int(c.messages_used or 0)
        bots_total += int(c.active_bots_used or 0)
        team_total += int(c.team_members_used or 0)
        updated = ensure_aware(c.updated_at)
        if updated is not None and (max_updated is None or updated > max_updated):
            max_updated = updated
        post_purchase = False
        if paid_at_aware is not None and updated is not None and updated >= paid_at_aware:
            if int(c.messages_used or 0) > 0 or int(c.active_bots_used or 0) > 0:
                post_purchase = True
                detectable_pool_usage = True
        items.append(
            {
                "period_start": _iso(c.period_start),
                "period_end": _iso(c.period_end),
                "messages_used": int(c.messages_used or 0),
                "active_bots_used": int(c.active_bots_used or 0),
                "team_members_used": int(c.team_members_used or 0),
                "updated_at": _iso(c.updated_at),
                "post_purchase_activity_heuristic": post_purchase,
            }
        )

    return {
        "counters": items,
        "messages_used_total": messages_total,
        "active_bots_used_total": bots_total,
        "team_members_used_total": team_total,
        "detectable_pool_usage_after_purchase": detectable_pool_usage,
        "usage_updated_at_max": _iso(max_updated),
        "note": (
            "Pool aggregate only; no per-addon attribution until FIFO ledger. "
            "Post-purchase heuristic: counter.updated_at >= paid_at and used > 0."
        ),
    }


def _allocated_against_paid(balance: LedgerBalance) -> Decimal:
    """confirmed + reserved + provider_unknown (failed/canceled excluded)."""
    return round_money(
        balance.confirmed_refunded_amount
        + balance.active_reserved_amount
        + balance.provider_unknown_amount
    )


def calculate_tariff_time_proration(
    *,
    paid_amount: Decimal | str,
    period_start: datetime | None,
    period_end: datetime | None,
    calculation_at: datetime,
    confirmed_refunded_amount: Decimal | str = ZERO,
    refundable_available_amount: Decimal | str | None = None,
    prior_refunded_amount: Decimal | str | None = None,
) -> dict[str, Any]:
    """
    Pure tariff time formula.

    elapsed_seconds = clamp(calc_at - period_start, 0, total_seconds)
    used_amount = round_money(paid * elapsed / total)
    economic = paid - used - confirmed_refunded
    proposed = clamp(economic, 0, refundable_available)

    `prior_refunded_amount` — deprecated alias for confirmed_refunded_amount only.
    """
    paid = round_money(paid_amount)
    if prior_refunded_amount is not None:
        confirmed = round_money(prior_refunded_amount)
    else:
        confirmed = round_money(confirmed_refunded_amount)
    available = (
        round_money(refundable_available_amount)
        if refundable_available_amount is not None
        else round_money(paid - confirmed)
    )
    if available < ZERO:
        available = ZERO
    calc_at = ensure_aware(calculation_at)
    assert calc_at is not None
    start = ensure_aware(period_start)
    end = ensure_aware(period_end)

    if start is None or end is None:
        return {
            "ok": False,
            "reason": "missing_period",
            "request_status_after": RefundRequestStatus.CALCULATION_FAILED.value,
            "calculation_status": RefundCalculationStatus.FAILED.value,
            "proposed_refund_amount": ZERO,
            "used_time_seconds": None,
            "total_time_seconds": None,
            "refund_type": RefundType.PARTIAL.value,
        }

    if end <= start:
        return {
            "ok": False,
            "reason": "invalid_period",
            "request_status_after": RefundRequestStatus.CALCULATION_FAILED.value,
            "calculation_status": RefundCalculationStatus.FAILED.value,
            "proposed_refund_amount": ZERO,
            "used_time_seconds": None,
            "total_time_seconds": None,
            "refund_type": RefundType.PARTIAL.value,
        }

    total_seconds = int((end - start).total_seconds())
    if total_seconds <= 0:
        return {
            "ok": False,
            "reason": "invalid_period_total",
            "request_status_after": RefundRequestStatus.CALCULATION_FAILED.value,
            "calculation_status": RefundCalculationStatus.FAILED.value,
            "proposed_refund_amount": ZERO,
            "used_time_seconds": None,
            "total_time_seconds": total_seconds,
            "refund_type": RefundType.PARTIAL.value,
        }

    # Before period start → zero usage time.
    raw_elapsed = (calc_at - start).total_seconds()
    elapsed_seconds = int(max(0, min(raw_elapsed, float(total_seconds))))

    # After period end → full time used → time-proration refund 0 (before available clamp).
    if calc_at >= end:
        elapsed_seconds = total_seconds

    used_amount = round_money(
        (paid * Decimal(elapsed_seconds)) / Decimal(total_seconds)
    )
    economic = paid - used_amount - confirmed
    if economic < ZERO:
        proposed = ZERO
    elif economic > available:
        proposed = available
    else:
        proposed = round_money(economic)

    # Bounds vs paid using allocated = paid - available.
    allocated = round_money(paid - available)
    validate_refund_amount_bounds(
        refund_amount=proposed,
        paid_amount=paid,
        prior_refunded_amount=allocated,
    )

    refund_type = (
        RefundType.FULL.value
        if proposed == available and available > ZERO and confirmed == ZERO
        and proposed == round_money(paid - used_amount)
        else RefundType.PARTIAL.value
    )
    if available == ZERO:
        refund_type = RefundType.PARTIAL.value
    # Full relative to remaining available with zero usage / grace-like remainder.
    if proposed == available and available > ZERO and used_amount == ZERO:
        refund_type = RefundType.FULL.value

    return {
        "ok": True,
        "reason": "time_proration",
        "request_status_after": RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
        "calculation_status": RefundCalculationStatus.OK.value,
        "proposed_refund_amount": proposed,
        "used_time_seconds": elapsed_seconds,
        "total_time_seconds": total_seconds,
        "used_amount": used_amount,
        "confirmed_refunded_amount": confirmed,
        "refundable_available_amount": available,
        "refund_type": refund_type,
        "elapsed_ratio": str(Decimal(elapsed_seconds) / Decimal(total_seconds)),
    }


def _entitlement_active_tariff(sub: UserSubscription | None) -> tuple[bool, bool]:
    """Returns (exists, partially_or_fully_revoked)."""
    if sub is None:
        return False, True
    status = str(sub.status.value if hasattr(sub.status, "value") else sub.status)
    active_like = status in {
        SubscriptionStatus.ACTIVE.value,
        SubscriptionStatus.TRIALING.value,
    }
    revoked = status in {
        SubscriptionStatus.CANCELLED.value,
        SubscriptionStatus.EXPIRED.value,
    } or sub.cancelled_at is not None
    return True, (not active_like) or revoked


def _entitlement_active_addon(addon: UserAddon | None) -> tuple[bool, bool]:
    if addon is None:
        return False, True
    status = str(addon.status.value if hasattr(addon.status, "value") else addon.status)
    active = status == UserAddonStatus.ACTIVE.value
    revoked = status in {
        UserAddonStatus.CANCELLED.value,
        UserAddonStatus.EXPIRED.value,
    }
    return True, (not active) or revoked


def build_refund_calculation(
    db: Session,
    request: RefundRequest,
    *,
    calculation_at: datetime | None = None,
) -> RefundCalculationResult:
    """Build server-side calculation result for a refund request (no DB writes)."""
    intent = db.get(CheckoutIntent, request.checkout_intent_id)
    attempt = db.get(PaymentAttempt, request.payment_attempt_id)
    if intent is None or attempt is None:
        raise RefundCalculationError(
            "CheckoutIntent or PaymentAttempt not found",
            code="missing_payment_context",
        )
    if int(intent.user_id) != int(request.user_id):
        raise RefundCalculationError("Intent user mismatch", code="user_mismatch")
    if int(attempt.checkout_intent_id) != int(intent.id):
        raise RefundCalculationError(
            "PaymentAttempt does not belong to CheckoutIntent",
            code="attempt_intent_mismatch",
        )
    if attempt.status != PaymentAttemptStatus.SUCCEEDED.value:
        raise RefundCalculationError(
            "PaymentAttempt is not succeeded",
            code="attempt_not_succeeded",
        )

    paid = round_money(intent.amount)
    attempt_amount = round_money(attempt.amount)
    if paid != attempt_amount:
        raise RefundCalculationError(
            "Intent amount does not match PaymentAttempt amount",
            code="amount_mismatch",
        )

    currency = normalize_currency(intent.currency or attempt.currency)
    balance = load_ledger_balance(
        db, checkout_intent_id=intent.id, paid_amount=paid
    )
    calc_at = ensure_aware(calculation_at) or _utcnow()
    assert calc_at is not None
    paid_at = ensure_aware(intent.paid_at)
    usage = load_usage_snapshot(db, user_id=request.user_id, paid_at=paid_at)
    product_type = (intent.product_type or "").strip().lower()

    fingerprint_base: dict[str, Any] = {
        "checkout_intent_id": intent.id,
        "payment_attempt_id": attempt.id,
        "product_type": product_type,
        "product_code": intent.product_code,
        "paid_amount": str(paid),
        "currency": currency,
        "confirmed_refunded_amount": str(balance.confirmed_refunded_amount),
        "active_reserved_amount": str(balance.active_reserved_amount),
        "provider_unknown_amount": str(balance.provider_unknown_amount),
        "refundable_available_amount": str(balance.refundable_available_amount),
        "paid_at": _iso(paid_at),
        "messages_used_total": usage["messages_used_total"],
        "active_bots_used_total": usage["active_bots_used_total"],
        "detectable_pool_usage_after_purchase": usage[
            "detectable_pool_usage_after_purchase"
        ],
        "usage_updated_at_max": usage["usage_updated_at_max"],
        "fulfilled_subscription_id": intent.fulfilled_subscription_id,
        "fulfilled_addon_id": intent.fulfilled_addon_id,
    }

    if product_type == CheckoutProductType.TARIFF.value:
        return _calc_tariff(
            db,
            intent=intent,
            balance=balance,
            currency=currency,
            calc_at=calc_at,
            paid_at=paid_at,
            usage=usage,
            fingerprint_base=fingerprint_base,
        )
    if product_type == CheckoutProductType.ADDON.value:
        return _calc_addon(
            db,
            intent=intent,
            balance=balance,
            currency=currency,
            calc_at=calc_at,
            paid_at=paid_at,
            usage=usage,
            fingerprint_base=fingerprint_base,
        )

    fp = compute_input_fingerprint(fingerprint_base)
    snap = {
        "formula": "unsupported_product_type",
        "product_type": product_type,
        "ledger_balance": balance.as_snapshot(),
        "input_fingerprint": fp,
    }
    return RefundCalculationResult(
        calculation_status=RefundCalculationStatus.FAILED.value,
        refund_type=RefundType.PARTIAL.value,
        currency=currency,
        paid_amount=paid,
        prior_refunded_amount=balance.confirmed_refunded_amount,
        confirmed_refunded_amount=balance.confirmed_refunded_amount,
        active_reserved_amount=balance.active_reserved_amount,
        provider_unknown_amount=balance.provider_unknown_amount,
        refundable_available_amount=balance.refundable_available_amount,
        proposed_refund_amount=ZERO,
        calculation_at=calc_at,
        period_start=None,
        period_end=None,
        used_time_seconds=None,
        total_time_seconds=None,
        addon_total_units=None,
        addon_used_units=None,
        addon_revoke_units=None,
        entitlement_action=RefundEntitlementAction.NONE.value,
        entitlement_effective_at=None,
        calculation_snapshot=snap,
        entitlement_snapshot={"exists": False},
        usage_snapshot=usage,
        input_fingerprint=fp,
        request_status_after=RefundRequestStatus.CALCULATION_FAILED.value,
    )


def _result_with_balance(
    *,
    balance: LedgerBalance,
    currency: str,
    proposed: Decimal,
    calculation_status: str,
    refund_type: str,
    calc_at: datetime,
    period_start: datetime | None,
    period_end: datetime | None,
    used_time_seconds: int | None,
    total_time_seconds: int | None,
    addon_total_units: int | None,
    addon_used_units: int | None,
    addon_revoke_units: int | None,
    entitlement_action: str,
    entitlement_effective_at: datetime | None,
    calculation_snapshot: dict[str, Any],
    entitlement_snapshot: dict[str, Any],
    usage_snapshot: dict[str, Any],
    input_fingerprint: str,
    request_status_after: str,
) -> RefundCalculationResult:
    snap = dict(calculation_snapshot)
    snap["ledger_balance"] = balance.as_snapshot()
    snap["input_fingerprint"] = input_fingerprint
    return RefundCalculationResult(
        calculation_status=calculation_status,
        refund_type=refund_type,
        currency=currency,
        paid_amount=balance.paid_amount,
        prior_refunded_amount=balance.confirmed_refunded_amount,
        confirmed_refunded_amount=balance.confirmed_refunded_amount,
        active_reserved_amount=balance.active_reserved_amount,
        provider_unknown_amount=balance.provider_unknown_amount,
        refundable_available_amount=balance.refundable_available_amount,
        proposed_refund_amount=proposed,
        calculation_at=calc_at,
        period_start=period_start,
        period_end=period_end,
        used_time_seconds=used_time_seconds,
        total_time_seconds=total_time_seconds,
        addon_total_units=addon_total_units,
        addon_used_units=addon_used_units,
        addon_revoke_units=addon_revoke_units,
        entitlement_action=entitlement_action,
        entitlement_effective_at=entitlement_effective_at,
        calculation_snapshot=snap,
        entitlement_snapshot=entitlement_snapshot,
        usage_snapshot=usage_snapshot,
        input_fingerprint=input_fingerprint,
        request_status_after=request_status_after,
    )


def _calc_tariff(
    db: Session,
    *,
    intent: CheckoutIntent,
    balance: LedgerBalance,
    currency: str,
    calc_at: datetime,
    paid_at: datetime | None,
    usage: dict[str, Any],
    fingerprint_base: dict[str, Any],
) -> RefundCalculationResult:
    paid = balance.paid_amount
    confirmed = balance.confirmed_refunded_amount
    available = balance.refundable_available_amount
    allocated = _allocated_against_paid(balance)

    sub = None
    if intent.fulfilled_subscription_id is not None:
        sub = db.get(UserSubscription, intent.fulfilled_subscription_id)

    exists, revoked = _entitlement_active_tariff(sub)
    period_start = ensure_aware(sub.current_period_start) if sub else None
    period_end = ensure_aware(sub.current_period_end) if sub else None

    fingerprint_base = {
        **fingerprint_base,
        "period_start": _iso(period_start),
        "period_end": _iso(period_end),
        "entitlement_exists": exists,
        "entitlement_revoked": revoked,
        "subscription_status": (
            str(sub.status.value if hasattr(sub.status, "value") else sub.status)
            if sub
            else None
        ),
    }
    fp = compute_input_fingerprint(fingerprint_base)

    entitlement_snapshot = {
        "kind": "subscription",
        "subscription_id": sub.id if sub else None,
        "status": fingerprint_base["subscription_status"],
        "exists": exists,
        "revoked_or_inactive": revoked,
        "period_start": _iso(period_start),
        "period_end": _iso(period_end),
    }

    # Grace: ≤24h, no usage, no confirmed refunds, entitlement intact.
    # Active reservations reduce available but are not "prior refunded".
    grace_window = False
    if paid_at is not None:
        grace_window = (calc_at - paid_at) <= GRACE_PERIOD and calc_at >= paid_at

    no_usage = not bool(usage["detectable_pool_usage_after_purchase"])
    grace_eligible = (
        grace_window
        and no_usage
        and confirmed == ZERO
        and exists
        and not revoked
    )

    if grace_eligible:
        proposed = available
        validate_refund_amount_bounds(
            refund_amount=proposed,
            paid_amount=paid,
            prior_refunded_amount=allocated,
        )
        return _result_with_balance(
            balance=balance,
            currency=currency,
            proposed=proposed,
            calculation_status=RefundCalculationStatus.OK.value,
            refund_type=RefundType.FULL.value if proposed == available else RefundType.PARTIAL.value,
            calc_at=calc_at,
            period_start=period_start,
            period_end=period_end,
            used_time_seconds=0,
            total_time_seconds=(
                int((period_end - period_start).total_seconds())
                if period_start and period_end and period_end > period_start
                else None
            ),
            addon_total_units=None,
            addon_used_units=None,
            addon_revoke_units=None,
            entitlement_action=RefundEntitlementAction.CANCEL_IMMEDIATE.value,
            entitlement_effective_at=calc_at,
            calculation_snapshot={
                "formula": "grace_period_full_refund",
                "basis": "grace_period_full_refund",
                "grace_hours": 24,
                "paid_at": _iso(paid_at),
                "calculation_at": _iso(calc_at),
                "note": (
                    "24h grace is a concession, not a filing deadline. "
                    "proposed capped by refundable_available_amount "
                    "(paid − confirmed − reserved − provider_unknown)."
                ),
            },
            entitlement_snapshot=entitlement_snapshot,
            usage_snapshot=usage,
            input_fingerprint=fp,
            request_status_after=RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
        )

    proration = calculate_tariff_time_proration(
        paid_amount=paid,
        confirmed_refunded_amount=confirmed,
        refundable_available_amount=available,
        period_start=period_start,
        period_end=period_end,
        calculation_at=calc_at,
    )

    if not proration["ok"]:
        status_after = proration["request_status_after"]
        if not exists:
            status_after = RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value
            calc_status = RefundCalculationStatus.MANUAL_REQUIRED.value
        else:
            calc_status = proration["calculation_status"]
        return _result_with_balance(
            balance=balance,
            currency=currency,
            proposed=ZERO,
            calculation_status=calc_status,
            refund_type=RefundType.PARTIAL.value,
            calc_at=calc_at,
            period_start=period_start,
            period_end=period_end,
            used_time_seconds=proration.get("used_time_seconds"),
            total_time_seconds=proration.get("total_time_seconds"),
            addon_total_units=None,
            addon_used_units=None,
            addon_revoke_units=None,
            entitlement_action=RefundEntitlementAction.NONE.value,
            entitlement_effective_at=None,
            calculation_snapshot={
                "formula": "tariff_time_proration",
                "ok": False,
                "reason": proration["reason"],
                "grace_skipped": True,
                "grace_window": grace_window,
                "grace_blocked_by_usage": grace_window and not no_usage,
                "grace_blocked_by_confirmed_refunds": confirmed > ZERO,
                "grace_blocked_by_entitlement": (not exists) or revoked,
                "calculation_at": _iso(calc_at),
            },
            entitlement_snapshot=entitlement_snapshot,
            usage_snapshot=usage,
            input_fingerprint=fp,
            request_status_after=status_after,
        )

    proposed = proration["proposed_refund_amount"]
    action = (
        RefundEntitlementAction.CANCEL_IMMEDIATE.value
        if proposed == available and proposed > ZERO
        else RefundEntitlementAction.CANCEL_AT.value
    )
    return _result_with_balance(
        balance=balance,
        currency=currency,
        proposed=proposed,
        calculation_status=RefundCalculationStatus.OK.value,
        refund_type=proration["refund_type"],
        calc_at=calc_at,
        period_start=period_start,
        period_end=period_end,
        used_time_seconds=proration["used_time_seconds"],
        total_time_seconds=proration["total_time_seconds"],
        addon_total_units=None,
        addon_used_units=None,
        addon_revoke_units=None,
        entitlement_action=action,
        entitlement_effective_at=(
            period_end if action == RefundEntitlementAction.CANCEL_AT.value else calc_at
        ),
        calculation_snapshot={
            "formula": "tariff_time_proration",
            "ok": True,
            "reason": proration["reason"],
            "elapsed_ratio": proration.get("elapsed_ratio"),
            "used_amount": str(proration.get("used_amount", ZERO)),
            "grace_skipped": True,
            "grace_window": grace_window,
            "grace_blocked_by_usage": grace_window and not no_usage,
            "calculation_at": _iso(calc_at),
        },
        entitlement_snapshot=entitlement_snapshot,
        usage_snapshot=usage,
        input_fingerprint=fp,
        request_status_after=RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
    )


def _manual_addon_placeholder_snapshot(**extra: Any) -> dict[str, Any]:
    """proposed_refund_amount column is NOT NULL → 0.00 is a placeholder, not a denial."""
    snap = {
        "auto_proposed_deferred": True,
        "proposed_amount_undefined": True,
        "proposed_refund_amount_is_placeholder": True,
        "proposed_refund_semantic": "undefined_not_denial",
        "note": (
            "proposed_refund_amount=0.00 is a DB placeholder because the column is NOT NULL. "
            "It is NOT a recommendation to refuse the refund; auto-calc did not determine an amount."
        ),
    }
    snap.update(extra)
    return snap


def _calc_addon(
    db: Session,
    *,
    intent: CheckoutIntent,
    balance: LedgerBalance,
    currency: str,
    calc_at: datetime,
    paid_at: datetime | None,
    usage: dict[str, Any],
    fingerprint_base: dict[str, Any],
) -> RefundCalculationResult:
    paid = balance.paid_amount
    confirmed = balance.confirmed_refunded_amount
    available = balance.refundable_available_amount
    allocated = _allocated_against_paid(balance)

    addon = None
    if intent.fulfilled_addon_id is not None:
        addon = db.get(UserAddon, intent.fulfilled_addon_id)

    exists, revoked = _entitlement_active_addon(addon)
    units = int(addon.amount) if addon is not None else None
    period_start = ensure_aware(addon.period_start) if addon else None
    period_end = ensure_aware(addon.period_end) if addon else None

    fingerprint_base = {
        **fingerprint_base,
        "period_start": _iso(period_start),
        "period_end": _iso(period_end),
        "addon_units": units,
        "entitlement_exists": exists,
        "entitlement_revoked": revoked,
        "addon_status": (
            str(addon.status.value if hasattr(addon.status, "value") else addon.status)
            if addon
            else None
        ),
    }
    fp = compute_input_fingerprint(fingerprint_base)

    entitlement_snapshot = {
        "kind": "addon",
        "user_addon_id": addon.id if addon else None,
        "status": fingerprint_base["addon_status"],
        "amount_units": units,
        "exists": exists,
        "revoked_or_inactive": revoked,
        "period_start": _iso(period_start),
        "period_end": _iso(period_end),
    }

    pool_used = bool(usage["detectable_pool_usage_after_purchase"])

    if pool_used:
        return _result_with_balance(
            balance=balance,
            currency=currency,
            proposed=ZERO,
            calculation_status=RefundCalculationStatus.MANUAL_REQUIRED.value,
            refund_type=RefundType.PARTIAL.value,
            calc_at=calc_at,
            period_start=period_start,
            period_end=period_end,
            used_time_seconds=None,
            total_time_seconds=None,
            addon_total_units=units,
            addon_used_units=None,
            addon_revoke_units=None,
            entitlement_action=RefundEntitlementAction.NONE.value,
            entitlement_effective_at=None,
            calculation_snapshot=_manual_addon_placeholder_snapshot(
                formula="addon_pool_usage_manual_review",
                reason="detectable_pool_usage_after_purchase",
                calculation_at=_iso(calc_at),
                extra_note="No per-addon attribution until FIFO ledger.",
            ),
            entitlement_snapshot=entitlement_snapshot,
            usage_snapshot=usage,
            input_fingerprint=fp,
            request_status_after=RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value,
        )

    if not exists:
        return _result_with_balance(
            balance=balance,
            currency=currency,
            proposed=ZERO,
            calculation_status=RefundCalculationStatus.MANUAL_REQUIRED.value,
            refund_type=RefundType.PARTIAL.value,
            calc_at=calc_at,
            period_start=period_start,
            period_end=period_end,
            used_time_seconds=None,
            total_time_seconds=None,
            addon_total_units=units,
            addon_used_units=None,
            addon_revoke_units=None,
            entitlement_action=RefundEntitlementAction.NONE.value,
            entitlement_effective_at=None,
            calculation_snapshot=_manual_addon_placeholder_snapshot(
                formula="addon_missing_entitlement",
                calculation_at=_iso(calc_at),
            ),
            entitlement_snapshot=entitlement_snapshot,
            usage_snapshot=usage,
            input_fingerprint=fp,
            request_status_after=RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value,
        )

    # No detectable pool usage → remaining available + revoke full units.
    proposed = available
    validate_refund_amount_bounds(
        refund_amount=proposed,
        paid_amount=paid,
        prior_refunded_amount=allocated,
    )
    revoke_units = max(int(units or 0), 0)

    grace_window = False
    if paid_at is not None:
        grace_window = (calc_at - paid_at) <= GRACE_PERIOD and calc_at >= paid_at

    return _result_with_balance(
        balance=balance,
        currency=currency,
        proposed=proposed,
        calculation_status=RefundCalculationStatus.OK.value,
        refund_type=(
            RefundType.FULL.value
            if proposed == available and confirmed == ZERO
            else RefundType.PARTIAL.value
        ),
        calc_at=calc_at,
        period_start=period_start,
        period_end=period_end,
        used_time_seconds=None,
        total_time_seconds=None,
        addon_total_units=units,
        addon_used_units=0,
        addon_revoke_units=revoke_units,
        entitlement_action=RefundEntitlementAction.CANCEL_ADDON.value,
        entitlement_effective_at=calc_at,
        calculation_snapshot={
            "formula": "addon_full_no_pool_usage",
            "basis": (
                "grace_period_full_refund"
                if grace_window and confirmed == ZERO and not revoked
                else "addon_no_detectable_pool_usage"
            ),
            "grace_window": grace_window,
            "calculation_at": _iso(calc_at),
        },
        entitlement_snapshot=entitlement_snapshot,
        usage_snapshot=usage,
        input_fingerprint=fp,
        request_status_after=RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
    )


def fingerprints_match(revision_fingerprint: str | None, current: str) -> bool:
    if not revision_fingerprint:
        return False
    return revision_fingerprint == current
