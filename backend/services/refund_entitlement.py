"""
Refund entitlement apply (Этап 6.14.8).

Money refund and access change are separate operations.
Applies approved revision.entitlement_action only after refunded|partially_refunded.
Never mutates money ledger or calls payment provider.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from backend.models.checkout import CheckoutIntent, CheckoutProductType
from backend.models.refund import (
    RefundAuditAction,
    RefundAuditActorType,
    RefundAuditEvent,
    RefundEntitlementAction,
    RefundLedgerEntry,
    RefundRequest,
    RefundRequestStatus,
    RefundRevision,
)
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    GiftGrant,
    GiftGrantStatus,
    SubscriptionStatus,
    UserAddon,
    UserAddonStatus,
    UserSubscription,
)
from backend.services.refund_invariants import (
    RefundInvariantError,
    validate_optimistic_version,
    validate_status_transition,
)
from backend.services.tariff_entitlements import (
    EntitlementError,
    cancel_subscription_immediate,
    cancel_user_addon,
    expire_user_addon,
    reduce_user_addon_amount,
    schedule_subscription_end,
)
from backend.services.tariff_limits import get_user_tariff_limits

_MONEY_DONE = frozenset(
    {
        RefundRequestStatus.REFUNDED.value,
        RefundRequestStatus.PARTIALLY_REFUNDED.value,
    }
)

_APPLY_ENTRY = frozenset(
    {
        RefundRequestStatus.REFUNDED.value,
        RefundRequestStatus.PARTIALLY_REFUNDED.value,
        RefundRequestStatus.ENTITLEMENT_FAILED.value,
    }
)


class RefundEntitlementError(Exception):
    def __init__(self, message: str, *, code: str) -> None:
        self.message = message
        self.code = code
        super().__init__(message)


@dataclass
class ApplyEntitlementResult:
    request: RefundRequest
    outcome: str
    applied_action: str
    target_type: str | None
    target_id: int | None
    already_applied: bool = False
    error_code: str | None = None
    error_message: str | None = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _sanitize_metadata(metadata: dict | None) -> dict | None:
    if not metadata:
        return None
    forbidden = {
        "secret_key",
        "jwt",
        "token",
        "password",
        "credentials",
        "authorization",
        "secret",
    }
    out: dict[str, Any] = {}
    for k, v in metadata.items():
        key = str(k).lower()
        if key in forbidden or "secret" in key or "token" in key:
            continue
        if isinstance(v, (str, int, float, bool)) or v is None:
            out[str(k)[:64]] = v
    return out or None


def _write_audit(
    db: Session,
    request: RefundRequest,
    *,
    actor_user_id: int | None,
    action: str,
    previous_status: str | None = None,
    new_status: str | None = None,
    reason: str | None = None,
    metadata: dict | None = None,
    refund_revision_id: int | None = None,
) -> RefundAuditEvent:
    evt = RefundAuditEvent(
        refund_request_id=request.id,
        refund_revision_id=refund_revision_id,
        actor_user_id=actor_user_id,
        actor_type=RefundAuditActorType.ADMIN.value,
        action=action,
        previous_status=previous_status,
        new_status=new_status,
        reason=reason,
        event_metadata=_sanitize_metadata(metadata),
        created_at=_utcnow(),
    )
    db.add(evt)
    return evt


def _set_status(request: RefundRequest, new_status: str) -> str | None:
    previous = request.status
    if previous == new_status:
        return None
    try:
        validate_status_transition(current=previous, new=new_status)
    except RefundInvariantError as exc:
        raise RefundEntitlementError(exc.message, code=exc.code) from exc
    request.status = new_status
    request.updated_at = _utcnow()
    return previous


def _bump_version(request: RefundRequest, *, expected_version: int) -> None:
    try:
        validate_optimistic_version(request, expected_version=expected_version)
    except RefundInvariantError as exc:
        raise RefundEntitlementError(exc.message, code=exc.code) from exc
    request.version = int(request.version) + 1
    request.updated_at = _utcnow()


def _lock_request(db: Session, request_id: int) -> RefundRequest:
    req = (
        db.query(RefundRequest)
        .filter(RefundRequest.id == int(request_id))
        .with_for_update()
        .first()
    )
    if req is None:
        raise RefundEntitlementError("RefundRequest not found", code="request_not_found")
    return req


def _approved_revision(db: Session, request: RefundRequest) -> RefundRevision:
    if request.approved_revision_id is None:
        raise RefundEntitlementError(
            "Approved revision required",
            code="approved_revision_required",
        )
    rev = db.get(RefundRevision, int(request.approved_revision_id))
    if rev is None:
        raise RefundEntitlementError(
            "Approved revision not found",
            code="revision_not_found",
        )
    if int(rev.refund_request_id) != int(request.id):
        raise RefundEntitlementError(
            "Revision does not belong to request",
            code="revision_ownership",
        )
    if int(rev.revision_number) != int(request.current_revision_number):
        raise RefundEntitlementError(
            "Approved revision is not current",
            code="stale_revision",
        )
    return rev


def _pool_usage_unattributed(revision: RefundRevision) -> bool:
    snap = revision.usage_snapshot if isinstance(revision.usage_snapshot, dict) else {}
    if snap.get("legacy_unattributed"):
        return True
    ent = revision.entitlement_snapshot if isinstance(revision.entitlement_snapshot, dict) else {}
    if ent.get("fifo_precise") is True:
        return False
    return bool(snap.get("detectable_pool_usage_after_purchase"))


def _addon_revocable_units(
    db: Session, addon: UserAddon, *, refund_request_id: int | None = None
) -> int:
    """Units that may still be revoked: amount − fifo_used − reserved (+ this request's reserve)."""
    from backend.models.tariff import AddonRefundReservationStatus, AddonRefundUnitReservation
    from backend.services.tariff_addon_usage_ledger import fifo_ledger_used

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
    return max(0, int(addon.amount or 0) - used - reserved)


def _assert_limit_after_reduce(
    db: Session,
    *,
    user_id: int,
    addon: UserAddon,
    revoke_units: int,
) -> None:
    """Fail if reducing this addon would make effective limit < already used."""
    pkg = db.get(AddonPackage, int(addon.addon_package_id))
    if pkg is None:
        raise RefundEntitlementError(
            "Addon package not found",
            code="addon_package_not_found",
        )
    limits = get_user_tariff_limits(db, user_id)
    pkg_type = pkg.type.value if hasattr(pkg.type, "value") else str(pkg.type)

    if pkg_type == AddonPackageType.MESSAGES.value:
        limit = limits.messages_limit
        used = int(limits.messages_used or 0)
    elif pkg_type == AddonPackageType.ACTIVE_BOT.value:
        limit = limits.active_bots_limit
        used = int(limits.active_bots_used or 0)
    elif pkg_type == AddonPackageType.TEAM_MEMBER.value:
        limit = limits.team_members_limit
        used = int(limits.team_members_used or 0)
    else:
        return

    if limit is None:
        return
    new_limit = int(limit) - int(revoke_units)
    if new_limit < 0:
        new_limit = 0
    if used > new_limit:
        raise RefundEntitlementError(
            "Cannot reduce entitlement below already used amount",
            code="limit_below_usage",
        )


def _normalize_dt(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _dates_close(a: datetime, b: datetime, *, tol_sec: float = 2.0) -> bool:
    return abs((_normalize_dt(a) - _normalize_dt(b)).total_seconds()) <= tol_sec


def _subscription_already_terminal(sub: UserSubscription) -> bool:
    st = sub.status.value if hasattr(sub.status, "value") else str(sub.status)
    return st in (
        SubscriptionStatus.CANCELLED.value,
        SubscriptionStatus.EXPIRED.value,
    )


def _addon_already_terminal(addon: UserAddon) -> bool:
    st = addon.status.value if hasattr(addon.status, "value") else str(addon.status)
    return st in (
        UserAddonStatus.CANCELLED.value,
        UserAddonStatus.EXPIRED.value,
    )


def _scheduled_end_already_applied(
    sub: UserSubscription,
    *,
    effective_at: datetime,
) -> bool:
    """
    True only when target already matches approved cancel_at/expire_at outcome.

    Does not treat unrelated CANCELLED/EXPIRED (wrong date / early end) as success.
    """
    at = _normalize_dt(effective_at)
    now = _utcnow()
    status_val = (
        sub.status.value if hasattr(sub.status, "value") else str(sub.status)
    )
    period_end = _normalize_dt(sub.current_period_end)

    if status_val == SubscriptionStatus.ACTIVE.value:
        # Scheduled outcome: truncated end at approved date, renew off, still active.
        if bool(sub.auto_renew):
            return False
        if period_end < at and not _dates_close(period_end, at):
            # Access window ends earlier than approved — incompatible, not success.
            raise RefundEntitlementError(
                "Subscription ends earlier than approved entitlement_effective_at",
                code="incompatible_entitlement_state",
            )
        return _dates_close(period_end, at)

    if status_val in (
        SubscriptionStatus.CANCELLED.value,
        SubscriptionStatus.EXPIRED.value,
    ):
        # Terminal is only compatible when the approved date is already due
        # (schedule collapsed to immediate). Otherwise ended early / other reason.
        if at <= now:
            return True
        raise RefundEntitlementError(
            "Subscription already ended before approved entitlement_effective_at",
            code="incompatible_entitlement_state",
        )

    raise RefundEntitlementError(
        f"Unsupported subscription status {status_val!r} for scheduled end",
        code="incompatible_entitlement_state",
    )


def _apply_action(
    db: Session,
    *,
    request: RefundRequest,
    revision: RefundRevision,
    intent: CheckoutIntent,
) -> tuple[str, str | None, int | None, bool]:
    """
    Returns (outcome_label, target_type, target_id, already_done).
    Raises RefundEntitlementError on safe failures.
    """
    action = (revision.entitlement_action or RefundEntitlementAction.NONE.value).strip()
    user_id = int(request.user_id)

    if action == RefundEntitlementAction.NONE.value:
        return "not_required", None, None, False

    product = (intent.product_type or "").strip()

    # --- subscription actions ---
    if action in (
        RefundEntitlementAction.CANCEL_IMMEDIATE.value,
        RefundEntitlementAction.CANCEL_AT.value,
        RefundEntitlementAction.EXPIRE_AT.value,
    ):
        sub_id = intent.fulfilled_subscription_id
        if sub_id is None:
            raise RefundEntitlementError(
                "CheckoutIntent has no fulfilled_subscription_id",
                code="target_missing",
            )
        if product and product != CheckoutProductType.TARIFF.value:
            raise RefundEntitlementError(
                "Subscription action requires tariff purchase",
                code="product_type_mismatch",
            )
        sub = db.get(UserSubscription, int(sub_id))
        if sub is None:
            raise RefundEntitlementError(
                "Fulfilled subscription not found",
                code="subscription_not_found",
            )
        if int(sub.user_id) != user_id:
            raise RefundEntitlementError(
                "Fulfilled subscription belongs to another user",
                code="target_user_mismatch",
            )

        if action == RefundEntitlementAction.CANCEL_IMMEDIATE.value:
            if _subscription_already_terminal(sub):
                return "already_applied", "subscription", int(sub.id), True
            cancel_subscription_immediate(
                db,
                subscription_id=int(sub.id),
                expected_user_id=user_id,
                commit=False,
            )
            return "applied", "subscription", int(sub.id), False

        # cancel_at / expire_at — strict date match for already_applied
        effective = revision.entitlement_effective_at
        if effective is None:
            raise RefundEntitlementError(
                "entitlement_effective_at required for scheduled end",
                code="effective_at_required",
            )
        if _scheduled_end_already_applied(sub, effective_at=effective):
            return "already_applied", "subscription", int(sub.id), True
        schedule_subscription_end(
            db,
            subscription_id=int(sub.id),
            expected_user_id=user_id,
            effective_at=effective,
            commit=False,
        )
        return "applied", "subscription", int(sub.id), False

    # --- addon actions ---
    if action in (
        RefundEntitlementAction.CANCEL_ADDON.value,
        RefundEntitlementAction.EXPIRE_ADDON.value,
        RefundEntitlementAction.REDUCE_AMOUNT.value,
    ):
        addon_id = intent.fulfilled_addon_id
        if addon_id is None:
            raise RefundEntitlementError(
                "CheckoutIntent has no fulfilled_addon_id",
                code="target_missing",
            )
        if product and product != CheckoutProductType.ADDON.value:
            raise RefundEntitlementError(
                "Addon action requires addon purchase",
                code="product_type_mismatch",
            )
        addon = db.get(UserAddon, int(addon_id))
        if addon is None:
            raise RefundEntitlementError(
                "Fulfilled addon not found",
                code="addon_not_found",
            )
        if int(addon.user_id) != user_id:
            raise RefundEntitlementError(
                "Fulfilled addon belongs to another user",
                code="target_user_mismatch",
            )

        if _pool_usage_unattributed(revision) and action in (
            RefundEntitlementAction.CANCEL_ADDON.value,
            RefundEntitlementAction.EXPIRE_ADDON.value,
        ):
            raise RefundEntitlementError(
                "Addon pool usage is not attributed; manual review required",
                code="pool_usage_unattributed",
            )

        if _addon_already_terminal(addon):
            return "already_applied", "addon", int(addon.id), True

        revocable = _addon_revocable_units(db, addon, refund_request_id=int(request.id))

        if action == RefundEntitlementAction.CANCEL_ADDON.value:
            if revocable < int(addon.amount or 0):
                raise RefundEntitlementError(
                    "Cannot cancel addon with used or reserved units; reduce unused only",
                    code="cannot_revoke_used_or_reserved",
                )
            cancel_user_addon(
                db,
                user_addon_id=int(addon.id),
                expected_user_id=user_id,
                commit=False,
            )
            return "applied", "addon", int(addon.id), False

        if action == RefundEntitlementAction.EXPIRE_ADDON.value:
            if revocable < int(addon.amount or 0):
                raise RefundEntitlementError(
                    "Cannot expire addon with used or reserved units; reduce unused only",
                    code="cannot_revoke_used_or_reserved",
                )
            expire_user_addon(
                db,
                user_addon_id=int(addon.id),
                expected_user_id=user_id,
                commit=False,
            )
            return "applied", "addon", int(addon.id), False

        # reduce_amount
        revoke = revision.addon_revoke_units
        if revoke is None:
            raise RefundEntitlementError(
                "addon_revoke_units required for reduce_amount",
                code="revoke_units_required",
            )
        revoke_i = int(revoke)
        if revoke_i < 0:
            raise RefundEntitlementError(
                "addon_revoke_units must be >= 0",
                code="negative_revoke_units",
            )
        grant = int(addon.amount or 0)
        if revision.addon_total_units is not None:
            # Cap revoke to what this purchase granted (snapshot).
            grant_cap = int(revision.addon_total_units)
            if revoke_i > grant_cap:
                raise RefundEntitlementError(
                    "Cannot revoke more than this purchase granted",
                    code="revoke_exceeds_grant",
                )
        if revoke_i > grant:
            raise RefundEntitlementError(
                "Cannot revoke more than current addon amount",
                code="revoke_exceeds_grant",
            )
        if revoke_i > revocable:
            raise RefundEntitlementError(
                "Cannot revoke used or reserved units",
                code="cannot_revoke_used_or_reserved",
            )
        if _pool_usage_unattributed(revision) and revoke_i > 0:
            # Partial reduce with unattributed pool usage is unsafe without FIFO.
            raise RefundEntitlementError(
                "Addon pool usage is not attributed; manual review required",
                code="pool_usage_unattributed",
            )
        if revoke_i > 0:
            _assert_limit_after_reduce(
                db, user_id=user_id, addon=addon, revoke_units=revoke_i
            )
            try:
                reduce_user_addon_amount(
                    db,
                    user_addon_id=int(addon.id),
                    expected_user_id=user_id,
                    revoke_units=revoke_i,
                    commit=False,
                )
            except EntitlementError as exc:
                raise RefundEntitlementError(exc.message, code=exc.code) from exc
        return "applied", "addon", int(addon.id), False

    raise RefundEntitlementError(
        f"Unsupported entitlement_action {action!r}",
        code="unsupported_action",
    )


def apply_refund_entitlement(
    db: Session,
    request_id: int,
    *,
    expected_version: int,
    actor_user_id: int | None,
    commit: bool = True,
) -> ApplyEntitlementResult:
    """
    Apply access change for a money-confirmed refund request.
    Idempotent for completed / already-terminal targets.
    """
    request = _lock_request(db, request_id)
    status = request.status or ""

    if status == RefundRequestStatus.COMPLETED.value:
        try:
            validate_optimistic_version(request, expected_version=expected_version)
        except RefundInvariantError as exc:
            raise RefundEntitlementError(exc.message, code=exc.code) from exc
        rev = None
        if request.approved_revision_id is not None:
            rev = db.get(RefundRevision, int(request.approved_revision_id))
        action = (
            (rev.entitlement_action if rev else None)
            or RefundEntitlementAction.NONE.value
        )
        _write_audit(
            db,
            request,
            actor_user_id=actor_user_id,
            action=RefundAuditAction.ENTITLEMENT_ALREADY_APPLIED.value,
            reason="request_already_completed",
            refund_revision_id=request.approved_revision_id,
            metadata={"applied_action": action},
        )
        if commit:
            db.commit()
            db.refresh(request)
        return ApplyEntitlementResult(
            request=request,
            outcome="already_applied",
            applied_action=action,
            target_type=None,
            target_id=None,
            already_applied=True,
        )

    if status == RefundRequestStatus.ENTITLEMENT_PROCESSING.value:
        raise RefundEntitlementError(
            "Entitlement apply already in progress",
            code="apply_in_progress",
        )

    if status not in _APPLY_ENTRY:
        raise RefundEntitlementError(
            f"Apply entitlement not allowed from status {status!r}",
            code="apply_not_allowed",
        )

    revision = _approved_revision(db, request)
    intent = db.get(CheckoutIntent, int(request.checkout_intent_id))
    if intent is None:
        raise RefundEntitlementError(
            "CheckoutIntent not found",
            code="intent_not_found",
        )
    if int(intent.user_id) != int(request.user_id):
        raise RefundEntitlementError(
            "CheckoutIntent user mismatch",
            code="intent_user_mismatch",
        )

    ledger_count_before = (
        db.query(RefundLedgerEntry)
        .filter(RefundLedgerEntry.refund_request_id == request.id)
        .count()
    )

    _bump_version(request, expected_version=expected_version)
    prev = _set_status(request, RefundRequestStatus.ENTITLEMENT_PROCESSING.value)
    _write_audit(
        db,
        request,
        actor_user_id=actor_user_id,
        action=RefundAuditAction.ENTITLEMENT_APPLY_STARTED.value,
        previous_status=prev,
        new_status=request.status,
        refund_revision_id=revision.id,
        metadata={
            "entitlement_action": revision.entitlement_action,
            "idempotency_key": f"bf-ent-{request.id}-r{revision.id}",
        },
    )
    if prev:
        _write_audit(
            db,
            request,
            actor_user_id=actor_user_id,
            action=RefundAuditAction.STATUS_CHANGED.value,
            previous_status=prev,
            new_status=request.status,
            refund_revision_id=revision.id,
        )

    gifts_before = (
        db.query(GiftGrant)
        .filter(
            GiftGrant.target_user_id == int(request.user_id),
            GiftGrant.status == GiftGrantStatus.ACTIVE,
        )
        .count()
    )

    try:
        outcome_label, target_type, target_id, already = _apply_action(
            db, request=request, revision=revision, intent=intent
        )
    except RefundEntitlementError as exc:
        fail_prev = _set_status(
            request, RefundRequestStatus.ENTITLEMENT_FAILED.value
        )
        audit_action = (
            RefundAuditAction.ENTITLEMENT_MANUAL_REQUIRED.value
            if exc.code == "pool_usage_unattributed"
            else RefundAuditAction.ENTITLEMENT_FAILED.value
        )
        _write_audit(
            db,
            request,
            actor_user_id=actor_user_id,
            action=audit_action,
            previous_status=fail_prev,
            new_status=request.status,
            reason=exc.message,
            refund_revision_id=revision.id,
            metadata={"error_code": exc.code},
        )
        if fail_prev:
            _write_audit(
                db,
                request,
                actor_user_id=actor_user_id,
                action=RefundAuditAction.STATUS_CHANGED.value,
                previous_status=fail_prev,
                new_status=request.status,
                refund_revision_id=revision.id,
            )
        if commit:
            db.commit()
            db.refresh(request)
        return ApplyEntitlementResult(
            request=request,
            outcome="failed",
            applied_action=revision.entitlement_action,
            target_type=None,
            target_id=None,
            already_applied=False,
            error_code=exc.code,
            error_message=exc.message,
        )
    except EntitlementError as exc:
        fail_prev = _set_status(
            request, RefundRequestStatus.ENTITLEMENT_FAILED.value
        )
        _write_audit(
            db,
            request,
            actor_user_id=actor_user_id,
            action=RefundAuditAction.ENTITLEMENT_FAILED.value,
            previous_status=fail_prev,
            new_status=request.status,
            reason=exc.message,
            refund_revision_id=revision.id,
            metadata={"error_code": exc.code},
        )
        if commit:
            db.commit()
            db.refresh(request)
        return ApplyEntitlementResult(
            request=request,
            outcome="failed",
            applied_action=revision.entitlement_action,
            target_type=None,
            target_id=None,
            error_code=exc.code,
            error_message=exc.message,
        )
    except Exception:
        # Fail closed: never leave entitlement_processing after unexpected errors.
        fail_prev = _set_status(
            request, RefundRequestStatus.ENTITLEMENT_FAILED.value
        )
        _write_audit(
            db,
            request,
            actor_user_id=actor_user_id,
            action=RefundAuditAction.ENTITLEMENT_FAILED.value,
            previous_status=fail_prev,
            new_status=request.status,
            reason="Unexpected error during entitlement apply",
            refund_revision_id=revision.id,
            metadata={"error_code": "unexpected_error"},
        )
        if commit:
            db.commit()
            db.refresh(request)
        return ApplyEntitlementResult(
            request=request,
            outcome="failed",
            applied_action=revision.entitlement_action,
            target_type=None,
            target_id=None,
            already_applied=False,
            error_code="unexpected_error",
            error_message="Unexpected error during entitlement apply",
        )

    gifts_after = (
        db.query(GiftGrant)
        .filter(
            GiftGrant.target_user_id == int(request.user_id),
            GiftGrant.status == GiftGrantStatus.ACTIVE,
        )
        .count()
    )
    if gifts_after != gifts_before:
        # Should be unreachable — fail closed without completing.
        fail_prev = _set_status(
            request, RefundRequestStatus.ENTITLEMENT_FAILED.value
        )
        _write_audit(
            db,
            request,
            actor_user_id=actor_user_id,
            action=RefundAuditAction.ENTITLEMENT_FAILED.value,
            previous_status=fail_prev,
            new_status=request.status,
            reason="Unexpected gift mutation during entitlement apply",
            refund_revision_id=revision.id,
            metadata={"error_code": "gift_mutation_forbidden"},
        )
        if commit:
            db.commit()
            db.refresh(request)
        return ApplyEntitlementResult(
            request=request,
            outcome="failed",
            applied_action=revision.entitlement_action,
            target_type=target_type,
            target_id=target_id,
            error_code="gift_mutation_forbidden",
            error_message="Unexpected gift mutation during entitlement apply",
        )

    ledger_count_after = (
        db.query(RefundLedgerEntry)
        .filter(RefundLedgerEntry.refund_request_id == request.id)
        .count()
    )
    if ledger_count_after != ledger_count_before:
        fail_prev = _set_status(
            request, RefundRequestStatus.ENTITLEMENT_FAILED.value
        )
        _write_audit(
            db,
            request,
            actor_user_id=actor_user_id,
            action=RefundAuditAction.ENTITLEMENT_FAILED.value,
            previous_status=fail_prev,
            new_status=request.status,
            reason="Unexpected ledger mutation during entitlement apply",
            refund_revision_id=revision.id,
            metadata={"error_code": "ledger_mutation_forbidden"},
        )
        if commit:
            db.commit()
            db.refresh(request)
        return ApplyEntitlementResult(
            request=request,
            outcome="failed",
            applied_action=revision.entitlement_action,
            target_type=target_type,
            target_id=target_id,
            error_code="ledger_mutation_forbidden",
            error_message="Unexpected ledger mutation during entitlement apply",
        )

    done_prev = _set_status(request, RefundRequestStatus.COMPLETED.value)
    request.completed_at = request.completed_at or _utcnow()

    from backend.services.refund_addon_reservation import (
        consume_addon_refund_reservation,
    )

    consume_addon_refund_reservation(db, int(request.id), commit=False)

    if outcome_label == "not_required":
        audit_action = RefundAuditAction.ENTITLEMENT_NOT_REQUIRED.value
        outcome = "not_required"
    elif already or outcome_label == "already_applied":
        audit_action = RefundAuditAction.ENTITLEMENT_ALREADY_APPLIED.value
        outcome = "already_applied"
    else:
        audit_action = RefundAuditAction.ENTITLEMENT_APPLIED.value
        outcome = "applied"

    _write_audit(
        db,
        request,
        actor_user_id=actor_user_id,
        action=audit_action,
        previous_status=done_prev,
        new_status=request.status,
        refund_revision_id=revision.id,
        metadata={
            "applied_action": revision.entitlement_action,
            "target_type": target_type,
            "target_id": target_id,
        },
    )
    if done_prev:
        _write_audit(
            db,
            request,
            actor_user_id=actor_user_id,
            action=RefundAuditAction.STATUS_CHANGED.value,
            previous_status=done_prev,
            new_status=request.status,
            refund_revision_id=revision.id,
        )

    if commit:
        db.commit()
        db.refresh(request)

    return ApplyEntitlementResult(
        request=request,
        outcome=outcome,
        applied_action=revision.entitlement_action,
        target_type=target_type,
        target_id=target_id,
        already_applied=outcome == "already_applied",
    )
