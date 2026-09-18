"""Append-only AI Credits ledger and spendable grant buckets (stage 7.4)."""
from datetime import datetime, timezone

from sqlalchemy import JSON, CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship

from backend.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class AiCreditLedgerEntry(Base):
    __tablename__ = "ai_credit_ledger_entries"
    __table_args__ = (
        CheckConstraint("delta <> 0", name="ck_ai_credit_ledger_delta_nonzero"),
        UniqueConstraint("idempotency_key", name="uq_ai_credit_ledger_idempotency"),
        Index("ix_ai_credit_ledger_user_created", "user_id", "created_at", "id"),
        Index("ix_ai_credit_ledger_source_ref", "source_ref_type", "source_ref_id"),
    )
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    delta = Column(Integer, nullable=False)
    operation_type = Column(String(32), nullable=False)
    source_type = Column(String(64), nullable=False)
    source_ref_type = Column(String(64), nullable=False)
    source_ref_id = Column(String(128), nullable=False)
    reason_code = Column(String(64), nullable=False)
    capability = Column(String(96), nullable=True)
    idempotency_key = Column(String(191), nullable=False)
    actor_kind = Column(String(32), nullable=False, default="system")
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    metadata_json = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, default=_utcnow)


class AiCreditBucket(Base):
    __tablename__ = "ai_credit_buckets"
    __table_args__ = (
        CheckConstraint("original_amount > 0", name="ck_ai_credit_bucket_original_positive"),
        CheckConstraint("remaining_amount >= 0", name="ck_ai_credit_bucket_remaining_nonnegative"),
        CheckConstraint("remaining_amount <= original_amount", name="ck_ai_credit_bucket_remaining_bounded"),
        UniqueConstraint("grant_ledger_entry_id", name="uq_ai_credit_bucket_grant_entry"),
        Index("ix_ai_credit_buckets_spend", "user_id", "credit_class", "status", "expires_at", "granted_at", "id"),
        Index("ix_ai_credit_buckets_source_ref", "source_ref_type", "source_ref_id"),
    )
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    credit_class = Column(String(16), nullable=False)
    original_amount = Column(Integer, nullable=False)
    remaining_amount = Column(Integer, nullable=False)
    source_type = Column(String(64), nullable=False)
    source_ref_type = Column(String(64), nullable=False)
    source_ref_id = Column(String(128), nullable=False)
    grant_ledger_entry_id = Column(Integer, ForeignKey("ai_credit_ledger_entries.id", ondelete="RESTRICT"), nullable=False)
    granted_at = Column(DateTime, nullable=False, default=_utcnow)
    expires_at = Column(DateTime, nullable=True)
    status = Column(String(16), nullable=False, default="active")
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    updated_at = Column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)
    grant_entry = relationship("AiCreditLedgerEntry")


class AiCreditDebitAllocation(Base):
    __tablename__ = "ai_credit_debit_allocations"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_ai_credit_debit_allocation_positive"),
        UniqueConstraint("debit_ledger_entry_id", "bucket_id", name="uq_ai_credit_debit_allocation_bucket"),
        Index("ix_ai_credit_debit_allocations_bucket", "bucket_id"),
    )
    id = Column(Integer, primary_key=True)
    debit_ledger_entry_id = Column(Integer, ForeignKey("ai_credit_ledger_entries.id", ondelete="RESTRICT"), nullable=False)
    bucket_id = Column(Integer, ForeignKey("ai_credit_buckets.id", ondelete="RESTRICT"), nullable=False)
    amount = Column(Integer, nullable=False)
    debit_entry = relationship("AiCreditLedgerEntry")
    bucket = relationship("AiCreditBucket")
