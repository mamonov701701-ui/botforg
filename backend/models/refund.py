"""
RefundRequest / Revision / Ledger / Audit — data foundation (Этап 6.14.1).

Provider refund execution и entitlement revoke — вне scope 6.14.1.
Статусы заявки — единый workflow enum по контракту 6.13 (без отдельного outcome-столбца).
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from backend.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class RefundRequestStatus(str, Enum):
    """Единый lifecycle status (workflow + terminal) — см. 6.13 / 6.14.1 docs."""

    SUBMITTED = "submitted"
    CALCULATING = "calculating"
    AWAITING_ADMIN_REVIEW = "awaiting_admin_review"
    ADMIN_EDITED = "admin_edited"
    AWAITING_FINAL_CONFIRMATION = "awaiting_final_confirmation"
    APPROVED = "approved"
    REFUND_PROCESSING = "refund_processing"
    REFUNDED = "refunded"
    PARTIALLY_REFUNDED = "partially_refunded"
    ENTITLEMENT_PROCESSING = "entitlement_processing"
    COMPLETED = "completed"
    CALCULATION_FAILED = "calculation_failed"
    MANUAL_REVIEW_REQUIRED = "manual_review_required"
    NEEDS_INFORMATION = "needs_information"
    REJECTED = "rejected"
    PROVIDER_UNKNOWN = "provider_unknown"
    REFUND_FAILED = "refund_failed"
    ENTITLEMENT_FAILED = "entitlement_failed"
    CHARGEBACK_REVIEW = "chargeback_review"
    CANCELED = "canceled"


# После входа в эти статусы финансовые поля revision считаются frozen.
REFUND_FINANCIAL_FROZEN_STATUSES = frozenset(
    {
        RefundRequestStatus.REFUND_PROCESSING.value,
        RefundRequestStatus.REFUNDED.value,
        RefundRequestStatus.PARTIALLY_REFUNDED.value,
        RefundRequestStatus.ENTITLEMENT_PROCESSING.value,
        RefundRequestStatus.COMPLETED.value,
        RefundRequestStatus.PROVIDER_UNKNOWN.value,
    }
)

REFUND_TERMINAL_STATUSES = frozenset(
    {
        RefundRequestStatus.COMPLETED.value,
        RefundRequestStatus.REJECTED.value,
        RefundRequestStatus.CANCELED.value,
    }
)


class RefundRevisionType(str, Enum):
    AUTOMATIC = "automatic"
    ADMIN = "admin"


class RefundCalculationStatus(str, Enum):
    OK = "ok"
    FAILED = "failed"
    MANUAL_REQUIRED = "manual_required"
    SUPERSEDED = "superseded"


class RefundType(str, Enum):
    FULL = "full"
    PARTIAL = "partial"


class RefundEntitlementAction(str, Enum):
    NONE = "none"
    CANCEL_IMMEDIATE = "cancel_immediate"
    CANCEL_AT = "cancel_at"
    EXPIRE_AT = "expire_at"
    REDUCE_AMOUNT = "reduce_amount"
    CANCEL_ADDON = "cancel_addon"
    EXPIRE_ADDON = "expire_addon"


class RefundLedgerEntryType(str, Enum):
    """
    Ledger entry types.

    6.14.1/6.14.2 writers may create planned/reserved only (no provider execution).
    succeeded / failed / canceled / provider_unknown — reserved for later stages;
    calculation already buckets them correctly when present.
    """

    PLANNED = "planned"
    RESERVED = "reserved"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"
    PROVIDER_UNKNOWN = "provider_unknown"


# Active holds: block re-reservation, NOT counted as money returned.
REFUND_LEDGER_ACTIVE_RESERVATION_TYPES = frozenset(
    {
        RefundLedgerEntryType.PLANNED.value,
        RefundLedgerEntryType.RESERVED.value,
    }
)

# Actually completed refunds that reduce paid balance.
REFUND_LEDGER_CONFIRMED_TYPES = frozenset(
    {
        RefundLedgerEntryType.SUCCEEDED.value,
    }
)

# Conservative hold (unknown outcome) — reduces available, not confirmed.
REFUND_LEDGER_PROVIDER_UNKNOWN_TYPES = frozenset(
    {
        RefundLedgerEntryType.PROVIDER_UNKNOWN.value,
    }
)

# No impact on refundable available / confirmed.
REFUND_LEDGER_INACTIVE_TYPES = frozenset(
    {
        RefundLedgerEntryType.FAILED.value,
        RefundLedgerEntryType.CANCELED.value,
    }
)


class RefundLedgerProviderStatus(str, Enum):
    """Локальные статусы ledger до / вокруг provider execution."""

    LOCAL_ONLY = "local_only"
    NOT_SUBMITTED = "not_submitted"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"
    PROVIDER_UNKNOWN = "provider_unknown"


class RefundAuditActorType(str, Enum):
    USER = "user"
    ADMIN = "admin"
    SYSTEM = "system"


class RefundAuditAction(str, Enum):
    CREATED = "created"
    STATUS_CHANGED = "status_changed"
    REVISION_CREATED = "revision_created"
    APPROVED_REVISION_SET = "approved_revision_set"
    LEDGER_ENTRY_CREATED = "ledger_entry_created"
    VERSION_BUMP = "version_bump"
    VALIDATION_REJECTED = "validation_rejected"


class RefundRequest(Base):
    __tablename__ = "refund_requests"
    __table_args__ = (
        Index("ix_refund_requests_user_id", "user_id"),
        Index("ix_refund_requests_status", "status"),
        Index("ix_refund_requests_checkout_intent_id", "checkout_intent_id"),
        Index("ix_refund_requests_payment_attempt_id", "payment_attempt_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    checkout_intent_id = Column(
        Integer,
        ForeignKey("checkout_intents.id", ondelete="RESTRICT"),
        nullable=False,
    )
    payment_attempt_id = Column(
        Integer,
        ForeignKey("payment_attempts.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status = Column(
        String(64),
        nullable=False,
        default=RefundRequestStatus.SUBMITTED.value,
    )
    reason_category = Column(String(64), nullable=False)
    user_comment = Column(Text, nullable=True)
    current_revision_number = Column(Integer, nullable=False, default=0)
    approved_revision_id = Column(
        Integer,
        ForeignKey(
            "refund_revisions.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_refund_requests_approved_revision_id",
        ),
        nullable=True,
    )
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)
    submitted_at = Column(DateTime, default=_utcnow, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    # Optimistic locking counter (increment on each mutating service op).
    version = Column(Integer, nullable=False, default=1)

    user = relationship("User", foreign_keys=[user_id])
    checkout_intent = relationship("CheckoutIntent", foreign_keys=[checkout_intent_id])
    payment_attempt = relationship("PaymentAttempt", foreign_keys=[payment_attempt_id])
    revisions = relationship(
        "RefundRevision",
        back_populates="refund_request",
        foreign_keys="RefundRevision.refund_request_id",
        cascade="all, delete-orphan",
        order_by="RefundRevision.revision_number",
    )
    approved_revision = relationship(
        "RefundRevision",
        foreign_keys=[approved_revision_id],
        post_update=True,
    )
    ledger_entries = relationship(
        "RefundLedgerEntry",
        back_populates="refund_request",
        cascade="all, delete-orphan",
    )
    audit_events = relationship(
        "RefundAuditEvent",
        back_populates="refund_request",
        cascade="all, delete-orphan",
    )


class RefundRevision(Base):
    """Immutable calculation / admin revision. Updates after insert are forbidden."""

    __tablename__ = "refund_revisions"
    __table_args__ = (
        UniqueConstraint(
            "refund_request_id",
            "revision_number",
            name="uq_refund_revisions_request_number",
        ),
        Index("ix_refund_revisions_refund_request_id", "refund_request_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    refund_request_id = Column(
        Integer,
        ForeignKey("refund_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    revision_number = Column(Integer, nullable=False)
    revision_type = Column(String(32), nullable=False)
    created_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    based_on_revision_id = Column(
        Integer,
        ForeignKey("refund_revisions.id", ondelete="SET NULL"),
        nullable=True,
    )
    calculation_status = Column(String(32), nullable=False)
    refund_type = Column(String(32), nullable=False)
    currency = Column(String(10), nullable=False, default="RUB")
    paid_amount = Column(Numeric(10, 2), nullable=False)
    prior_refunded_amount = Column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00")
    )
    proposed_refund_amount = Column(Numeric(10, 2), nullable=False)
    final_refund_amount = Column(Numeric(10, 2), nullable=True)
    calculation_at = Column(DateTime, nullable=False)
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)
    used_time_seconds = Column(Integer, nullable=True)
    total_time_seconds = Column(Integer, nullable=True)
    addon_total_units = Column(Integer, nullable=True)
    addon_used_units = Column(Integer, nullable=True)
    addon_revoke_units = Column(Integer, nullable=True)
    entitlement_action = Column(String(64), nullable=False)
    entitlement_effective_at = Column(DateTime, nullable=True)
    adjustment_reason_category = Column(String(64), nullable=True)
    adjustment_comment = Column(Text, nullable=True)
    calculation_snapshot = Column(JSON, nullable=True)
    entitlement_snapshot = Column(JSON, nullable=True)
    usage_snapshot = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False)

    refund_request = relationship(
        "RefundRequest",
        back_populates="revisions",
        foreign_keys=[refund_request_id],
    )
    created_by_user = relationship("User", foreign_keys=[created_by_user_id])
    based_on_revision = relationship(
        "RefundRevision",
        remote_side=[id],
        foreign_keys=[based_on_revision_id],
    )


class RefundLedgerEntry(Base):
    """Финансовый ledger. 6.14.1 — только preparatory entries, без provider call."""

    __tablename__ = "refund_ledger_entries"
    __table_args__ = (
        UniqueConstraint(
            "idempotency_key",
            name="uq_refund_ledger_entries_idempotency",
        ),
        Index("ix_refund_ledger_entries_refund_request_id", "refund_request_id"),
        Index("ix_refund_ledger_entries_checkout_intent_id", "checkout_intent_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    refund_request_id = Column(
        Integer,
        ForeignKey("refund_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    refund_revision_id = Column(
        Integer,
        ForeignKey("refund_revisions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    checkout_intent_id = Column(
        Integer,
        ForeignKey("checkout_intents.id", ondelete="RESTRICT"),
        nullable=False,
    )
    payment_attempt_id = Column(
        Integer,
        ForeignKey("payment_attempts.id", ondelete="RESTRICT"),
        nullable=False,
    )
    entry_type = Column(String(32), nullable=False)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(10), nullable=False, default="RUB")
    idempotency_key = Column(String(128), nullable=False)
    provider_refund_id = Column(String(255), nullable=True)
    provider_status = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False)

    refund_request = relationship("RefundRequest", back_populates="ledger_entries")
    refund_revision = relationship("RefundRevision", foreign_keys=[refund_revision_id])


class RefundAuditEvent(Base):
    """Refund-specific audit. No secrets / JWT / raw provider payload."""

    __tablename__ = "refund_audit_events"
    __table_args__ = (
        Index("ix_refund_audit_events_refund_request_id", "refund_request_id"),
        Index("ix_refund_audit_events_created_at", "created_at"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    refund_request_id = Column(
        Integer,
        ForeignKey("refund_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    refund_revision_id = Column(
        Integer,
        ForeignKey("refund_revisions.id", ondelete="SET NULL"),
        nullable=True,
    )
    actor_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_type = Column(String(32), nullable=False)
    action = Column(String(64), nullable=False)
    previous_status = Column(String(64), nullable=True)
    new_status = Column(String(64), nullable=True)
    changed_fields = Column(JSON, nullable=True)
    reason = Column(Text, nullable=True)
    event_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime, default=_utcnow, nullable=False)

    refund_request = relationship("RefundRequest", back_populates="audit_events")
