"""AI Credits ledger service. No provider or capability runtime integration."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models.ai_credit import AiCreditBucket, AiCreditDebitAllocation, AiCreditLedgerEntry


class AiCreditError(Exception):
    def __init__(self, message: str, *, code: str):
        self.message, self.code = message, code
        super().__init__(message)


def _now(value: datetime | None = None) -> datetime:
    value = value or datetime.now(timezone.utc)
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _payload(entry: AiCreditLedgerEntry) -> tuple:
    return (entry.user_id, entry.delta, entry.operation_type, entry.source_type, entry.source_ref_type, entry.source_ref_id, entry.reason_code, entry.capability)


def _existing(db: Session, key: str, expected: tuple) -> AiCreditLedgerEntry | None:
    # Ledger helpers can be invoked by payment fulfillment while its event and
    # attempt are dirty.  Looking up an idempotency key must never flush that
    # caller-owned state.
    with db.no_autoflush:
        row = db.query(AiCreditLedgerEntry).filter(AiCreditLedgerEntry.idempotency_key == key).first()
    if row and _payload(row) != expected:
        raise AiCreditError("Idempotency key was reused with a different payload", code="idempotency_conflict")
    return row


def grant_credits(db: Session, *, user_id: int, amount: int, credit_class: str, source_type: str, source_ref_type: str, source_ref_id: str | int, idempotency_key: str, expires_at: datetime | None, reason_code: str = "grant", actor_kind: str = "system", actor_user_id: int | None = None, now: datetime | None = None) -> AiCreditBucket:
    if amount <= 0 or credit_class not in {"included", "purchased"}:
        raise AiCreditError("Invalid credit grant", code="invalid_grant")
    ref = str(source_ref_id)
    expected = (int(user_id), int(amount), "grant", source_type, source_ref_type, ref, reason_code, None)
    old = _existing(db, idempotency_key, expected)
    if old:
        with db.no_autoflush:
            return db.query(AiCreditBucket).filter(AiCreditBucket.grant_ledger_entry_id == old.id).one()
    at = _now(now)
    entry = AiCreditLedgerEntry(user_id=user_id, delta=amount, operation_type="grant", source_type=source_type, source_ref_type=source_ref_type, source_ref_id=ref, reason_code=reason_code, idempotency_key=idempotency_key, actor_kind=actor_kind, actor_user_id=actor_user_id, created_at=at)
    # Keep caller transaction ownership: payment fulfillment can have a dirty
    # webhook event. Only flush the new ledger row needed for this FK.
    db.add(entry); db.flush([entry])
    bucket = AiCreditBucket(user_id=user_id, credit_class=credit_class, original_amount=amount, remaining_amount=amount, source_type=source_type, source_ref_type=source_ref_type, source_ref_id=ref, grant_ledger_entry_id=entry.id, granted_at=at, expires_at=expires_at, status="active")
    db.add(bucket); db.flush([bucket])
    return bucket


def expire_due_buckets(db: Session, *, user_id: int | None = None, now: datetime | None = None) -> int:
    at = _now(now)
    with db.no_autoflush:
        q = db.query(AiCreditBucket).filter(AiCreditBucket.status == "active", AiCreditBucket.expires_at.isnot(None), AiCreditBucket.expires_at <= at, AiCreditBucket.remaining_amount > 0)
        if user_id is not None: q = q.filter(AiCreditBucket.user_id == user_id)
        due_buckets = q.all()
    count = 0
    changed_entries: list[AiCreditLedgerEntry] = []
    changed_buckets: list[AiCreditBucket] = []
    for bucket in due_buckets:
        key = f"ai-credit:expire:{bucket.id}"
        with db.no_autoflush:
            prior = db.query(AiCreditLedgerEntry).filter(AiCreditLedgerEntry.idempotency_key == key).first()
        if prior:
            if prior.operation_type != "expiration" or prior.user_id != bucket.user_id:
                raise AiCreditError("Idempotency key was reused with a different payload", code="idempotency_conflict")
            continue
        amount = int(bucket.remaining_amount)
        entry = AiCreditLedgerEntry(user_id=bucket.user_id, delta=-amount, operation_type="expiration", source_type="bucket", source_ref_type="ai_credit_bucket", source_ref_id=str(bucket.id), reason_code="expired", idempotency_key=key, actor_kind="system", created_at=at)
        db.add(entry)
        bucket.remaining_amount = 0; bucket.status = "expired"; count += 1
        changed_entries.append(entry); changed_buckets.append(bucket)
    if changed_entries or changed_buckets:
        db.flush([*changed_entries, *changed_buckets])
    return count


def _eligible(db: Session, user_id: int, now: datetime) -> list[AiCreditBucket]:
    expire_due_buckets(db, user_id=user_id, now=now)
    # included first. NULL expires last for purchased credits.
    with db.no_autoflush:
        rows = db.query(AiCreditBucket).filter(AiCreditBucket.user_id == user_id, AiCreditBucket.status == "active", AiCreditBucket.remaining_amount > 0).all()
    far = datetime.max.replace(tzinfo=timezone.utc)
    return sorted(rows, key=lambda b: (0 if b.credit_class == "included" else 1, _now(b.expires_at) if b.expires_at else far, _now(b.granted_at), b.id))


def debit_credits(db: Session, *, user_id: int, amount: int, capability: str, idempotency_key: str, reason_code: str = "capability_usage", now: datetime | None = None) -> AiCreditLedgerEntry:
    if amount <= 0 or not capability.strip(): raise AiCreditError("Invalid debit", code="invalid_debit")
    expected = (int(user_id), -int(amount), "debit", "capability", "capability_request", idempotency_key, reason_code, capability.strip())
    old = _existing(db, idempotency_key, expected)
    if old: return old
    at = _now(now); remaining = amount; allocations: list[tuple[AiCreditBucket, int]] = []
    for bucket in _eligible(db, user_id, at):
        take = min(remaining, int(bucket.remaining_amount)); allocations.append((bucket, take)); remaining -= take
        if not remaining: break
    if remaining: raise AiCreditError("Insufficient AI Credits", code="insufficient_credits")
    entry = AiCreditLedgerEntry(user_id=user_id, delta=-amount, operation_type="debit", source_type="capability", source_ref_type="capability_request", source_ref_id=idempotency_key, reason_code=reason_code, capability=capability.strip(), idempotency_key=idempotency_key, actor_kind="user", actor_user_id=user_id, created_at=at)
    db.add(entry); db.flush([entry])
    for bucket, take in allocations:
        with db.no_autoflush:
            updated = db.query(AiCreditBucket).filter(AiCreditBucket.id == bucket.id, AiCreditBucket.status == "active", AiCreditBucket.remaining_amount >= take).update({AiCreditBucket.remaining_amount: AiCreditBucket.remaining_amount - take}, synchronize_session=False)
        if updated != 1: raise AiCreditError("AI Credits changed concurrently", code="concurrent_retry")
        allocation = AiCreditDebitAllocation(debit_ledger_entry_id=entry.id, bucket_id=bucket.id, amount=take)
        db.add(allocation); db.flush([allocation]); db.refresh(bucket)
        if bucket.remaining_amount == 0: bucket.status = "depleted"
    # Persist bucket status only; the allocation rows already have durable ids.
    db.flush([bucket for bucket, _ in allocations])
    return entry


@dataclass(frozen=True)
class AiCreditBalance:
    included_total: int; included_used: int; included_expired: int; included_revoked: int; included_remaining: int
    purchased_total: int; purchased_used: int; purchased_expired: int; purchased_revoked: int; purchased_remaining: int
    total_spendable: int; period_end: datetime | None; nearest_purchased_expiry: datetime | None


def get_balance(db: Session, *, user_id: int, now: datetime | None = None) -> AiCreditBalance:
    at = _now(now); expire_due_buckets(db, user_id=user_id, now=at)
    with db.no_autoflush:
        buckets = db.query(AiCreditBucket).filter(AiCreditBucket.user_id == user_id).all()
        alloc = dict(db.query(AiCreditBucket.credit_class, func.coalesce(func.sum(AiCreditDebitAllocation.amount), 0)).join(AiCreditDebitAllocation, AiCreditDebitAllocation.bucket_id == AiCreditBucket.id).filter(AiCreditBucket.user_id == user_id).group_by(AiCreditBucket.credit_class).all())
    def total(kind): return sum(int(b.original_amount) for b in buckets if b.credit_class == kind)
    def rem(kind): return sum(int(b.remaining_amount) for b in buckets if b.credit_class == kind and b.status == "active" and (b.expires_at is None or _now(b.expires_at) > at))
    bucket_kind = {str(b.id): b.credit_class for b in buckets}
    with db.no_autoflush:
        events = db.query(AiCreditLedgerEntry).filter(AiCreditLedgerEntry.user_id == user_id, AiCreditLedgerEntry.source_ref_type == "ai_credit_bucket").all()
    def removed(kind, op):
        return sum(-int(e.delta) for e in events if e.operation_type == op and bucket_kind.get(str(e.source_ref_id)) == kind)
    active_included = [b for b in buckets if b.credit_class == "included" and b.status == "active"]
    active_purchased = [b for b in buckets if b.credit_class == "purchased" and b.status == "active" and b.expires_at]
    return AiCreditBalance(total("included"), int(alloc.get("included", 0)), removed("included", "expiration"), removed("included", "revoke"), rem("included"), total("purchased"), int(alloc.get("purchased", 0)), removed("purchased", "expiration"), removed("purchased", "revoke"), rem("purchased"), rem("included") + rem("purchased"), min((_now(b.expires_at) for b in active_included if b.expires_at), default=None), min((_now(b.expires_at) for b in active_purchased), default=None))


def revoke_bucket(db: Session, *, bucket_id: int, idempotency_key: str, reason_code: str, actor_kind: str = "system", now: datetime | None = None) -> AiCreditBucket:
    with db.no_autoflush:
        bucket = db.get(AiCreditBucket, int(bucket_id))
    if bucket is None: raise AiCreditError("AI Credit bucket not found", code="bucket_not_found")
    amount = int(bucket.remaining_amount)
    with db.no_autoflush:
        prior = db.query(AiCreditLedgerEntry).filter(AiCreditLedgerEntry.idempotency_key == idempotency_key).first()
    if prior:
        if prior.operation_type != "revoke" or prior.user_id != bucket.user_id or prior.source_ref_id != str(bucket.id):
            raise AiCreditError("Idempotency key was reused with a different payload", code="idempotency_conflict")
        return bucket
    if not amount: return bucket
    expected = (bucket.user_id, -amount, "revoke", "bucket", "ai_credit_bucket", str(bucket.id), reason_code, None)
    old = _existing(db, idempotency_key, expected)
    if old: return bucket
    entry = AiCreditLedgerEntry(user_id=bucket.user_id, delta=-amount, operation_type="revoke", source_type="bucket", source_ref_type="ai_credit_bucket", source_ref_id=str(bucket.id), reason_code=reason_code, idempotency_key=idempotency_key, actor_kind=actor_kind, created_at=_now(now))
    db.add(entry)
    bucket.remaining_amount = 0; bucket.status = "revoked"
    db.flush([entry, bucket])
    return bucket


def history(db: Session, *, user_id: int, before_id: int | None = None, limit: int = 50):
    with db.no_autoflush:
        q = db.query(AiCreditLedgerEntry).filter(AiCreditLedgerEntry.user_id == user_id)
        if before_id: q = q.filter(AiCreditLedgerEntry.id < before_id)
        return q.order_by(AiCreditLedgerEntry.id.desc()).limit(max(1, min(limit, 100))).all()
