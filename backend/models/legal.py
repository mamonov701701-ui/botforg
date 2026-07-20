"""
Юридические документы, согласия (152-ФЗ) и готовность к запуску продаж.

Этап 6.14.9B-1A: редакции документов, checklist, расширенные согласия.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from backend.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class LegalDocType(str, Enum):
    PUBLIC_OFFER = "public_offer"
    REFUND_POLICY = "refund_policy"
    PRIVACY_POLICY = "privacy_policy"
    PERSONAL_DATA_CONSENT = "personal_data_consent"
    ADVERTISING_CONSENT = "advertising_consent"
    COOKIES_POLICY = "cookies_policy"
    DATA_PROCESSING_ASSIGNMENT = "data_processing_assignment"
    ACCEPTABLE_USE = "acceptable_use"
    MARKETPLACE_RULES = "marketplace_rules"
    AUTORENEWAL_TERMS = "autorenewal_terms"
    TARIFF_TERMS = "tariff_terms"


class LegalRevisionStatus(str, Enum):
    DRAFT = "draft"
    READY_FOR_REVIEW = "ready_for_review"
    LAWYER_APPROVED = "lawyer_approved"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class LegalConsentSource(str, Enum):
    REGISTRATION = "registration"
    LOGIN = "login"
    CHECKOUT = "checkout"
    SETTINGS = "settings"


class LegalChecklistItemKey(str, Enum):
    SELLER_DETAILS = "seller_details"
    PAYMENT_PROVIDER = "payment_provider"
    FISCAL_CASH_REGISTER = "fiscal_cash_register"
    HOSTING_DATACENTER = "hosting_datacenter"
    SUBPROCESSORS = "subprocessors"
    RETENTION_PERIODS = "retention_periods"
    LAWYER_DOCUMENTS_APPROVED = "lawyer_documents_approved"
    REQUIRED_REVISIONS_PUBLISHED = "required_revisions_published"
    OWNER_LAUNCH_CONFIRMATION = "owner_launch_confirmation"


# Docs that must be published for legal_launch_ready (backend-enforced).
REQUIRED_PUBLISHED_DOC_TYPES: frozenset[str] = frozenset(
    {
        LegalDocType.PUBLIC_OFFER.value,
        LegalDocType.REFUND_POLICY.value,
        LegalDocType.PRIVACY_POLICY.value,
        LegalDocType.PERSONAL_DATA_CONSENT.value,
        LegalDocType.TARIFF_TERMS.value,
    }
)

DOC_TYPE_SLUGS: dict[str, str] = {
    LegalDocType.PUBLIC_OFFER.value: "public-offer",
    LegalDocType.REFUND_POLICY.value: "refund-policy",
    LegalDocType.PRIVACY_POLICY.value: "privacy-policy",
    LegalDocType.PERSONAL_DATA_CONSENT.value: "personal-data-consent",
    LegalDocType.ADVERTISING_CONSENT.value: "advertising-consent",
    LegalDocType.COOKIES_POLICY.value: "cookies-policy",
    LegalDocType.DATA_PROCESSING_ASSIGNMENT.value: "data-processing-assignment",
    LegalDocType.ACCEPTABLE_USE.value: "acceptable-use",
    LegalDocType.MARKETPLACE_RULES.value: "marketplace-rules",
    LegalDocType.AUTORENEWAL_TERMS.value: "autorenewal-terms",
    LegalDocType.TARIFF_TERMS.value: "tariff-terms",
}

SLUG_TO_DOC_TYPE: dict[str, str] = {v: k for k, v in DOC_TYPE_SLUGS.items()}

# Technical refund rule version snapshotted on purchase (6.14.9A proportional).
DEFAULT_REFUND_FORMULA_VERSION = "proportional_v1"


class Consent(Base):
    """
    Факт принятия пользователем документа.

    Legacy rows: doc_type + doc_version without revision_id.
    6.14.9B-1A: optional link to LegalDocumentRevision + source + hash.
    """
    __tablename__ = "consents"
    __table_args__ = (
        Index("ix_consents_user_id", "user_id"),
        Index("ix_consents_revision_id", "revision_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    doc_type = Column(String(64), nullable=False)
    doc_version = Column(String(32), nullable=False)
    accepted_at = Column(DateTime, default=_utcnow, nullable=False)
    ip = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    # 6.14.9B-1A extensions (nullable for legacy rows)
    revision_id = Column(
        Integer,
        ForeignKey("legal_document_revisions.id", ondelete="SET NULL"),
        nullable=True,
    )
    source = Column(String(32), nullable=True)
    content_sha256 = Column(String(64), nullable=True)
    confirmation_result = Column(String(32), nullable=True)

    revision = relationship(
        "LegalDocumentRevision", foreign_keys=[revision_id]
    )


class LegalDocumentRevision(Base):
    """Редакция юридического документа (immutable after published/archived)."""

    __tablename__ = "legal_document_revisions"
    __table_args__ = (
        UniqueConstraint(
            "doc_type",
            "version",
            name="uq_legal_document_revisions_type_version",
        ),
        Index("ix_legal_document_revisions_doc_type", "doc_type"),
        Index("ix_legal_document_revisions_status", "status"),
        Index("ix_legal_document_revisions_slug", "slug"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    doc_type = Column(String(64), nullable=False)
    slug = Column(String(64), nullable=False)
    version = Column(String(32), nullable=False)
    status = Column(String(32), nullable=False, default=LegalRevisionStatus.DRAFT.value)
    title = Column(String(255), nullable=False)
    body_markdown = Column(Text, nullable=False, default="")
    content_sha256 = Column(String(64), nullable=False, default="")
    # Internal only — never exposed on public APIs.
    internal_notes = Column(Text, nullable=True)

    created_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    lawyer_approved_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    published_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)
    lawyer_approved_at = Column(DateTime, nullable=True)
    published_at = Column(DateTime, nullable=True)
    archived_at = Column(DateTime, nullable=True)


class LegalLaunchChecklistItem(Base):
    """Пункт чек-листа юридической готовности к запуску продаж."""

    __tablename__ = "legal_launch_checklist_items"
    __table_args__ = (
        UniqueConstraint(
            "item_key",
            name="uq_legal_launch_checklist_item_key",
        ),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    item_key = Column(String(64), nullable=False)
    label_ru = Column(String(255), nullable=False)
    is_completed = Column(Boolean, nullable=False, default=False)
    completed_at = Column(DateTime, nullable=True)
    completed_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    note = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)
