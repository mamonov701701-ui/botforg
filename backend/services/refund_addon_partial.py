"""
Addon partial refund: units → money (canonical), consistency, recovery (6.14.11C.1).

Money is always derived from integer revoke units:
  round_money(paid_amount × N / total_units)

No money → units inversion / rounding policy.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from backend.models.checkout import CheckoutIntent, CheckoutProductType
from backend.models.refund import (
    RefundAuditAction,
    RefundAuditActorType,
    RefundAuditEvent,
    RefundCalculationStatus,
    RefundEntitlementAction,
    RefundRequest,
    RefundRequestStatus,
    RefundRevision,
    RefundRevisionType,
    RefundType,
)
from backend.models.tariff import (
    AddonPackage,
    AddonRefundReservationStatus,
    AddonRefundUnitReservation,
    UserAddon,
    UserAddonStatus,
)
from backend.services.refund_addon_reservation import (
    ensure_addon_refund_reservation,
    release_addon_refund_reservation,
)
from backend.services.refund_calculation import load_ledger_balance, round_money
from backend.services.refund_invariants import (
    RefundInvariantError,
    validate_optimistic_version,
    validate_refund_amount_bounds,
)
from backend.services.tariff_addon_usage_ledger import (
    addon_has_pre_cutover_uncertainty,
    fifo_ledger_used,
)


ZERO = Decimal("0.00")

_MONEY_CONFIRMED = frozenset(
    {
        RefundRequestStatus.REFUNDED.value,
        RefundRequestStatus.PARTIALLY_REFUNDED.value,
    }
)

_ENTITLEMENT_DONE = frozenset(
    {
        RefundRequestStatus.COMPLETED.value,
        RefundRequestStatus.ENTITLEMENT_PROCESSING.value,
    }
)


class AddonPartialRefundError(Exception):
    def __init__(self, message: str, *, code: str) -> None:
        self.message = message
        self.code = code
        super().__init__(message)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def money_from_revoke_units(
    *,
    paid_amount: Decimal | str,
    total_units: int,
    revoke_units: int,
) -> Decimal:
    """Canonical units → money (same ratio as unused-share calculation)."""
    paid = round_money(paid_amount)
    total = int(total_units)
    n = int(revoke_units)
    if total <= 0:
        return ZERO
    if n <= 0:
        return ZERO
    if n > total:
        raise AddonPartialRefundError(
            "revoke_units exceeds total_units",
            code="revoke_exceeds_total",
        )
    return round_money(paid * Decimal(n) / Decimal(total))


@dataclass(frozen=True)
class AddonUnitsCorrection:
    revoke_units: int
    total_units: int
    used_units: int
    unused_available_units: int
    proposed_refund_amount: Decimal
    refund_type: str
    entitlement_action: str
    paid_amount: Decimal
    refundable_available_amount: Decimal


def resolve_addon_unused_available(
    db: Session,
    *,
    addon: UserAddon,
    total_units: int,
    refund_request_id: int | None = None,
) -> tuple[int, int]:
    """Return (used_units, unused_available) excluding this request's active reserve."""
    used = int(fifo_ledger_used(db, int(addon.id)))
    reserved = max(0, int(getattr(addon, "reserved_units", 0) or 0))
    if refund_request_id is not None:
        row = (
            db.query(AddonRefundUnitReservation)
            .filter(
                AddonRefundUnitReservation.refund_request_id == int(refund_request_id),
                AddonRefundUnitReservation.user_addon_id == int(addon.id),
                AddonRefundUnitReservation.status
                == AddonRefundReservationStatus.ACTIVE.value,
            )
            .first()
        )
        if row is not None:
            reserved = max(0, reserved - int(row.units or 0))
    grant = max(int(addon.amount or 0), int(total_units or 0))
    # Prefer live amount for unused; total_units is purchase snapshot for money ratio.
    live = max(0, int(addon.amount or 0))
    unused = max(0, live - used - reserved)
    return used, unused


def build_addon_units_correction(
    db: Session,
    *,
    request: RefundRequest,
    paid_amount: Decimal | str,
    total_units: int,
    revoke_units: int,
    enforce_money_available: bool = True,
) -> AddonUnitsCorrection:
    intent = db.get(CheckoutIntent, int(request.checkout_intent_id))
    if intent is None or intent.product_type != CheckoutProductType.ADDON.value:
        raise AddonPartialRefundError(
            "Addon units correction requires an addon purchase",
            code="not_addon_purchase",
        )
    if intent.fulfilled_addon_id is None:
        raise AddonPartialRefundError(
            "CheckoutIntent has no fulfilled_addon_id",
            code="addon_not_found",
        )
    addon = db.get(UserAddon, int(intent.fulfilled_addon_id))
    if addon is None:
        raise AddonPartialRefundError(
            "Fulfilled addon not found",
            code="addon_not_found",
        )

    total = int(total_units or 0)
    if total <= 0:
        total = max(0, int(addon.amount or 0))
    # Money ratio uses immutable purchase grant from checkout snapshot, not live remainder.
    intent_units = int(getattr(intent, "product_units", None) or 0)
    pkg = getattr(addon, "addon_package", None)
    if pkg is None and getattr(addon, "addon_package_id", None) is not None:
        pkg = db.get(AddonPackage, int(addon.addon_package_id))
    grant_total = int(getattr(pkg, "amount", 0) or 0) if pkg is not None else 0
    if intent_units > 0:
        ratio_total = intent_units
    elif grant_total > 0:
        ratio_total = grant_total
    else:
        ratio_total = total
    if ratio_total <= 0:
        raise AddonPartialRefundError(
            "addon_total_units is required",
            code="addon_total_required",
        )

    n = int(revoke_units)
    used, unused = resolve_addon_unused_available(
        db, addon=addon, total_units=ratio_total, refund_request_id=int(request.id)
    )
    if n <= 0:
        raise AddonPartialRefundError(
            "addon_revoke_units must be > 0",
            code="addon_units_required",
        )
    if n > unused:
        raise AddonPartialRefundError(
            "addon_revoke_units exceeds unused available units",
            code="over_units",
        )

    paid = round_money(paid_amount)
    balance = load_ledger_balance(
        db, checkout_intent_id=int(request.checkout_intent_id), paid_amount=paid
    )
    proposed = money_from_revoke_units(
        paid_amount=paid, total_units=ratio_total, revoke_units=n
    )
    max_r = balance.refundable_available_amount
    if enforce_money_available:
        allocated = round_money(
            balance.confirmed_refunded_amount
            + balance.active_reserved_amount
            + balance.provider_unknown_amount
        )
        try:
            proposed = validate_refund_amount_bounds(
                refund_amount=proposed,
                paid_amount=paid,
                prior_refunded_amount=allocated,
            )
        except RefundInvariantError as exc:
            raise AddonPartialRefundError(exc.message, code=exc.code) from exc

        if proposed > max_r:
            raise AddonPartialRefundError(
                "Computed refund amount exceeds refundable available",
                code="over_money",
            )

    live_amount = max(0, int(addon.amount or 0))
    full_unused = (
        used == 0
        and n == unused
        and unused == live_amount
        and live_amount > 0
        and n == ratio_total
    )
    if full_unused:
        action = RefundEntitlementAction.CANCEL_ADDON.value
        rtype = RefundType.FULL.value
    else:
        action = RefundEntitlementAction.REDUCE_AMOUNT.value
        rtype = (
            RefundType.FULL.value
            if proposed == max_r and max_r > 0
            else RefundType.PARTIAL.value
        )
        if rtype == RefundType.FULL.value and n < ratio_total:
            # Money may exhaust available while units remain after prior refunds.
            rtype = RefundType.PARTIAL.value

    return AddonUnitsCorrection(
        revoke_units=n,
        total_units=ratio_total,
        used_units=used,
        unused_available_units=unused,
        proposed_refund_amount=proposed,
        refund_type=rtype,
        entitlement_action=action,
        paid_amount=paid,
        refundable_available_amount=max_r,
    )


def assert_addon_revision_entitlement_consistent(
    db: Session,
    *,
    request: RefundRequest,
    revision: RefundRevision,
) -> None:
    """
    Fail closed before approve/execute when addon money and entitlement disagree.
    """
    intent = db.get(CheckoutIntent, int(request.checkout_intent_id))
    if intent is None or intent.product_type != CheckoutProductType.ADDON.value:
        return

    action = (revision.entitlement_action or "").strip()
    revoke = revision.addon_revoke_units
    total = int(revision.addon_total_units or 0)
    proposed = round_money(revision.proposed_refund_amount)
    paid = round_money(revision.paid_amount)

    if action in {
        RefundEntitlementAction.CANCEL_ADDON.value,
        RefundEntitlementAction.EXPIRE_ADDON.value,
    }:
        if revoke is None or int(revoke) != total or total <= 0:
            raise AddonPartialRefundError(
                "Full addon cancel requires revoke_units == total_units",
                code="inconsistent_addon_entitlement",
            )
        expected = money_from_revoke_units(
            paid_amount=paid, total_units=total, revoke_units=total
        )
        # Full cancel may be capped by available after prior refunds — allow proposed <= expected
        # but not arbitrary partial money with full cancel.
        if proposed != expected and revision.refund_type == RefundType.PARTIAL.value:
            raise AddonPartialRefundError(
                "Partial money with cancel_addon is not allowed",
                code="inconsistent_addon_entitlement",
            )
        return

    if action == RefundEntitlementAction.REDUCE_AMOUNT.value:
        if revoke is None or int(revoke) <= 0:
            raise AddonPartialRefundError(
                "reduce_amount requires addon_revoke_units > 0",
                code="inconsistent_addon_entitlement",
            )
        if total <= 0:
            raise AddonPartialRefundError(
                "reduce_amount requires addon_total_units",
                code="inconsistent_addon_entitlement",
            )
        expected = money_from_revoke_units(
            paid_amount=paid, total_units=total, revoke_units=int(revoke)
        )
        if proposed != expected:
            raise AddonPartialRefundError(
                "proposed_refund_amount must equal paid × revoke / total_units",
                code="inconsistent_addon_entitlement",
            )
        if int(revoke) >= total and revision.refund_type == RefundType.PARTIAL.value:
            # Revoking all units should be cancel_addon when unused-full; still allow
            # reduce_amount if amount already reduced by prior refunds.
            pass
        return

    if action in {RefundEntitlementAction.NONE.value, ""}:
        if proposed > ZERO:
            raise AddonPartialRefundError(
                "Addon monetary refund requires cancel_addon or reduce_amount",
                code="inconsistent_addon_entitlement",
            )
        return

    # Other tariff actions on addon purchase are invalid here.
    raise AddonPartialRefundError(
        f"Unsupported entitlement_action for addon refund: {action!r}",
        code="inconsistent_addon_entitlement",
    )


def recover_addon_entitlement_units(
    db: Session,
    request_id: int,
    *,
    admin_user_id: int,
    expected_version: int,
    addon_revoke_units: int,
    adjustment_comment: str,
    commit: bool = True,
) -> dict[str, Any]:
    """
    Post-money recovery: fix entitlement/reservation without provider call.

    Allowed only after monetary success and before entitlement completed.
    """
    request = (
        db.query(RefundRequest)
        .filter(RefundRequest.id == int(request_id))
        .with_for_update()
        .first()
    )
    if request is None:
        raise AddonPartialRefundError("RefundRequest not found", code="request_not_found")

    try:
        validate_optimistic_version(request, expected_version=expected_version)
    except RefundInvariantError as exc:
        raise AddonPartialRefundError(exc.message, code=exc.code) from exc

    status = request.status or ""
    if status in _ENTITLEMENT_DONE or status == RefundRequestStatus.COMPLETED.value:
        raise AddonPartialRefundError(
            "Entitlement already applied or in progress",
            code="entitlement_already_applied",
        )
    if status not in _MONEY_CONFIRMED:
        raise AddonPartialRefundError(
            "Recovery requires monetary refund success first",
            code="recovery_not_allowed",
        )

    if request.approved_revision_id is None:
        raise AddonPartialRefundError(
            "Approved revision required for recovery",
            code="approved_revision_required",
        )
    base = db.get(RefundRevision, int(request.approved_revision_id))
    if base is None:
        raise AddonPartialRefundError(
            "Approved revision not found",
            code="revision_not_found",
        )

    comment = (adjustment_comment or "").strip()
    if not comment:
        raise AddonPartialRefundError(
            "adjustment_comment is required",
            code="adjustment_required",
        )

    # Money already confirmed — do not re-cap equivalent units money against available.
    correction = build_addon_units_correction(
        db,
        request=request,
        paid_amount=base.paid_amount,
        total_units=int(base.addon_total_units or 0),
        revoke_units=int(addon_revoke_units),
        enforce_money_available=False,
    )

    balance = load_ledger_balance(
        db,
        checkout_intent_id=int(request.checkout_intent_id),
        paid_amount=base.paid_amount,
    )
    confirmed = balance.confirmed_refunded_amount
    equivalent = correction.proposed_refund_amount
    # canonical − actual (positive => units worth more than money already returned)
    delta = round_money(equivalent - confirmed)

    # Idempotent: same reduce_amount + N already on approved revision.
    if (
        (base.entitlement_action or "") == RefundEntitlementAction.REDUCE_AMOUNT.value
        and int(base.addon_revoke_units or 0) == int(correction.revoke_units)
        and (base.calculation_snapshot or {}).get("recovery") is True
    ):
        if commit:
            db.commit()
        return {
            "request": request,
            "revision": base,
            "confirmed_refunded_amount": str(confirmed),
            "equivalent_units_money": str(equivalent),
            "money_units_delta": str(delta),
            "addon_revoke_units": correction.revoke_units,
            "entitlement_action": correction.entitlement_action,
            "already_recovered": True,
        }
    next_number = int(request.current_revision_number or 0) + 1
    now = _utcnow()
    rev = RefundRevision(
        refund_request_id=request.id,
        revision_number=next_number,
        revision_type=RefundRevisionType.ADMIN.value,
        created_by_user_id=int(admin_user_id),
        based_on_revision_id=base.id,
        calculation_status=RefundCalculationStatus.OK.value,
        refund_type=correction.refund_type,
        currency=base.currency or "RUB",
        paid_amount=round_money(base.paid_amount),
        prior_refunded_amount=round_money(base.prior_refunded_amount or ZERO),
        proposed_refund_amount=equivalent,
        final_refund_amount=confirmed,
        calculation_at=now,
        period_start=base.period_start,
        period_end=base.period_end,
        used_time_seconds=base.used_time_seconds,
        total_time_seconds=base.total_time_seconds,
        addon_total_units=correction.total_units,
        addon_used_units=correction.used_units,
        addon_revoke_units=correction.revoke_units,
        entitlement_action=correction.entitlement_action,
        entitlement_effective_at=now,
        adjustment_reason_category="entitlement_recovery",
        adjustment_comment=comment,
        calculation_snapshot={
            "recovery": True,
            "formula": "addon_units_to_money",
            "confirmed_refunded_amount": str(confirmed),
            "equivalent_units_money": str(equivalent),
            "money_units_delta": str(delta),
            "warning": (
                "Monetary refund already completed; only entitlement/reservation adjusted."
            ),
            "based_on_revision_id": base.id,
        },
        entitlement_snapshot=base.entitlement_snapshot,
        usage_snapshot=base.usage_snapshot,
        created_at=now,
    )
    db.add(rev)
    db.flush()

    prev_approved = request.approved_revision_id
    request.approved_revision_id = rev.id
    request.current_revision_number = next_number
    request.version = int(request.version or 0) + 1
    request.updated_at = now

    release_addon_refund_reservation(db, int(request.id), commit=False)
    ensure_addon_refund_reservation(db, request, rev, commit=False)

    evt = RefundAuditEvent(
        refund_request_id=request.id,
        refund_revision_id=rev.id,
        actor_user_id=int(admin_user_id),
        actor_type=RefundAuditActorType.ADMIN.value,
        action=RefundAuditAction.ENTITLEMENT_RECOVERY.value,
        previous_status=status,
        new_status=status,
        changed_fields={
            "approved_revision_id": {"from": prev_approved, "to": rev.id},
            "entitlement_action": {
                "from": base.entitlement_action,
                "to": correction.entitlement_action,
            },
            "addon_revoke_units": {
                "from": base.addon_revoke_units,
                "to": correction.revoke_units,
            },
        },
        reason=comment,
        event_metadata={
            "confirmed_refunded_amount": str(confirmed),
            "equivalent_units_money": str(equivalent),
            "money_units_delta": str(delta),
            "addon_revoke_units": correction.revoke_units,
            "provider_called": False,
        },
        created_at=now,
    )
    db.add(evt)

    if commit:
        db.commit()
        db.refresh(request)
        db.refresh(rev)

    return {
        "request": request,
        "revision": rev,
        "confirmed_refunded_amount": str(confirmed),
        "equivalent_units_money": str(equivalent),
        "money_units_delta": str(delta),
        "addon_revoke_units": correction.revoke_units,
        "entitlement_action": correction.entitlement_action,
    }
