"""
Refund webhook reconciliation (Этап 6.14.7).

Applies provider refund notifications to an existing RefundLedgerEntry.
Never calls refund_payment. Never mutates entitlement.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.checkout import (
    PaymentAttempt,
    PaymentWebhookEvent,
    PaymentWebhookProcessStatus,
)
from backend.models.refund import (
    RefundAuditAction,
    RefundAuditActorType,
    RefundAuditEvent,
    RefundLedgerEntry,
    RefundLedgerEntryType,
    RefundRequest,
    RefundRequestStatus,
)
from backend.payments.dto import (
    NormalizedRefundStatus,
    ParsedRefundWebhookEvent,
    RefundStatusResult,
)
from backend.services.refund_calculation import round_money
from backend.services.refund_execution import (
    _DONE_STATUSES,
    _apply_provider_result,
    _sanitize_metadata,
)


class RefundWebhookReconcileError(Exception):
    def __init__(self, message: str, *, code: str) -> None:
        self.message = message
        self.code = code
        super().__init__(message)


@dataclass
class ReconcileRefundWebhookResult:
    request: RefundRequest | None
    ledger_entry: RefundLedgerEntry | None
    webhook_event: PaymentWebhookEvent | None
    outcome: str
    ignored: bool = False
    already_processed: bool = False


_LEDGER_SUCCEEDED = RefundLedgerEntryType.SUCCEEDED.value
_LEDGER_CANCELED = RefundLedgerEntryType.CANCELED.value


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _content_fingerprint(event: ParsedRefundWebhookEvent) -> str:
    amount = (
        f"{round_money(event.amount):.2f}" if event.amount is not None else ""
    )
    currency = (event.currency or "").upper()
    return "|".join(
        [
            event.provider,
            event.provider_refund_id,
            event.provider_payment_id,
            event.status.value,
            amount,
            currency,
        ]
    )


def _safe_webhook_payload(event: ParsedRefundWebhookEvent) -> dict[str, Any]:
    """Sanitized payload stored on PaymentWebhookEvent — no secrets / full body."""
    raw = event.raw if isinstance(event.raw, dict) else {}
    return {
        "event": event.event_type,
        "provider_event_id": event.provider_event_id,
        "provider_refund_id": event.provider_refund_id,
        "provider_payment_id": event.provider_payment_id,
        "status": event.status.value,
        "amount": str(event.amount) if event.amount is not None else None,
        "currency": (event.currency or "").upper() or None,
        "fingerprint": _content_fingerprint(event),
        "raw": {
            k: v
            for k, v in raw.items()
            if k
            in (
                "event",
                "id",
                "status",
                "payment_id",
                "amount",
                "created_at",
                "cancellation_details",
                "test",
            )
        },
    }


def _write_system_audit(
    db: Session,
    request: RefundRequest,
    *,
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
        actor_user_id=None,
        actor_type=RefundAuditActorType.SYSTEM.value,
        action=action,
        previous_status=previous_status,
        new_status=new_status,
        reason=reason,
        event_metadata=_sanitize_metadata(metadata),
        created_at=_utcnow(),
    )
    db.add(evt)
    from backend.services.refund_notification_producer import after_refund_audit_written

    after_refund_audit_written(db, request=request, audit_event=evt)
    return evt


def _find_ledger_by_refund_id(
    db: Session, *, provider_refund_id: str
) -> RefundLedgerEntry | None:
    rid = (provider_refund_id or "").strip()
    if not rid:
        return None
    return (
        db.query(RefundLedgerEntry)
        .filter(RefundLedgerEntry.provider_refund_id == rid)
        .order_by(RefundLedgerEntry.id.desc())
        .first()
    )


def _paid_amount(db: Session, request: RefundRequest, attempt: PaymentAttempt) -> Decimal:
    from backend.models.refund import RefundRevision

    if request.approved_revision_id is not None:
        revision = db.get(RefundRevision, int(request.approved_revision_id))
        if revision is not None and revision.paid_amount is not None:
            return round_money(revision.paid_amount)
    return round_money(attempt.amount)


def _ledger_implies_succeeded(ledger: RefundLedgerEntry) -> bool:
    return ledger.entry_type == _LEDGER_SUCCEEDED


def _ledger_implies_canceled(ledger: RefundLedgerEntry) -> bool:
    return ledger.entry_type == _LEDGER_CANCELED


def _is_downgrade(
    *,
    ledger: RefundLedgerEntry,
    new_status: NormalizedRefundStatus,
) -> bool:
    if not _ledger_implies_succeeded(ledger):
        return False
    return new_status != NormalizedRefundStatus.SUCCEEDED


def _ignore_terminal_with_audit(
    db: Session,
    *,
    request: RefundRequest,
    ledger: RefundLedgerEntry,
    wh: PaymentWebhookEvent,
    safe_payload: dict[str, Any],
    provider_event_id: str,
    refund_id: str,
    incoming_status: str,
    reason: str,
    outcome: str,
    commit: bool,
) -> ReconcileRefundWebhookResult:
    wh.process_status = PaymentWebhookProcessStatus.IGNORED.value
    wh.error_message = reason
    wh.processed_at = _utcnow()
    wh.payload = safe_payload
    db.add(wh)
    _write_system_audit(
        db,
        request,
        action=RefundAuditAction.VALIDATION_REJECTED.value,
        reason=reason,
        refund_revision_id=ledger.refund_revision_id,
        metadata={
            "provider_event_id": provider_event_id,
            "provider_refund_id": refund_id,
            "incoming_status": incoming_status,
            "ledger_entry_type": ledger.entry_type,
            "request_status": request.status,
        },
    )
    if commit:
        db.commit()
        db.refresh(request)
        db.refresh(ledger)
        db.refresh(wh)
    return ReconcileRefundWebhookResult(
        request=request,
        ledger_entry=ledger,
        webhook_event=wh,
        outcome=outcome,
        ignored=True,
    )


def reconcile_refund_webhook(
    db: Session,
    *,
    event: ParsedRefundWebhookEvent,
    attempt: PaymentAttempt,
    commit: bool = True,
) -> ReconcileRefundWebhookResult:
    """
    Atomically reconcile a verified refund webhook against ledger + request.

    Does NOT call provider.refund_payment.
    """
    provider = (event.provider or "").strip()
    refund_id = (event.provider_refund_id or "").strip()
    payment_id = (event.provider_payment_id or "").strip()
    provider_event_id = (event.provider_event_id or "").strip()

    if not provider_event_id:
        raise RefundWebhookReconcileError(
            "provider_event_id required",
            code="event_id_required",
        )
    if not refund_id:
        raise RefundWebhookReconcileError(
            "provider_refund_id required",
            code="refund_id_required",
        )
    if not payment_id:
        raise RefundWebhookReconcileError(
            "provider_payment_id required",
            code="payment_id_required",
        )

    attempt_provider = (attempt.provider or "").strip()
    if provider and attempt_provider and provider != attempt_provider:
        raise RefundWebhookReconcileError(
            "Provider mismatch for refund webhook",
            code="provider_mismatch",
        )

    attempt_payment_id = (attempt.provider_payment_id or "").strip()
    if payment_id != attempt_payment_id:
        raise RefundWebhookReconcileError(
            "Refund webhook payment_id does not match PaymentAttempt",
            code="payment_id_mismatch",
        )

    fingerprint = _content_fingerprint(event)
    safe_payload = _safe_webhook_payload(event)

    # --- idempotent / conflict on PaymentWebhookEvent ---
    existing_event = (
        db.query(PaymentWebhookEvent)
        .filter(
            PaymentWebhookEvent.provider == provider,
            PaymentWebhookEvent.provider_event_id == provider_event_id,
        )
        .first()
    )
    if existing_event is not None:
        prev_fp = None
        if isinstance(existing_event.payload, dict):
            prev_fp = existing_event.payload.get("fingerprint")
        if prev_fp and prev_fp != fingerprint:
            raise RefundWebhookReconcileError(
                "Webhook event id reused with different content",
                code="webhook_event_conflict",
            )
        if existing_event.process_status in (
            PaymentWebhookProcessStatus.PROCESSED.value,
            PaymentWebhookProcessStatus.IGNORED.value,
        ):
            ledger = _find_ledger_by_refund_id(db, provider_refund_id=refund_id)
            request = None
            if ledger is not None:
                request = db.get(RefundRequest, int(ledger.refund_request_id))
            return ReconcileRefundWebhookResult(
                request=request,
                ledger_entry=ledger,
                webhook_event=existing_event,
                outcome="already_processed",
                ignored=existing_event.process_status
                == PaymentWebhookProcessStatus.IGNORED.value,
                already_processed=True,
            )

    ledger = _find_ledger_by_refund_id(db, provider_refund_id=refund_id)
    if ledger is None:
        # Unknown refund — ack and stop retries; do not create ledger/request.
        wh = existing_event
        if wh is None:
            wh = PaymentWebhookEvent(
                provider=provider,
                provider_event_id=provider_event_id,
                event_type=(event.event_type or "refund")[:64],
                payload=safe_payload,
                payment_attempt_id=attempt.id,
                checkout_intent_id=attempt.checkout_intent_id,
                process_status=PaymentWebhookProcessStatus.IGNORED.value,
                error_message="unknown_refund_id",
                processed_at=_utcnow(),
            )
            db.add(wh)
            try:
                db.flush()
            except IntegrityError as exc:
                db.rollback()
                raise RefundWebhookReconcileError(
                    "Webhook event conflict",
                    code="webhook_event_conflict",
                ) from exc
        else:
            wh.process_status = PaymentWebhookProcessStatus.IGNORED.value
            wh.error_message = "unknown_refund_id"
            wh.processed_at = _utcnow()
            wh.payload = safe_payload
            db.add(wh)
        if commit:
            db.commit()
            db.refresh(wh)
        return ReconcileRefundWebhookResult(
            request=None,
            ledger_entry=None,
            webhook_event=wh,
            outcome="ignored",
            ignored=True,
        )

    ledger_attempt = db.get(PaymentAttempt, int(ledger.payment_attempt_id))
    if ledger_attempt is None:
        raise RefundWebhookReconcileError(
            "PaymentAttempt for ledger not found",
            code="payment_attempt_not_found",
        )
    if ledger_attempt.connection_id != attempt.connection_id:
        raise RefundWebhookReconcileError(
            "Ledger connection_id does not match webhook PaymentAttempt",
            code="connection_mismatch",
        )
    if int(ledger.payment_attempt_id) != int(attempt.id):
        raise RefundWebhookReconcileError(
            "Ledger payment_attempt does not match webhook attempt",
            code="payment_attempt_mismatch",
        )

    request = (
        db.query(RefundRequest)
        .filter(RefundRequest.id == int(ledger.refund_request_id))
        .with_for_update()
        .first()
    )
    if request is None:
        raise RefundWebhookReconcileError(
            "RefundRequest not found for ledger",
            code="request_not_found",
        )

    # Refresh ledger under same transaction after lock.
    db.refresh(ledger)

    ledger_amount = round_money(ledger.amount)
    if event.amount is not None and round_money(event.amount) != ledger_amount:
        raise RefundWebhookReconcileError(
            "Refund webhook amount does not match ledger",
            code="amount_mismatch",
        )
    ledger_currency = (ledger.currency or "").upper()
    event_currency = (event.currency or "").upper()
    if event_currency and ledger_currency and event_currency != ledger_currency:
        raise RefundWebhookReconcileError(
            "Refund webhook currency does not match ledger",
            code="currency_mismatch",
        )

    # Upsert webhook event row (received → processed).
    wh = existing_event
    if wh is None:
        wh = PaymentWebhookEvent(
            provider=provider,
            provider_event_id=provider_event_id,
            event_type=(event.event_type or "refund")[:64],
            payload=safe_payload,
            payment_attempt_id=attempt.id,
            checkout_intent_id=attempt.checkout_intent_id,
            process_status=PaymentWebhookProcessStatus.RECEIVED.value,
        )
        db.add(wh)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raced = (
                db.query(PaymentWebhookEvent)
                .filter(
                    PaymentWebhookEvent.provider == provider,
                    PaymentWebhookEvent.provider_event_id == provider_event_id,
                )
                .first()
            )
            if raced is None:
                raise RefundWebhookReconcileError(
                    "Webhook event conflict",
                    code="webhook_event_conflict",
                ) from None
            prev_fp = None
            if isinstance(raced.payload, dict):
                prev_fp = raced.payload.get("fingerprint")
            if prev_fp and prev_fp != fingerprint:
                raise RefundWebhookReconcileError(
                    "Webhook event id reused with different content",
                    code="webhook_event_conflict",
                )
            return ReconcileRefundWebhookResult(
                request=request,
                ledger_entry=ledger,
                webhook_event=raced,
                outcome="already_processed",
                already_processed=True,
                ignored=raced.process_status
                == PaymentWebhookProcessStatus.IGNORED.value,
            )

    # After provider canceled: no further money-state transitions (incl. pending/succeeded).
    if _ledger_implies_canceled(ledger):
        return _ignore_terminal_with_audit(
            db,
            request=request,
            ledger=ledger,
            wh=wh,
            safe_payload=safe_payload,
            provider_event_id=provider_event_id,
            refund_id=refund_id,
            incoming_status=event.status.value,
            reason="no_transition_after_canceled",
            outcome="ignored_after_canceled",
            commit=commit,
        )

    # No downgrade after succeeded ledger / money-done request.
    if _is_downgrade(ledger=ledger, new_status=event.status) or (
        request.status in _DONE_STATUSES
        and event.status != NormalizedRefundStatus.SUCCEEDED
    ):
        return _ignore_terminal_with_audit(
            db,
            request=request,
            ledger=ledger,
            wh=wh,
            safe_payload=safe_payload,
            provider_event_id=provider_event_id,
            refund_id=refund_id,
            incoming_status=event.status.value,
            reason="no_downgrade_after_succeeded",
            outcome="no_downgrade",
            commit=commit,
        )

    # Repeat succeeded while already succeeded — idempotent, no double confirm.
    if (
        _ledger_implies_succeeded(ledger)
        and event.status == NormalizedRefundStatus.SUCCEEDED
        and request.status in _DONE_STATUSES
    ):
        wh.process_status = PaymentWebhookProcessStatus.PROCESSED.value
        wh.processed_at = _utcnow()
        wh.payload = safe_payload
        wh.error_message = None
        db.add(wh)
        if commit:
            db.commit()
            db.refresh(request)
            db.refresh(ledger)
            db.refresh(wh)
        return ReconcileRefundWebhookResult(
            request=request,
            ledger_entry=ledger,
            webhook_event=wh,
            outcome="already_succeeded",
            already_processed=True,
        )

    paid = _paid_amount(db, request, attempt)
    result = RefundStatusResult(
        provider=provider,
        refund_id=refund_id,
        provider_payment_id=payment_id,
        status=event.status,
        amount=event.amount if event.amount is not None else ledger_amount,
        currency=event.currency or ledger_currency,
        created_at=event.occurred_at,
        cancellation_details=None,
        raw=dict(event.raw) if isinstance(event.raw, dict) else {},
    )

    outcome = _apply_provider_result(
        db,
        request,
        ledger,
        result=result,
        paid=paid,
        actor_user_id=None,
        revision_id=int(ledger.refund_revision_id or 0),
        actor_type=RefundAuditActorType.SYSTEM.value,
    )
    request.version = int(request.version) + 1
    request.updated_at = _utcnow()

    wh.process_status = PaymentWebhookProcessStatus.PROCESSED.value
    wh.processed_at = _utcnow()
    wh.payload = safe_payload
    wh.error_message = None
    db.add(wh)
    db.add(ledger)
    db.add(request)

    if commit:
        db.commit()
        db.refresh(request)
        db.refresh(ledger)
        db.refresh(wh)

    return ReconcileRefundWebhookResult(
        request=request,
        ledger_entry=ledger,
        webhook_event=wh,
        outcome=outcome,
    )
