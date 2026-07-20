"""Схемы юридического контура (6.14.9B-1A)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class LegalRevisionPublicOut(BaseModel):
    id: int
    doc_type: str
    slug: str
    version: str
    status: str
    title: str
    body_markdown: str
    content_sha256: str
    published_at: datetime | None = None
    archived_at: datetime | None = None

    class Config:
        from_attributes = True


class LegalRevisionListItemOut(BaseModel):
    id: int
    doc_type: str
    slug: str
    version: str
    status: str
    title: str
    content_sha256: str
    published_at: datetime | None = None
    archived_at: datetime | None = None

    class Config:
        from_attributes = True


class LegalRevisionAdminOut(LegalRevisionPublicOut):
    internal_notes: str | None = None
    created_by_user_id: int | None = None
    updated_by_user_id: int | None = None
    lawyer_approved_by_user_id: int | None = None
    published_by_user_id: int | None = None
    created_at: datetime
    updated_at: datetime
    lawyer_approved_at: datetime | None = None


class LegalDraftCreateIn(BaseModel):
    doc_type: str
    version: str = Field(..., min_length=1, max_length=32)
    title: str = Field(..., min_length=1, max_length=255)
    body_markdown: str = ""
    internal_notes: str | None = None


class LegalDraftUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    body_markdown: str | None = None
    internal_notes: str | None = None
    clear_internal_notes: bool = False


class LegalChecklistItemOut(BaseModel):
    id: int
    item_key: str
    label_ru: str
    is_completed: bool
    completed_at: datetime | None = None
    completed_by_user_id: int | None = None
    note: str | None = None
    updated_at: datetime

    class Config:
        from_attributes = True


class LegalChecklistItemUpdateIn(BaseModel):
    is_completed: bool
    note: str | None = None


class LegalLaunchStatusOut(BaseModel):
    legal_launch_ready: bool
    environment: str
    payments_blocked: bool
    checklist_complete: bool
    required_docs_published: bool
    missing_checklist_keys: list[str]
    missing_doc_types: list[str]


class LegalConsentAcceptIn(BaseModel):
    doc_type: str
    source: str
    revision_id: int | None = None
    doc_version: str | None = None


class LegalConsentAcceptedOut(BaseModel):
    """Согласие пользователя без IP / user-agent / служебных полей."""

    doc_type: str
    doc_version: str
    accepted_at: datetime
    revision_id: int | None = None
    source: str | None = None


class LegalPurchaseSnapshotDocOut(BaseModel):
    revision_id: int
    doc_type: str
    slug: str
    version: str
    title: str


class LegalPurchaseSnapshotOut(BaseModel):
    checkout_intent_id: int
    product_type: str
    product_code: str
    product_name: str
    amount: str
    currency: str
    status: str
    legal_snapshot_at: datetime | None = None
    refund_formula_version: str | None = None
    offer: LegalPurchaseSnapshotDocOut | None = None
    refund_policy: LegalPurchaseSnapshotDocOut | None = None
    tariff_terms: LegalPurchaseSnapshotDocOut | None = None


class LegalAccountOverviewOut(BaseModel):
    current_documents: list[LegalRevisionListItemOut]
    archived_documents: list[LegalRevisionListItemOut] = []
    accepted: list[LegalConsentAcceptedOut] = []
    purchase_snapshots: list[LegalPurchaseSnapshotOut] = []
