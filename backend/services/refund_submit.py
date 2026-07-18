"""
Создание RefundRequest + initial automatic revision (Этап 6.14.3.2).

Нет HTTP API, provider refund, entitlement mutate.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.checkout import CheckoutIntent, PaymentAttempt, PaymentAttemptStatus
from backend.models.refund import (
    REFUND_TERMINAL_STATUSES,
    RefundAuditAction,
    RefundAuditActorType,
    RefundAuditEvent,
    RefundRequest,
    RefundRequestStatus,
)
from backend.services.refund_revisions import (
    RefundRevisionServiceError,
    create_initial_automatic_revision,
)


class RefundSubmitError(Exception):
    def __init__(self, message: str, *, code: str) -> None:
        self.message = message
        self.code = code
        super().__init__(message)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_comment(user_comment: str | None) -> str | None:
    text = (user_comment or "").strip()
    return text or None


def _idempotency_payload_matches(
    existing: RefundRequest,
    *,
    checkout_intent_id: int,
    payment_attempt_id: int,
    reason_category: str,
    user_comment: str | None,
) -> bool:
    return (
        int(existing.checkout_intent_id) == int(checkout_intent_id)
        and int(existing.payment_attempt_id) == int(payment_attempt_id)
        and (existing.reason_category or "") == reason_category
        and _normalize_comment(existing.user_comment) == user_comment
    )


def _ensure_idempotent_replay(
    existing: RefundRequest,
    *,
    checkout_intent_id: int,
    payment_attempt_id: int,
    reason_category: str,
    user_comment: str | None,
) -> RefundRequest:
    """Return existing request or raise idempotency_conflict (no writes)."""
    if _idempotency_payload_matches(
        existing,
        checkout_intent_id=checkout_intent_id,
        payment_attempt_id=payment_attempt_id,
        reason_category=reason_category,
        user_comment=user_comment,
    ):
        return existing
    raise RefundSubmitError(
        "Idempotency key was reused with a different payload",
        code="idempotency_conflict",
    )


def _find_open_request(db: Session, *, checkout_intent_id: int) -> RefundRequest | None:
    return (
        db.query(RefundRequest)
        .filter(
            RefundRequest.checkout_intent_id == int(checkout_intent_id),
            ~RefundRequest.status.in_(tuple(REFUND_TERMINAL_STATUSES)),
        )
        .order_by(RefundRequest.id.asc())
        .first()
    )


def _resolve_succeeded_attempt(
    db: Session,
    *,
    intent: CheckoutIntent,
    payment_attempt_id: int | None,
) -> PaymentAttempt:
    if payment_attempt_id is not None:
        attempt = db.get(PaymentAttempt, int(payment_attempt_id))
        if attempt is None:
            raise RefundSubmitError(
                "PaymentAttempt not found",
                code="attempt_not_found",
            )
        if int(attempt.checkout_intent_id) != int(intent.id):
            raise RefundSubmitError(
                "PaymentAttempt does not belong to CheckoutIntent",
                code="attempt_intent_mismatch",
            )
        if attempt.status != PaymentAttemptStatus.SUCCEEDED.value:
            raise RefundSubmitError(
                "PaymentAttempt is not succeeded",
                code="attempt_not_succeeded",
            )
        return attempt

    attempt = (
        db.query(PaymentAttempt)
        .filter(
            PaymentAttempt.checkout_intent_id == intent.id,
            PaymentAttempt.status == PaymentAttemptStatus.SUCCEEDED.value,
        )
        .order_by(PaymentAttempt.id.desc())
        .first()
    )
    if attempt is None:
        raise RefundSubmitError(
            "No succeeded PaymentAttempt for CheckoutIntent",
            code="attempt_not_succeeded",
        )
    return attempt


def create_refund_request(
    db: Session,
    *,
    user_id: int,
    checkout_intent_id: int,
    reason_category: str,
    idempotency_key: str,
    user_comment: str | None = None,
    payment_attempt_id: int | None = None,
    calculation_at: datetime | None = None,
    commit: bool = True,
) -> RefundRequest:
    """
    Create RefundRequest + initial automatic revision in one transaction.

    Idempotent on (user_id, idempotency_key).
    Blocks a second non-terminal request for the same checkout_intent_id.
    Terminal statuses (completed / rejected / canceled) do not block a new request.
    """
    key = (idempotency_key or "").strip()
    if not key:
        raise RefundSubmitError(
            "idempotency_key is required",
            code="idempotency_required",
        )
    if len(key) > 128:
        raise RefundSubmitError(
            "idempotency_key is too long",
            code="idempotency_too_long",
        )

    reason = (reason_category or "").strip()
    if not reason:
        raise RefundSubmitError(
            "reason_category is required",
            code="reason_required",
        )

    comment = _normalize_comment(user_comment)

    existing = (
        db.query(RefundRequest)
        .filter(
            RefundRequest.user_id == int(user_id),
            RefundRequest.idempotency_key == key,
        )
        .first()
    )

    try:
        intent = (
            db.query(CheckoutIntent)
            .filter(CheckoutIntent.id == int(checkout_intent_id))
            .with_for_update()
            .first()
        )
        if intent is None:
            raise RefundSubmitError(
                "CheckoutIntent not found",
                code="intent_not_found",
            )
        if int(intent.user_id) != int(user_id):
            raise RefundSubmitError(
                "CheckoutIntent does not belong to user",
                code="intent_forbidden",
            )

        attempt = _resolve_succeeded_attempt(
            db, intent=intent, payment_attempt_id=payment_attempt_id
        )

        if existing is not None:
            # Replay or conflict — no new revision/audit, no mutation.
            return _ensure_idempotent_replay(
                existing,
                checkout_intent_id=intent.id,
                payment_attempt_id=attempt.id,
                reason_category=reason,
                user_comment=comment,
            )

        open_req = _find_open_request(db, checkout_intent_id=intent.id)
        if open_req is not None:
            raise RefundSubmitError(
                "An active refund request already exists for this CheckoutIntent",
                code="duplicate_open_request",
            )

        now = _utcnow()
        request = RefundRequest(
            user_id=int(user_id),
            checkout_intent_id=intent.id,
            payment_attempt_id=attempt.id,
            idempotency_key=key,
            status=RefundRequestStatus.SUBMITTED.value,
            reason_category=reason,
            user_comment=comment,
            current_revision_number=0,
            version=1,
            submitted_at=now,
            created_at=now,
            updated_at=now,
        )
        db.add(request)
        db.flush()

        db.add(
            RefundAuditEvent(
                refund_request_id=request.id,
                refund_revision_id=None,
                actor_user_id=int(user_id),
                actor_type=RefundAuditActorType.USER.value,
                action=RefundAuditAction.CREATED.value,
                previous_status=None,
                new_status=RefundRequestStatus.SUBMITTED.value,
                changed_fields=None,
                reason=reason,
                event_metadata={
                    "checkout_intent_id": intent.id,
                    "payment_attempt_id": attempt.id,
                    "idempotency_key_present": True,
                },
                created_at=now,
            )
        )
        db.flush()

        create_initial_automatic_revision(
            db,
            request.id,
            expected_version=1,
            calculation_at=calculation_at,
            actor_user_id=int(user_id),
            commit=False,
        )

        if commit:
            db.commit()
            db.refresh(request)
        return request
    except RefundSubmitError:
        if commit:
            db.rollback()
        raise
    except RefundRevisionServiceError as exc:
        if commit:
            db.rollback()
        raise RefundSubmitError(exc.message, code=exc.code) from exc
    except IntegrityError as exc:
        db.rollback()

        # Concurrent idempotent create → replay only if payload matches.
        replay = (
            db.query(RefundRequest)
            .filter(
                RefundRequest.user_id == int(user_id),
                RefundRequest.idempotency_key == key,
            )
            .first()
        )
        if replay is not None:
            # Resolve attempt again after rollback for payload check.
            intent_again = db.get(CheckoutIntent, int(checkout_intent_id))
            if intent_again is None or int(intent_again.user_id) != int(user_id):
                raise RefundSubmitError(
                    "Idempotency key was reused with a different payload",
                    code="idempotency_conflict",
                ) from exc
            try:
                attempt_again = _resolve_succeeded_attempt(
                    db,
                    intent=intent_again,
                    payment_attempt_id=payment_attempt_id,
                )
            except RefundSubmitError:
                raise RefundSubmitError(
                    "Idempotency key was reused with a different payload",
                    code="idempotency_conflict",
                ) from exc
            return _ensure_idempotent_replay(
                replay,
                checkout_intent_id=intent_again.id,
                payment_attempt_id=attempt_again.id,
                reason_category=reason,
                user_comment=comment,
            )

        # Concurrent second open request for same intent (partial unique index).
        open_again = _find_open_request(db, checkout_intent_id=int(checkout_intent_id))
        if open_again is not None:
            raise RefundSubmitError(
                "An active refund request already exists for this CheckoutIntent",
                code="duplicate_open_request",
            ) from exc

        # Unique open-intent index may fire even if the winner row is already visible;
        # treat open-intent constraint name as duplicate_open_request.
        err = str(getattr(exc, "orig", exc) or exc).lower()
        if "uq_refund_requests_one_open_per_intent" in err:
            raise RefundSubmitError(
                "An active refund request already exists for this CheckoutIntent",
                code="duplicate_open_request",
            ) from exc

        raise RefundSubmitError(
            "Could not create refund request due to a constraint conflict",
            code="constraint_conflict",
        ) from exc
    except Exception:
        if commit:
            db.rollback()
        raise
