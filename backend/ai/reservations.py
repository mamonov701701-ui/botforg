"""Reservation state machine backed by the canonical AI Credits ledger balance."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.ai.pricing import maximum_reservation
from backend.models.ai_provider import AiCreditReservation, AiInvocation
from backend.models.user import User
from backend.services.ai_credits import AiCreditError, debit_credits, get_balance


ACTIVE = ("reserved", "provider_unknown")


class AiReservationError(Exception):
    code = "reservation_error"

    def __init__(self, message: str, *, code: str | None = None):
        self.code = code or self.code
        super().__init__(message)


def reserve_for_invocation(db: Session, invocation: AiInvocation, pricing_rule: dict) -> AiCreditReservation:
    existing = db.query(AiCreditReservation).filter_by(invocation_id=invocation.id).one_or_none()
    if existing:
        return existing
    amount = maximum_reservation(pricing_rule)
    # PostgreSQL locks the user row so two reservations for one user cannot
    # pass the availability check simultaneously. SQLite serializes writers;
    # the explicit check is retained for both dialects.
    db.query(User).filter(User.id == invocation.user_id).with_for_update().one()
    held = int(db.query(func.coalesce(func.sum(AiCreditReservation.reserved_amount), 0)).filter(
        AiCreditReservation.user_id == invocation.user_id,
        AiCreditReservation.status.in_(ACTIVE),
    ).scalar() or 0)
    if get_balance(db, user_id=invocation.user_id).total_spendable - held < amount:
        raise AiReservationError("Insufficient AI Credits", code="insufficient_credits")
    row = AiCreditReservation(invocation_id=invocation.id, user_id=invocation.user_id, reserved_amount=amount, status="reserved")
    db.add(row)
    db.flush([row])
    return row


def release_reservation(db: Session, reservation: AiCreditReservation) -> None:
    if reservation.status not in ACTIVE:
        return
    reservation.released_amount = reservation.reserved_amount - reservation.settled_amount
    reservation.status = "released"
    reservation.settled_at = datetime.now(timezone.utc)
    db.flush([reservation])


def mark_provider_unknown(db: Session, reservation: AiCreditReservation) -> None:
    if reservation.status == "reserved":
        reservation.status = "provider_unknown"
        db.flush([reservation])


def settle_reservation(db: Session, reservation: AiCreditReservation, invocation: AiInvocation, amount: int):
    if reservation.status != "reserved":
        raise AiReservationError("Reservation is not settleable", code="invalid_reservation_state")
    if amount < 0 or amount > reservation.reserved_amount:
        raise AiReservationError("Charge exceeds reservation", code="reservation_exceeded")
    try:
        entry = debit_credits(
            db,
            user_id=invocation.user_id,
            amount=amount,
            capability=invocation.capability,
            idempotency_key=f"ai-invocation:{invocation.id}:settle",
            reason_code="ai_provider_usage",
            reservation_exempt_id=reservation.id,
        ) if amount else None
    except AiCreditError as exc:
        raise AiReservationError(str(exc), code=exc.code) from exc
    reservation.settled_amount = amount
    reservation.released_amount = reservation.reserved_amount - amount
    reservation.status = "settled"
    reservation.settled_at = datetime.now(timezone.utc)
    reservation.debit_ledger_entry_id = entry.id if entry else None
    db.flush([reservation])
    return entry
