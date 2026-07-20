"""
Refund execution orchestration (Этап 6.14.6).

approved → refund_processing → refunded | partially_refunded
Errors: provider_unknown | refund_failed

No entitlement mutation, no live YooKassa in tests (Fake / mocked).
Webhook reconciliation: Этап 6.14.7 (`refund_webhook_reconciliation`).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from backend.models.checkout import PaymentAttempt
from backend.models.refund import (
    RefundAuditAction,
    RefundAuditActorType,
    RefundAuditEvent,
    RefundLedgerEntry,
    RefundLedgerEntryType,
    RefundLedgerProviderStatus,
    RefundRequest,
    RefundRequestStatus,
    RefundRevision,
)
from backend.payments.base import PaymentProvider, PaymentProviderError
from backend.payments.dto import (
    CreateRefundRequest,
    NormalizedRefundStatus,
    RefundPaymentResult,
    RefundStatusResult,
)
from backend.payments.registry import PaymentProviderRegistryError, get_payment_provider
from backend.services.payment_provider_connections import (
    ConnectionServiceError,
    decrypt_connection_credentials_for_internal_use,
    get_connection,
)
from backend.services.refund_calculation import load_ledger_balance, round_money
from backend.services.refund_invariants import (
    RefundInvariantError,
    validate_optimistic_version,
    validate_status_transition,
)

ZERO = Decimal("0.00")

_EXECUTE_ENTRY_STATUSES = frozenset(
    {
        RefundRequestStatus.APPROVED.value,
        RefundRequestStatus.REFUND_PROCESSING.value,
        RefundRequestStatus.PROVIDER_UNKNOWN.value,
        RefundRequestStatus.REFUND_FAILED.value,
    }
)

_DONE_STATUSES = frozenset(
    {
        RefundRequestStatus.REFUNDED.value,
        RefundRequestStatus.PARTIALLY_REFUNDED.value,
    }
)

_AMBIGUOUS_PROVIDER_CODES = frozenset(
    {
        "provider_timeout",
        "provider_network_error",
        "invalid_provider_response",
    }
)

_SAFE_FAIL_PROVIDER_CODES = frozenset(
    {
        "invalid_credentials",
        "provider_http_error",
        "payment_not_found",
        "refund_not_found",
        "refund_amount_required",
        "idempotency_key_required",
        "idempotency_conflict",
        "invalid_refund_amount",
        "payment_id_required",
        "refund_id_required",
        "missing_credentials",
        "provider_unavailable",
    }
)


class RefundExecutionError(Exception):
    def __init__(self, message: str, *, code: str) -> None:
        self.message = message
        self.code = code
        super().__init__(message)


@dataclass
class ExecuteRefundResult:
    request: RefundRequest
    outcome: str
    ledger_entry: RefundLedgerEntry | None
    provider_refund_id: str | None
    already_completed: bool = False


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
        raise RefundExecutionError("RefundRequest not found", code="request_not_found")
    return req


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
    actor_type: str = RefundAuditActorType.ADMIN.value,
) -> RefundAuditEvent:
    evt = RefundAuditEvent(
        refund_request_id=request.id,
        refund_revision_id=refund_revision_id,
        actor_user_id=actor_user_id,
        actor_type=actor_type,
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
        raise RefundExecutionError(exc.message, code=exc.code) from exc
    request.status = new_status
    request.updated_at = _utcnow()
    return previous


def _bump_version(request: RefundRequest, *, expected_version: int) -> None:
    try:
        validate_optimistic_version(request, expected_version=expected_version)
    except RefundInvariantError as exc:
        raise RefundExecutionError(exc.message, code=exc.code) from exc
    request.version = int(request.version) + 1
    request.updated_at = _utcnow()


def _approved_revision(db: Session, request: RefundRequest) -> RefundRevision:
    if request.approved_revision_id is None:
        raise RefundExecutionError(
            "Approved revision is required",
            code="approved_revision_required",
        )
    revision = db.get(RefundRevision, int(request.approved_revision_id))
    if revision is None:
        raise RefundExecutionError(
            "Approved revision not found",
            code="revision_not_found",
        )
    if int(revision.refund_request_id) != int(request.id):
        raise RefundExecutionError(
            "Approved revision ownership mismatch",
            code="revision_ownership",
        )
    if int(revision.revision_number) != int(request.current_revision_number):
        raise RefundExecutionError(
            "Approved revision is not current",
            code="stale_revision",
        )
    return revision


def _refund_amount(revision: RefundRevision) -> Decimal:
    raw = revision.final_refund_amount
    if raw is None:
        raw = revision.proposed_refund_amount
    if raw is None:
        raise RefundExecutionError(
            "Approved revision has no refund amount",
            code="amount_required",
        )
    amount = round_money(raw)
    if amount <= ZERO:
        raise RefundExecutionError(
            "Refund amount must be positive",
            code="invalid_refund_amount",
        )
    return amount


def _stable_idempotency_key(request_id: int, revision_id: int, attempt_n: int) -> str:
    base = f"bf-rf-{int(request_id)}-r{int(revision_id)}"
    if attempt_n <= 1:
        return base[:128]
    return f"{base}-n{int(attempt_n)}"[:128]


def _ledger_rows_for_revision(
    db: Session, *, request_id: int, revision_id: int
) -> list[RefundLedgerEntry]:
    return (
        db.query(RefundLedgerEntry)
        .filter(
            RefundLedgerEntry.refund_request_id == int(request_id),
            RefundLedgerEntry.refund_revision_id == int(revision_id),
        )
        .order_by(RefundLedgerEntry.id.asc())
        .all()
    )


def _active_or_unknown(
    rows: list[RefundLedgerEntry],
) -> RefundLedgerEntry | None:
    for row in reversed(rows):
        if row.entry_type == RefundLedgerEntryType.SUCCEEDED.value:
            return row
        if row.entry_type in {
            RefundLedgerEntryType.RESERVED.value,
            RefundLedgerEntryType.PROVIDER_UNKNOWN.value,
        } and str(row.idempotency_key or "").startswith("bf-rf-"):
            return row
    return None


def _next_attempt_n(rows: list[RefundLedgerEntry]) -> int:
    # Count prior failed/canceled + unknown-without-id terminal attempts for new keys.
    n = 1
    for row in rows:
        if row.entry_type in {
            RefundLedgerEntryType.FAILED.value,
            RefundLedgerEntryType.CANCELED.value,
        }:
            n += 1
        elif (
            row.entry_type == RefundLedgerEntryType.PROVIDER_UNKNOWN.value
            and not (row.provider_refund_id or "").strip()
        ):
            # Stuck unknown without id — do not auto-increment for POST; handled separately.
            pass
    return n


def _resolve_provider(db: Session, attempt: PaymentAttempt) -> PaymentProvider:
    name = (attempt.provider or "").strip()
    if not name:
        raise RefundExecutionError(
            "PaymentAttempt has no provider",
            code="provider_missing",
        )
    try:
        if attempt.connection_id is not None:
            conn = get_connection(db, int(attempt.connection_id))
            creds = decrypt_connection_credentials_for_internal_use(conn)
            return get_payment_provider(name, credentials=creds)
        return get_payment_provider(name)
    except ConnectionServiceError as exc:
        raise RefundExecutionError(exc.message, code=exc.code or "connection_error") from exc
    except PaymentProviderRegistryError as exc:
        raise RefundExecutionError(
            "Payment provider unavailable",
            code="provider_unavailable",
        ) from exc


def _terminal_money_status(
    *,
    paid: Decimal,
    confirmed_after: Decimal,
) -> str:
    if confirmed_after + Decimal("0.001") >= paid:
        return RefundRequestStatus.REFUNDED.value
    return RefundRequestStatus.PARTIALLY_REFUNDED.value


def _apply_provider_result(
    db: Session,
    request: RefundRequest,
    ledger: RefundLedgerEntry,
    *,
    result: RefundPaymentResult | RefundStatusResult,
    paid: Decimal,
    actor_user_id: int | None,
    revision_id: int,
    actor_type: str = RefundAuditActorType.ADMIN.value,
) -> str:
    """Update ledger + request from provider result. Returns outcome label."""
    refund_id = (result.refund_id or "").strip() or None
    if refund_id:
        ledger.provider_refund_id = refund_id

    status = result.status
    if status == NormalizedRefundStatus.PENDING:
        ledger.entry_type = RefundLedgerEntryType.RESERVED.value
        ledger.provider_status = RefundLedgerProviderStatus.NOT_SUBMITTED.value
        prev = _set_status(request, RefundRequestStatus.REFUND_PROCESSING.value)
        if prev:
            _write_audit(
                db,
                request,
                actor_user_id=actor_user_id,
                actor_type=actor_type,
                action=RefundAuditAction.STATUS_CHANGED.value,
                previous_status=prev,
                new_status=request.status,
                refund_revision_id=revision_id,
                metadata={"outcome": "pending", "provider_refund_id": refund_id},
            )
        return "pending"

    if status == NormalizedRefundStatus.SUCCEEDED:
        ledger.entry_type = RefundLedgerEntryType.SUCCEEDED.value
        ledger.provider_status = RefundLedgerProviderStatus.SUCCEEDED.value
        balance = load_ledger_balance(
            db,
            checkout_intent_id=int(request.checkout_intent_id),
            paid_amount=paid,
        )
        # Include this row as succeeded once flushed; load_ledger_balance reads DB state.
        db.flush()
        balance = load_ledger_balance(
            db,
            checkout_intent_id=int(request.checkout_intent_id),
            paid_amount=paid,
        )
        new_status = _terminal_money_status(
            paid=paid, confirmed_after=balance.confirmed_refunded_amount
        )
        prev = _set_status(request, new_status)
        if new_status in _DONE_STATUSES:
            request.completed_at = request.completed_at or _utcnow()
        if prev:
            _write_audit(
                db,
                request,
                actor_user_id=actor_user_id,
                actor_type=actor_type,
                action=RefundAuditAction.STATUS_CHANGED.value,
                previous_status=prev,
                new_status=new_status,
                refund_revision_id=revision_id,
                metadata={"outcome": "succeeded", "provider_refund_id": refund_id},
            )
        return "succeeded"

    if status == NormalizedRefundStatus.CANCELED:
        ledger.entry_type = RefundLedgerEntryType.CANCELED.value
        ledger.provider_status = RefundLedgerProviderStatus.CANCELED.value
        prev = _set_status(request, RefundRequestStatus.REFUND_FAILED.value)
        if prev:
            _write_audit(
                db,
                request,
                actor_user_id=actor_user_id,
                actor_type=actor_type,
                action=RefundAuditAction.STATUS_CHANGED.value,
                previous_status=prev,
                new_status=request.status,
                refund_revision_id=revision_id,
                metadata={
                    "outcome": "canceled",
                    "provider_refund_id": refund_id,
                    "cancellation_details": result.cancellation_details,
                },
            )
        from backend.services.refund_addon_reservation import (
            release_addon_refund_reservation,
        )

        release_addon_refund_reservation(db, int(request.id), commit=False)
        return "canceled"

    raise RefundExecutionError(
        f"Unsupported provider refund status {status!r}",
        code="invalid_provider_response",
    )


def _mark_provider_unknown(
    db: Session,
    request: RefundRequest,
    ledger: RefundLedgerEntry,
    *,
    actor_user_id: int | None,
    revision_id: int,
    error_code: str,
    provider_refund_id: str | None = None,
) -> str:
    ledger.entry_type = RefundLedgerEntryType.PROVIDER_UNKNOWN.value
    ledger.provider_status = RefundLedgerProviderStatus.PROVIDER_UNKNOWN.value
    if provider_refund_id:
        ledger.provider_refund_id = provider_refund_id
    prev = _set_status(request, RefundRequestStatus.PROVIDER_UNKNOWN.value)
    if prev:
        _write_audit(
            db,
            request,
            actor_user_id=actor_user_id,
            action=RefundAuditAction.STATUS_CHANGED.value,
            previous_status=prev,
            new_status=request.status,
            refund_revision_id=revision_id,
            metadata={"outcome": "provider_unknown", "error_code": error_code},
        )
    return "provider_unknown"


def _mark_failed(
    db: Session,
    request: RefundRequest,
    ledger: RefundLedgerEntry,
    *,
    actor_user_id: int | None,
    revision_id: int,
    error_code: str,
) -> str:
    ledger.entry_type = RefundLedgerEntryType.FAILED.value
    ledger.provider_status = RefundLedgerProviderStatus.FAILED.value
    prev = _set_status(request, RefundRequestStatus.REFUND_FAILED.value)
    if prev:
        _write_audit(
            db,
            request,
            actor_user_id=actor_user_id,
            action=RefundAuditAction.STATUS_CHANGED.value,
            previous_status=prev,
            new_status=request.status,
            refund_revision_id=revision_id,
            metadata={"outcome": "failed", "error_code": error_code},
        )
    from backend.services.refund_addon_reservation import (
        release_addon_refund_reservation,
    )

    release_addon_refund_reservation(db, int(request.id), commit=False)
    return "failed"


def execute_approved_refund(
    db: Session,
    request_id: int,
    *,
    expected_version: int,
    actor_user_id: int | None,
    commit: bool = True,
) -> ExecuteRefundResult:
    """
    Execute provider refund for an approved (or recoverable) request.
    Idempotent for in-flight / completed money outcomes.
    """
    request = _lock_request(db, request_id)
    status = request.status or ""

    if status in _DONE_STATUSES:
        # Idempotent repeat after success — no version bump required if already done,
        # but still validate expected_version matches current for safety.
        try:
            validate_optimistic_version(request, expected_version=expected_version)
        except RefundInvariantError as exc:
            raise RefundExecutionError(exc.message, code=exc.code) from exc
        rows = _ledger_rows_for_revision(
            db,
            request_id=request.id,
            revision_id=int(request.approved_revision_id or 0),
        )
        succeeded = next(
            (
                r
                for r in reversed(rows)
                if r.entry_type == RefundLedgerEntryType.SUCCEEDED.value
            ),
            None,
        )
        return ExecuteRefundResult(
            request=request,
            outcome="already_completed",
            ledger_entry=succeeded,
            provider_refund_id=(succeeded.provider_refund_id if succeeded else None),
            already_completed=True,
        )

    if status not in _EXECUTE_ENTRY_STATUSES:
        raise RefundExecutionError(
            f"Execute not allowed from status {status!r}",
            code="execute_not_allowed",
        )

    revision = _approved_revision(db, request)
    from backend.services.refund_addon_reservation import (
        ensure_addon_refund_reservation,
    )

    ensure_addon_refund_reservation(db, request, revision, commit=False)
    amount = _refund_amount(revision)
    currency = (revision.currency or "RUB").upper()

    attempt = db.get(PaymentAttempt, int(request.payment_attempt_id))
    if attempt is None:
        raise RefundExecutionError(
            "PaymentAttempt not found",
            code="payment_attempt_not_found",
        )
    provider_payment_id = (attempt.provider_payment_id or "").strip()
    if not provider_payment_id:
        raise RefundExecutionError(
            "PaymentAttempt missing provider_payment_id",
            code="provider_payment_id_required",
        )

    paid = round_money(revision.paid_amount if revision.paid_amount is not None else attempt.amount)

    rows = _ledger_rows_for_revision(
        db, request_id=request.id, revision_id=revision.id
    )
    active = _active_or_unknown(rows)

    # Already succeeded ledger (should pair with done status, but recover if drifted).
    if active and active.entry_type == RefundLedgerEntryType.SUCCEEDED.value:
        try:
            validate_optimistic_version(request, expected_version=expected_version)
        except RefundInvariantError as exc:
            raise RefundExecutionError(exc.message, code=exc.code) from exc
        return ExecuteRefundResult(
            request=request,
            outcome="already_completed",
            ledger_entry=active,
            provider_refund_id=active.provider_refund_id,
            already_completed=True,
        )

    # Recovery: provider_unknown / reserved with known refund_id → GET only.
    if (
        active
        and (active.provider_refund_id or "").strip()
        and active.entry_type
        in {
            RefundLedgerEntryType.RESERVED.value,
            RefundLedgerEntryType.PROVIDER_UNKNOWN.value,
        }
    ):
        _bump_version(request, expected_version=expected_version)
        provider = _resolve_provider(db, attempt)
        try:
            status_result = provider.get_refund_status(str(active.provider_refund_id))
            outcome = _apply_provider_result(
                db,
                request,
                active,
                result=status_result,
                paid=paid,
                actor_user_id=actor_user_id,
                revision_id=revision.id,
            )
        except PaymentProviderError as exc:
            if exc.code in _AMBIGUOUS_PROVIDER_CODES:
                outcome = _mark_provider_unknown(
                    db,
                    request,
                    active,
                    actor_user_id=actor_user_id,
                    revision_id=revision.id,
                    error_code=exc.code,
                    provider_refund_id=active.provider_refund_id,
                )
            else:
                outcome = _mark_failed(
                    db,
                    request,
                    active,
                    actor_user_id=actor_user_id,
                    revision_id=revision.id,
                    error_code=exc.code,
                )
        if commit:
            db.commit()
            db.refresh(request)
            db.refresh(active)
        return ExecuteRefundResult(
            request=request,
            outcome=outcome,
            ledger_entry=active,
            provider_refund_id=active.provider_refund_id,
        )

    # provider_unknown without refund_id → no automatic POST.
    if (
        active
        and active.entry_type == RefundLedgerEntryType.PROVIDER_UNKNOWN.value
        and not (active.provider_refund_id or "").strip()
    ):
        raise RefundExecutionError(
            "Provider outcome unknown without refund_id; manual recovery required",
            code="provider_unknown_no_refund_id",
        )

    # reserved without refund_id (in-flight / timeout before id) → retry POST same key.
    reuse_ledger = (
        active
        if active
        and active.entry_type == RefundLedgerEntryType.RESERVED.value
        and not (active.provider_refund_id or "").strip()
        else None
    )

    if reuse_ledger is None:
        # New reservation path (from approved or refund_failed).
        balance = load_ledger_balance(
            db,
            checkout_intent_id=int(request.checkout_intent_id),
            paid_amount=paid,
        )
        # Exclude nothing yet; ensure amount fits available.
        if amount > balance.refundable_available_amount:
            raise RefundExecutionError(
                "Refund amount exceeds available refundable balance",
                code="amount_exceeds_available",
            )
        if (revision.currency or "RUB").upper() != (attempt.currency or "RUB").upper():
            raise RefundExecutionError(
                "Currency mismatch between revision and payment attempt",
                code="currency_mismatch",
            )

        # Block if another active reserved/unknown exists for same intent (other request).
        # Available check already accounts for that.

        attempt_n = _next_attempt_n(rows)
        idem_key = _stable_idempotency_key(request.id, revision.id, attempt_n)

        _bump_version(request, expected_version=expected_version)
        prev = _set_status(request, RefundRequestStatus.REFUND_PROCESSING.value)
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

        ledger = RefundLedgerEntry(
            refund_request_id=request.id,
            refund_revision_id=revision.id,
            checkout_intent_id=int(request.checkout_intent_id),
            payment_attempt_id=int(request.payment_attempt_id),
            entry_type=RefundLedgerEntryType.RESERVED.value,
            amount=amount,
            currency=currency,
            idempotency_key=idem_key,
            provider_refund_id=None,
            provider_status=RefundLedgerProviderStatus.NOT_SUBMITTED.value,
            created_at=_utcnow(),
        )
        db.add(ledger)
        db.flush()
        _write_audit(
            db,
            request,
            actor_user_id=actor_user_id,
            action=RefundAuditAction.LEDGER_ENTRY_CREATED.value,
            refund_revision_id=revision.id,
            metadata={
                "ledger_entry_id": ledger.id,
                "entry_type": ledger.entry_type,
                "idempotency_key": idem_key,
                "amount": str(amount),
            },
        )
    else:
        ledger = reuse_ledger
        _bump_version(request, expected_version=expected_version)
        if request.status != RefundRequestStatus.REFUND_PROCESSING.value:
            prev = _set_status(request, RefundRequestStatus.REFUND_PROCESSING.value)
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

    provider = _resolve_provider(db, attempt)
    create_req = CreateRefundRequest(
        provider_payment_id=provider_payment_id,
        amount=amount,
        currency=currency,
        idempotency_key=str(ledger.idempotency_key),
        description=f"BotForg refund request #{request.id}",
        metadata={
            "refund_request_id": str(request.id),
            "refund_revision_id": str(revision.id),
            "ledger_entry_id": str(ledger.id),
        },
    )

    try:
        result = provider.refund_payment(create_req)
        outcome = _apply_provider_result(
            db,
            request,
            ledger,
            result=result,
            paid=paid,
            actor_user_id=actor_user_id,
            revision_id=revision.id,
        )
    except PaymentProviderError as exc:
        if exc.code in _AMBIGUOUS_PROVIDER_CODES:
            outcome = _mark_provider_unknown(
                db,
                request,
                ledger,
                actor_user_id=actor_user_id,
                revision_id=revision.id,
                error_code=exc.code,
            )
        else:
            outcome = _mark_failed(
                db,
                request,
                ledger,
                actor_user_id=actor_user_id,
                revision_id=revision.id,
                error_code=exc.code or "provider_error",
            )

    if commit:
        db.commit()
        db.refresh(request)
        db.refresh(ledger)

    return ExecuteRefundResult(
        request=request,
        outcome=outcome,
        ledger_entry=ledger,
        provider_refund_id=ledger.provider_refund_id,
    )
