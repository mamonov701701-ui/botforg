"""
Refund revision lifecycle (Этап 6.14.2).

Immutable revisions, optimistic locking, audit events.
Does not start refund_processing / provider refund / entitlement mutate.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.refund import (
    REFUND_FINANCIAL_FROZEN_STATUSES,
    REFUND_TERMINAL_STATUSES,
    RefundAuditAction,
    RefundAuditActorType,
    RefundAuditEvent,
    RefundCalculationStatus,
    RefundRequest,
    RefundRequestStatus,
    RefundRevision,
    RefundRevisionType,
    RefundType,
)
from backend.services.refund_calculation import (
    RefundCalculationError,
    RefundCalculationResult,
    build_refund_calculation,
    fingerprints_match,
    load_ledger_balance,
)
from backend.services.refund_invariants import (
    RefundInvariantError,
    assert_financials_not_frozen,
    normalize_currency,
    round_money,
    validate_current_revision,
    validate_optimistic_version,
    validate_refund_amount_bounds,
    validate_revision_ownership,
    validate_status_transition,
)

# Statuses where automatic recalculation / admin edit are allowed (6.14.2).
_MUTABLE_WORKFLOW = frozenset(
    {
        RefundRequestStatus.SUBMITTED.value,
        RefundRequestStatus.CALCULATING.value,
        RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
        RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value,
        RefundRequestStatus.ADMIN_EDITED.value,
        RefundRequestStatus.NEEDS_INFORMATION.value,
        RefundRequestStatus.AWAITING_FINAL_CONFIRMATION.value,
        RefundRequestStatus.CALCULATION_FAILED.value,
    }
)

_RECALC_ALLOWED = frozenset(
    {
        RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
        RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value,
        RefundRequestStatus.ADMIN_EDITED.value,
        RefundRequestStatus.NEEDS_INFORMATION.value,
        RefundRequestStatus.AWAITING_FINAL_CONFIRMATION.value,
        RefundRequestStatus.CALCULATION_FAILED.value,
    }
)

_ADMIN_EDIT_ALLOWED = frozenset(
    {
        RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
        RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value,
        RefundRequestStatus.ADMIN_EDITED.value,
        RefundRequestStatus.NEEDS_INFORMATION.value,
        RefundRequestStatus.AWAITING_FINAL_CONFIRMATION.value,
    }
)


class RefundRevisionServiceError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str,
        new_revision: RefundRevision | None = None,
    ) -> None:
        self.message = message
        self.code = code
        self.new_revision = new_revision
        super().__init__(message)


@dataclass
class ApproveRevisionResult:
    approved: bool
    request: RefundRequest
    revision: RefundRevision | None
    stale: bool = False
    new_revision: RefundRevision | None = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _lock_request(db: Session, request_id: int) -> RefundRequest:
    req = (
        db.query(RefundRequest)
        .filter(RefundRequest.id == int(request_id))
        .with_for_update()
        .first()
    )
    if req is None:
        raise RefundRevisionServiceError(
            "RefundRequest not found", code="request_not_found"
        )
    return req


def _assert_editable(request: RefundRequest) -> None:
    status = request.status or ""
    if status in REFUND_FINANCIAL_FROZEN_STATUSES:
        raise RefundRevisionServiceError(
            "Financial data is frozen", code="financials_frozen"
        )
    if status in REFUND_TERMINAL_STATUSES:
        raise RefundRevisionServiceError(
            "Request is terminal", code="request_terminal"
        )
    if status == RefundRequestStatus.APPROVED.value:
        raise RefundRevisionServiceError(
            "Approved request is terminal for stage 6.14.2",
            code="approved_terminal",
        )
    if status not in _MUTABLE_WORKFLOW:
        raise RefundRevisionServiceError(
            f"Request status {status!r} is not editable",
            code="status_not_editable",
        )


def _set_status(
    request: RefundRequest,
    new_status: str,
    *,
    audit_events: list[dict[str, Any]],
) -> None:
    previous = request.status
    if previous == new_status:
        return
    validate_status_transition(current=previous, new=new_status)
    request.status = new_status
    request.updated_at = _utcnow()
    audit_events.append(
        {
            "action": RefundAuditAction.STATUS_CHANGED.value,
            "previous_status": previous,
            "new_status": new_status,
        }
    )


def _bump_version(request: RefundRequest, *, expected_version: int | None) -> None:
    if expected_version is not None:
        validate_optimistic_version(request, expected_version=expected_version)
    request.version = int(request.version) + 1
    request.updated_at = _utcnow()


def _write_audit(
    db: Session,
    request: RefundRequest,
    *,
    actor_type: str,
    actor_user_id: int | None,
    action: str,
    previous_status: str | None = None,
    new_status: str | None = None,
    changed_fields: dict | list | None = None,
    reason: str | None = None,
    metadata: dict | None = None,
    refund_revision_id: int | None = None,
) -> RefundAuditEvent:
    # Strip forbidden keys if somehow present.
    safe_meta = _sanitize_metadata(metadata)
    evt = RefundAuditEvent(
        refund_request_id=request.id,
        refund_revision_id=refund_revision_id,
        actor_user_id=actor_user_id,
        actor_type=actor_type,
        action=action,
        previous_status=previous_status,
        new_status=new_status,
        changed_fields=changed_fields,
        reason=reason,
        event_metadata=safe_meta,
        created_at=_utcnow(),
    )
    db.add(evt)
    from backend.services.refund_notification_producer import after_refund_audit_written

    after_refund_audit_written(db, request=request, audit_event=evt)
    return evt


_FORBIDDEN_META_KEYS = frozenset(
    {
        "secret_key",
        "jwt",
        "token",
        "password",
        "credentials",
        "authorization",
        "raw_provider_payload",
        "provider_payload",
        "card_number",
        "pan",
        "cvv",
    }
)


def _sanitize_metadata(metadata: dict | None) -> dict | None:
    if metadata is None:
        return None
    out: dict[str, Any] = {}
    for k, v in metadata.items():
        key = str(k).lower()
        if key in _FORBIDDEN_META_KEYS or any(x in key for x in ("secret", "password", "token")):
            continue
        out[str(k)] = v
    return out


def _result_to_revision(
    request: RefundRequest,
    result: RefundCalculationResult,
    *,
    revision_number: int,
    revision_type: str,
    created_by_user_id: int | None,
    based_on_revision_id: int | None,
    adjustment_reason_category: str | None = None,
    adjustment_comment: str | None = None,
    final_refund_amount: Decimal | None = None,
    proposed_override: Decimal | None = None,
    refund_type_override: str | None = None,
    calculation_status_override: str | None = None,
    entitlement_action_override: str | None = None,
    entitlement_effective_at_override: datetime | None = None,
    addon_revoke_units_override: int | None = None,
    extra_snapshot: dict | None = None,
) -> RefundRevision:
    proposed = (
        round_money(proposed_override)
        if proposed_override is not None
        else result.proposed_refund_amount
    )
    calc_snap = dict(result.calculation_snapshot or {})
    if extra_snapshot:
        calc_snap.update(extra_snapshot)
    calc_snap["input_fingerprint"] = result.input_fingerprint

    return RefundRevision(
        refund_request_id=request.id,
        revision_number=revision_number,
        revision_type=revision_type,
        created_by_user_id=created_by_user_id,
        based_on_revision_id=based_on_revision_id,
        calculation_status=calculation_status_override or result.calculation_status,
        refund_type=refund_type_override or result.refund_type,
        currency=normalize_currency(result.currency),
        paid_amount=result.paid_amount,
        prior_refunded_amount=result.prior_refunded_amount,
        proposed_refund_amount=proposed,
        final_refund_amount=final_refund_amount,
        calculation_at=result.calculation_at,
        period_start=result.period_start,
        period_end=result.period_end,
        used_time_seconds=result.used_time_seconds,
        total_time_seconds=result.total_time_seconds,
        addon_total_units=result.addon_total_units,
        addon_used_units=result.addon_used_units,
        addon_revoke_units=(
            addon_revoke_units_override
            if addon_revoke_units_override is not None
            else result.addon_revoke_units
        ),
        entitlement_action=entitlement_action_override or result.entitlement_action,
        entitlement_effective_at=(
            entitlement_effective_at_override
            if entitlement_effective_at_override is not None
            else result.entitlement_effective_at
        ),
        adjustment_reason_category=adjustment_reason_category,
        adjustment_comment=adjustment_comment,
        calculation_snapshot=calc_snap,
        entitlement_snapshot=result.entitlement_snapshot,
        usage_snapshot=result.usage_snapshot,
        created_at=_utcnow(),
    )


def _allocate_revision_number(request: RefundRequest) -> int:
    return int(request.current_revision_number or 0) + 1


def _refresh_current_revision_number(db: Session, request: RefundRequest) -> None:
    max_num = (
        db.query(RefundRevision.revision_number)
        .filter(RefundRevision.refund_request_id == request.id)
        .order_by(RefundRevision.revision_number.desc())
        .first()
    )
    if max_num:
        request.current_revision_number = int(max_num[0])


def _persist_revision_with_collision_recovery(
    db: Session,
    request: RefundRequest,
    build_rev,
    *,
    max_attempts: int = 3,
) -> RefundRevision:
    """Insert revision; on unique (request, number) collision retry with next number."""
    last_error: Exception | None = None
    for _ in range(max_attempts):
        number = _allocate_revision_number(request)
        rev = build_rev(number)
        try:
            with db.begin_nested():
                db.add(rev)
                db.flush()
        except IntegrityError as exc:
            last_error = exc
            _refresh_current_revision_number(db, request)
            continue
        request.current_revision_number = number
        return rev
    raise RefundRevisionServiceError(
        "Could not allocate unique revision_number",
        code="revision_number_conflict",
    ) from last_error


def _apply_calculation_status(
    request: RefundRequest,
    result: RefundCalculationResult,
    *,
    audit_events: list[dict[str, Any]],
) -> None:
    _set_status(request, result.request_status_after, audit_events=audit_events)


def create_initial_automatic_revision(
    db: Session,
    request_id: int,
    *,
    expected_version: int | None = None,
    calculation_at: datetime | None = None,
    actor_user_id: int | None = None,
    commit: bool = True,
) -> RefundRevision:
    """submitted → calculating → (awaiting_admin_review | manual_review_required | calculation_failed)."""
    request = _lock_request(db, request_id)
    if request.status != RefundRequestStatus.SUBMITTED.value:
        raise RefundRevisionServiceError(
            "Initial revision requires status=submitted",
            code="invalid_initial_status",
        )
    if int(request.current_revision_number or 0) != 0:
        raise RefundRevisionServiceError(
            "Initial revision already exists",
            code="revision_already_exists",
        )

    audit_buf: list[dict[str, Any]] = []
    try:
        _bump_version(request, expected_version=expected_version)
        _set_status(
            request,
            RefundRequestStatus.CALCULATING.value,
            audit_events=audit_buf,
        )
        db.flush()

        result = build_refund_calculation(
            db, request, calculation_at=calculation_at
        )

        def _build(number: int) -> RefundRevision:
            return _result_to_revision(
                request,
                result,
                revision_number=number,
                revision_type=RefundRevisionType.AUTOMATIC.value,
                created_by_user_id=None,
                based_on_revision_id=None,
            )

        rev = _persist_revision_with_collision_recovery(db, request, _build)
        _apply_calculation_status(request, result, audit_events=audit_buf)

        for item in audit_buf:
            _write_audit(
                db,
                request,
                actor_type=RefundAuditActorType.SYSTEM.value,
                actor_user_id=actor_user_id,
                action=item["action"],
                previous_status=item.get("previous_status"),
                new_status=item.get("new_status"),
                refund_revision_id=rev.id,
            )
        _write_audit(
            db,
            request,
            actor_type=RefundAuditActorType.SYSTEM.value,
            actor_user_id=actor_user_id,
            action=RefundAuditAction.REVISION_CREATED.value,
            refund_revision_id=rev.id,
            metadata={
                "revision_number": rev.revision_number,
                "revision_type": rev.revision_type,
                "input_fingerprint": result.input_fingerprint,
            },
        )
        if commit:
            db.commit()
            db.refresh(rev)
            db.refresh(request)
        return rev
    except (RefundCalculationError, RefundInvariantError) as exc:
        # When commit=False, let the caller own the transaction (no rollback).
        if commit:
            db.rollback()
        code = getattr(exc, "code", "calculation_error")
        raise RefundRevisionServiceError(str(exc), code=code) from exc


def recalculate_automatic_revision(
    db: Session,
    request_id: int,
    *,
    expected_version: int,
    calculation_at: datetime | None = None,
    actor_user_id: int | None = None,
    commit: bool = True,
) -> RefundRevision:
    """Create a new automatic revision from current server-side data."""
    request = _lock_request(db, request_id)
    _assert_editable(request)
    assert_financials_not_frozen(request)
    if request.status not in _RECALC_ALLOWED:
        raise RefundRevisionServiceError(
            f"Recalculate not allowed from status {request.status!r}",
            code="recalculate_not_allowed",
        )

    audit_buf: list[dict[str, Any]] = []
    based_on_id = None
    if request.current_revision_number:
        prev = (
            db.query(RefundRevision)
            .filter(
                RefundRevision.refund_request_id == request.id,
                RefundRevision.revision_number == request.current_revision_number,
            )
            .first()
        )
        based_on_id = prev.id if prev else None

    try:
        _bump_version(request, expected_version=expected_version)
        _set_status(
            request,
            RefundRequestStatus.CALCULATING.value,
            audit_events=audit_buf,
        )
        db.flush()

        result = build_refund_calculation(
            db, request, calculation_at=calculation_at
        )

        def _build(number: int) -> RefundRevision:
            return _result_to_revision(
                request,
                result,
                revision_number=number,
                revision_type=RefundRevisionType.AUTOMATIC.value,
                created_by_user_id=None,
                based_on_revision_id=based_on_id,
                extra_snapshot={"recalculated": True},
            )

        rev = _persist_revision_with_collision_recovery(db, request, _build)
        # Mark previous automatic calc as superseded in audit only (rows immutable).
        _apply_calculation_status(request, result, audit_events=audit_buf)

        for item in audit_buf:
            _write_audit(
                db,
                request,
                actor_type=RefundAuditActorType.SYSTEM.value,
                actor_user_id=actor_user_id,
                action=item["action"],
                previous_status=item.get("previous_status"),
                new_status=item.get("new_status"),
                refund_revision_id=rev.id,
            )
        _write_audit(
            db,
            request,
            actor_type=RefundAuditActorType.SYSTEM.value,
            actor_user_id=actor_user_id,
            action=RefundAuditAction.REVISION_CREATED.value,
            refund_revision_id=rev.id,
            metadata={
                "revision_number": rev.revision_number,
                "revision_type": rev.revision_type,
                "recalculated": True,
                "input_fingerprint": result.input_fingerprint,
            },
        )
        if commit:
            db.commit()
            db.refresh(rev)
            db.refresh(request)
        return rev
    except (RefundCalculationError, RefundInvariantError) as exc:
        db.rollback()
        code = getattr(exc, "code", "calculation_error")
        raise RefundRevisionServiceError(str(exc), code=code) from exc


def create_admin_revision(
    db: Session,
    request_id: int,
    *,
    based_on_revision_id: int,
    admin_user_id: int,
    expected_version: int,
    proposed_refund_amount: Decimal | str,
    adjustment_reason_category: str,
    adjustment_comment: str,
    refund_type: str | None = None,
    entitlement_action: str | None = None,
    entitlement_effective_at: datetime | None = None,
    addon_revoke_units: int | None = None,
    final_refund_amount: Decimal | str | None = None,
    commit: bool = True,
) -> RefundRevision:
    """Admin edit: requires reason+comment, based_on, bounds; status → admin_edited."""
    request = _lock_request(db, request_id)
    _assert_editable(request)
    assert_financials_not_frozen(request)
    if request.status not in _ADMIN_EDIT_ALLOWED:
        raise RefundRevisionServiceError(
            f"Admin edit not allowed from status {request.status!r}",
            code="admin_edit_not_allowed",
        )

    reason = (adjustment_reason_category or "").strip()
    comment = (adjustment_comment or "").strip()
    if not reason or not comment:
        raise RefundRevisionServiceError(
            "adjustment_reason_category and adjustment_comment are required",
            code="adjustment_required",
        )

    base = db.get(RefundRevision, int(based_on_revision_id))
    if base is None:
        raise RefundRevisionServiceError(
            "based_on revision not found", code="based_on_not_found"
        )
    try:
        validate_revision_ownership(request, base)
        validate_current_revision(request, base)

        paid = round_money(base.paid_amount)
        # Cap against live ledger: confirmed + reserved + provider_unknown.
        # prior_refunded on revision = confirmed only; do not treat reserved as refunded.
        balance = load_ledger_balance(
            db,
            checkout_intent_id=request.checkout_intent_id,
            paid_amount=paid,
        )
        allocated = round_money(
            balance.confirmed_refunded_amount
            + balance.active_reserved_amount
            + balance.provider_unknown_amount
        )
        proposed = validate_refund_amount_bounds(
            refund_amount=proposed_refund_amount,
            paid_amount=paid,
            prior_refunded_amount=allocated,
        )
        final_amt = (
            validate_refund_amount_bounds(
                refund_amount=final_refund_amount,
                paid_amount=paid,
                prior_refunded_amount=allocated,
            )
            if final_refund_amount is not None
            else None
        )

        max_r = balance.refundable_available_amount
        resolved_type = refund_type
        if resolved_type is None:
            resolved_type = (
                RefundType.FULL.value
                if proposed == max_r and max_r > 0
                else RefundType.PARTIAL.value
            )
        if resolved_type not in {RefundType.FULL.value, RefundType.PARTIAL.value}:
            raise RefundRevisionServiceError(
                "Invalid refund_type", code="invalid_refund_type"
            )
        if resolved_type == RefundType.FULL.value and proposed != max_r:
            raise RefundRevisionServiceError(
                "full refund_type requires proposed == paid − prior",
                code="full_partial_mismatch",
            )
        if resolved_type == RefundType.PARTIAL.value and proposed == max_r and max_r > 0:
            resolved_type = RefundType.FULL.value

        if addon_revoke_units is not None and addon_revoke_units < 0:
            raise RefundRevisionServiceError(
                "addon_revoke_units must be >= 0", code="negative_revoke_units"
            )
        if (
            addon_revoke_units is not None
            and base.addon_total_units is not None
            and addon_revoke_units > int(base.addon_total_units)
        ):
            raise RefundRevisionServiceError(
                "addon_revoke_units exceeds addon_total_units",
                code="revoke_exceeds_total",
            )

        changed_fields: dict[str, Any] = {
            "proposed_refund_amount": {
                "from": str(round_money(base.proposed_refund_amount)),
                "to": str(proposed),
            }
        }
        if resolved_type != base.refund_type:
            changed_fields["refund_type"] = {
                "from": base.refund_type,
                "to": resolved_type,
            }
        if entitlement_action and entitlement_action != base.entitlement_action:
            changed_fields["entitlement_action"] = {
                "from": base.entitlement_action,
                "to": entitlement_action,
            }
        if (
            addon_revoke_units is not None
            and addon_revoke_units != base.addon_revoke_units
        ):
            changed_fields["addon_revoke_units"] = {
                "from": base.addon_revoke_units,
                "to": addon_revoke_units,
            }

        audit_buf: list[dict[str, Any]] = []
        _bump_version(request, expected_version=expected_version)

        # Rebuild auto context snapshot for transparency (admin stores auto + overrides).
        auto_result = build_refund_calculation(db, request)

        def _build(number: int) -> RefundRevision:
            return _result_to_revision(
                request,
                auto_result,
                revision_number=number,
                revision_type=RefundRevisionType.ADMIN.value,
                created_by_user_id=admin_user_id,
                based_on_revision_id=base.id,
                adjustment_reason_category=reason,
                adjustment_comment=comment,
                final_refund_amount=final_amt,
                proposed_override=proposed,
                refund_type_override=resolved_type,
                entitlement_action_override=entitlement_action,
                entitlement_effective_at_override=entitlement_effective_at,
                addon_revoke_units_override=addon_revoke_units,
                calculation_status_override=RefundCalculationStatus.OK.value,
                extra_snapshot={
                    "admin_edit": True,
                    "auto_snapshot": base.calculation_snapshot,
                    "based_on_revision_id": base.id,
                    "based_on_revision_number": base.revision_number,
                    "changed_fields": changed_fields,
                    "admin_proposed_refund_amount": str(proposed),
                },
            )

        rev = _persist_revision_with_collision_recovery(db, request, _build)

        _set_status(
            request,
            RefundRequestStatus.ADMIN_EDITED.value,
            audit_events=audit_buf,
        )

        for item in audit_buf:
            _write_audit(
                db,
                request,
                actor_type=RefundAuditActorType.ADMIN.value,
                actor_user_id=admin_user_id,
                action=item["action"],
                previous_status=item.get("previous_status"),
                new_status=item.get("new_status"),
                refund_revision_id=rev.id,
            )
        from backend.services.refund_addon_reservation import (
            release_addon_refund_reservation,
        )

        release_addon_refund_reservation(db, int(request.id), commit=False)
        _write_audit(
            db,
            request,
            actor_type=RefundAuditActorType.ADMIN.value,
            actor_user_id=admin_user_id,
            action=RefundAuditAction.REVISION_CREATED.value,
            refund_revision_id=rev.id,
            changed_fields=changed_fields,
            reason=reason,
            metadata={
                "revision_number": rev.revision_number,
                "revision_type": rev.revision_type,
                "adjustment_comment_present": True,
            },
        )
        if commit:
            db.commit()
            db.refresh(rev)
            db.refresh(request)
        return rev
    except (RefundCalculationError, RefundInvariantError) as exc:
        db.rollback()
        code = getattr(exc, "code", "admin_edit_error")
        raise RefundRevisionServiceError(str(exc), code=code) from exc


def confirm_admin_revision(
    db: Session,
    request_id: int,
    *,
    expected_version: int,
    actor_user_id: int,
    commit: bool = True,
) -> RefundRequest:
    """admin_edited → awaiting_final_confirmation."""
    request = _lock_request(db, request_id)
    _assert_editable(request)
    if request.status != RefundRequestStatus.ADMIN_EDITED.value:
        raise RefundRevisionServiceError(
            "confirm requires status=admin_edited",
            code="invalid_confirm_status",
        )
    audit_buf: list[dict[str, Any]] = []
    try:
        _bump_version(request, expected_version=expected_version)
        _set_status(
            request,
            RefundRequestStatus.AWAITING_FINAL_CONFIRMATION.value,
            audit_events=audit_buf,
        )
        for item in audit_buf:
            _write_audit(
                db,
                request,
                actor_type=RefundAuditActorType.ADMIN.value,
                actor_user_id=actor_user_id,
                action=item["action"],
                previous_status=item.get("previous_status"),
                new_status=item.get("new_status"),
            )
        if commit:
            db.commit()
            db.refresh(request)
        return request
    except RefundInvariantError as exc:
        db.rollback()
        raise RefundRevisionServiceError(str(exc), code=exc.code) from exc


def approve_revision(
    db: Session,
    request_id: int,
    *,
    revision_id: int,
    expected_version: int,
    actor_user_id: int | None = None,
    commit: bool = True,
) -> ApproveRevisionResult:
    """
    Approve current revision after re-checking usage/prior fingerprint.

    On stale inputs: create new automatic revision, do not approve, code revision_stale.
    Does not transition to refund_processing (terminal for 6.14.2 = approved).
    """
    request = _lock_request(db, request_id)
    _assert_editable(request)
    assert_financials_not_frozen(request)

    if request.status not in {
        RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
        RefundRequestStatus.AWAITING_FINAL_CONFIRMATION.value,
    }:
        raise RefundRevisionServiceError(
            f"Approve not allowed from status {request.status!r}",
            code="approve_not_allowed",
        )

    revision = db.get(RefundRevision, int(revision_id))
    if revision is None:
        raise RefundRevisionServiceError("Revision not found", code="revision_not_found")

    try:
        validate_current_revision(request, revision)

        if revision.calculation_status not in {
            RefundCalculationStatus.OK.value,
        }:
            raise RefundRevisionServiceError(
                "Only ok calculation_status revisions can be approved",
                code="calculation_not_ok",
            )

        fresh = build_refund_calculation(db, request)
        stored_fp = None
        if isinstance(revision.calculation_snapshot, dict):
            stored_fp = revision.calculation_snapshot.get("input_fingerprint")
        if not fingerprints_match(stored_fp, fresh.input_fingerprint):
            # Stale: create new automatic revision, do not approve.
            audit_buf: list[dict[str, Any]] = []
            _bump_version(request, expected_version=expected_version)
            _set_status(
                request,
                RefundRequestStatus.CALCULATING.value,
                audit_events=audit_buf,
            )
            db.flush()

            def _build(number: int) -> RefundRevision:
                return _result_to_revision(
                    request,
                    fresh,
                    revision_number=number,
                    revision_type=RefundRevisionType.AUTOMATIC.value,
                    created_by_user_id=None,
                    based_on_revision_id=revision.id,
                    extra_snapshot={
                        "stale_recalc": True,
                        "superseded_revision_id": revision.id,
                    },
                )

            new_rev = _persist_revision_with_collision_recovery(db, request, _build)
            _apply_calculation_status(request, fresh, audit_events=audit_buf)
            for item in audit_buf:
                _write_audit(
                    db,
                    request,
                    actor_type=RefundAuditActorType.SYSTEM.value,
                    actor_user_id=actor_user_id,
                    action=item["action"],
                    previous_status=item.get("previous_status"),
                    new_status=item.get("new_status"),
                    refund_revision_id=new_rev.id,
                )
            _write_audit(
                db,
                request,
                actor_type=RefundAuditActorType.SYSTEM.value,
                actor_user_id=actor_user_id,
                action=RefundAuditAction.VALIDATION_REJECTED.value,
                refund_revision_id=revision.id,
                reason="revision_stale",
                metadata={
                    "code": "revision_stale",
                    "old_fingerprint": stored_fp,
                    "new_fingerprint": fresh.input_fingerprint,
                    "new_revision_id": new_rev.id,
                },
            )
            _write_audit(
                db,
                request,
                actor_type=RefundAuditActorType.SYSTEM.value,
                actor_user_id=actor_user_id,
                action=RefundAuditAction.REVISION_CREATED.value,
                refund_revision_id=new_rev.id,
                metadata={"stale_recalc": True},
            )
            if commit:
                db.commit()
                db.refresh(request)
                db.refresh(new_rev)
            return ApproveRevisionResult(
                approved=False,
                request=request,
                revision=revision,
                stale=True,
                new_revision=new_rev,
            )

        audit_buf = []
        _bump_version(request, expected_version=expected_version)
        prev_status = request.status
        _set_status(
            request,
            RefundRequestStatus.APPROVED.value,
            audit_events=audit_buf,
        )
        request.approved_revision_id = revision.id
        # Revisions stay immutable: final amount is proposed of approved revision
        # (recorded in audit metadata only at this stage).

        for item in audit_buf:
            _write_audit(
                db,
                request,
                actor_type=(
                    RefundAuditActorType.ADMIN.value
                    if actor_user_id
                    else RefundAuditActorType.SYSTEM.value
                ),
                actor_user_id=actor_user_id,
                action=item["action"],
                previous_status=item.get("previous_status"),
                new_status=item.get("new_status"),
                refund_revision_id=revision.id,
            )
        _write_audit(
            db,
            request,
            actor_type=(
                RefundAuditActorType.ADMIN.value
                if actor_user_id
                else RefundAuditActorType.SYSTEM.value
            ),
            actor_user_id=actor_user_id,
            action=RefundAuditAction.APPROVED_REVISION_SET.value,
            previous_status=prev_status,
            new_status=RefundRequestStatus.APPROVED.value,
            refund_revision_id=revision.id,
            metadata={
                "approved_revision_id": revision.id,
                "final_refund_amount": str(round_money(revision.proposed_refund_amount)),
            },
        )
        from backend.services.refund_addon_reservation import (
            ensure_addon_refund_reservation,
        )

        ensure_addon_refund_reservation(db, request, revision, commit=False)
        if commit:
            db.commit()
            db.refresh(request)
            db.refresh(revision)
        return ApproveRevisionResult(
            approved=True,
            request=request,
            revision=revision,
            stale=False,
        )
    except (RefundCalculationError, RefundInvariantError) as exc:
        db.rollback()
        code = getattr(exc, "code", "approve_error")
        raise RefundRevisionServiceError(str(exc), code=code) from exc


def mark_needs_information(
    db: Session,
    request_id: int,
    *,
    expected_version: int,
    actor_user_id: int,
    reason: str,
    commit: bool = True,
) -> RefundRequest:
    request = _lock_request(db, request_id)
    _assert_editable(request)
    audit_buf: list[dict[str, Any]] = []
    try:
        _bump_version(request, expected_version=expected_version)
        _set_status(
            request,
            RefundRequestStatus.NEEDS_INFORMATION.value,
            audit_events=audit_buf,
        )
        for item in audit_buf:
            _write_audit(
                db,
                request,
                actor_type=RefundAuditActorType.ADMIN.value,
                actor_user_id=actor_user_id,
                action=item["action"],
                previous_status=item.get("previous_status"),
                new_status=item.get("new_status"),
                reason=reason,
            )
        if commit:
            db.commit()
            db.refresh(request)
        return request
    except RefundInvariantError as exc:
        db.rollback()
        raise RefundRevisionServiceError(str(exc), code=exc.code) from exc


def reject_request(
    db: Session,
    request_id: int,
    *,
    expected_version: int,
    actor_user_id: int,
    reason: str,
    commit: bool = True,
) -> RefundRequest:
    request = _lock_request(db, request_id)
    _assert_editable(request)
    audit_buf: list[dict[str, Any]] = []
    try:
        _bump_version(request, expected_version=expected_version)
        _set_status(
            request,
            RefundRequestStatus.REJECTED.value,
            audit_events=audit_buf,
        )
        request.completed_at = _utcnow()
        # Drop stale approve pointer (e.g. orphan after interrupted approve).
        request.approved_revision_id = None
        for item in audit_buf:
            _write_audit(
                db,
                request,
                actor_type=RefundAuditActorType.ADMIN.value,
                actor_user_id=actor_user_id,
                action=item["action"],
                previous_status=item.get("previous_status"),
                new_status=item.get("new_status"),
                reason=reason,
            )
        from backend.services.refund_addon_reservation import (
            release_addon_refund_reservation,
        )

        release_addon_refund_reservation(db, int(request.id), commit=False)
        if commit:
            db.commit()
            db.refresh(request)
        return request
    except RefundInvariantError as exc:
        db.rollback()
        raise RefundRevisionServiceError(str(exc), code=exc.code) from exc


def cancel_request(
    db: Session,
    request_id: int,
    *,
    expected_version: int,
    actor_user_id: int | None = None,
    actor_type: str = RefundAuditActorType.USER.value,
    reason: str | None = None,
    commit: bool = True,
) -> RefundRequest:
    request = _lock_request(db, request_id)
    if request.status in REFUND_TERMINAL_STATUSES:
        raise RefundRevisionServiceError(
            "Request is already terminal", code="request_terminal"
        )
    if (request.status or "") in REFUND_FINANCIAL_FROZEN_STATUSES:
        raise RefundRevisionServiceError(
            "Cannot cancel frozen request", code="financials_frozen"
        )
    audit_buf: list[dict[str, Any]] = []
    try:
        _bump_version(request, expected_version=expected_version)
        _set_status(
            request,
            RefundRequestStatus.CANCELED.value,
            audit_events=audit_buf,
        )
        request.completed_at = _utcnow()
        request.approved_revision_id = None
        for item in audit_buf:
            _write_audit(
                db,
                request,
                actor_type=actor_type,
                actor_user_id=actor_user_id,
                action=item["action"],
                previous_status=item.get("previous_status"),
                new_status=item.get("new_status"),
                reason=reason,
            )
        from backend.services.refund_addon_reservation import (
            release_addon_refund_reservation,
        )

        release_addon_refund_reservation(db, int(request.id), commit=False)
        if commit:
            db.commit()
            db.refresh(request)
        return request
    except RefundInvariantError as exc:
        db.rollback()
        raise RefundRevisionServiceError(str(exc), code=exc.code) from exc


def provide_user_information(
    db: Session,
    request_id: int,
    *,
    expected_version: int,
    actor_user_id: int,
    message: str,
    commit: bool = True,
) -> RefundRequest:
    """
    Ответ пользователя на needs_information (6.14.10В-1).

    Один audit event user_information_provided (без отдельного status_changed).
    Не меняет исходный user_comment.
    """
    text = (message or "").strip()
    if not text:
        raise RefundRevisionServiceError(
            "Message is required", code="message_required"
        )
    if len(text) > 2000:
        raise RefundRevisionServiceError(
            "Message is too long", code="message_too_long"
        )

    request = _lock_request(db, request_id)
    if (request.status or "") != RefundRequestStatus.NEEDS_INFORMATION.value:
        raise RefundRevisionServiceError(
            "Request is not waiting for user information",
            code="invalid_status_for_reply",
        )

    previous = request.status
    try:
        _bump_version(request, expected_version=expected_version)
        validate_status_transition(
            current=previous,
            new=RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
        )
        request.status = RefundRequestStatus.AWAITING_ADMIN_REVIEW.value
        request.updated_at = _utcnow()
        _write_audit(
            db,
            request,
            actor_type=RefundAuditActorType.USER.value,
            actor_user_id=int(actor_user_id),
            action=RefundAuditAction.USER_INFORMATION_PROVIDED.value,
            previous_status=previous,
            new_status=request.status,
            reason=text,
        )
        if commit:
            db.commit()
            db.refresh(request)
        return request
    except RefundInvariantError as exc:
        db.rollback()
        raise RefundRevisionServiceError(str(exc), code=exc.code) from exc
    except Exception:
        if commit:
            db.rollback()
        raise
