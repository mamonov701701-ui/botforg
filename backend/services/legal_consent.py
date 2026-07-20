"""
Фиксация согласий с привязкой к редакции (этап 6.14.9B-1A).
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.models.legal import (
    Consent,
    LegalConsentSource,
    LegalDocType,
    LegalDocumentRevision,
    LegalRevisionStatus,
)
from backend.services.legal_documents import (
    LegalDocumentError,
    assert_known_doc_type,
    content_sha256,
    get_published_by_type,
)

# AuthModal / legacy API aliases → LegalDocType
_LEGACY_DOC_ALIAS = {
    "privacy_policy": LegalDocType.PRIVACY_POLICY.value,
    "terms": LegalDocType.PUBLIC_OFFER.value,
    "consent_text": LegalDocType.PERSONAL_DATA_CONSENT.value,
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _normalize_doc_type(doc_type: str) -> str:
    raw = (doc_type or "").strip()
    if raw in _LEGACY_DOC_ALIAS:
        return _LEGACY_DOC_ALIAS[raw]
    return assert_known_doc_type(raw)


def record_consent(
    db: Session,
    *,
    user_id: int,
    doc_type: str,
    source: str,
    ip: str | None = None,
    user_agent: str | None = None,
    revision_id: int | None = None,
    doc_version: str | None = None,
    confirmation_result: str = "accepted",
    commit: bool = True,
) -> Consent:
    """
    Записать одно согласие.

    Оферта, ПДн, реклама и автоплатёж — отдельные вызовы (не смешивать).
    """
    sources = {e.value for e in LegalConsentSource}
    if source not in sources:
        raise LegalDocumentError(f"Unknown source {source!r}", code="unknown_source")

    revision: LegalDocumentRevision | None = None
    if revision_id is not None:
        revision = db.get(LegalDocumentRevision, int(revision_id))
        if revision is None:
            raise LegalDocumentError("Revision not found", code="revision_not_found")
        if revision.status not in {
            LegalRevisionStatus.PUBLISHED.value,
            LegalRevisionStatus.ARCHIVED.value,
        }:
            raise LegalDocumentError(
                "Consent requires published or archived revision",
                code="revision_not_public",
            )
        resolved_type = revision.doc_type
        version = revision.version
        sha = revision.content_sha256 or content_sha256(revision.body_markdown or "")
        resolved_revision_id = int(revision.id)
    else:
        resolved_type = _normalize_doc_type(doc_type)
        published = get_published_by_type(db, resolved_type)
        if published is not None:
            revision = published
            version = published.version
            sha = published.content_sha256
            resolved_revision_id = int(published.id)
            if doc_version and doc_version.strip() and doc_version.strip() != version:
                raise LegalDocumentError(
                    "doc_version does not match published revision",
                    code="version_mismatch",
                )
        else:
            # Не создаём фиктивное согласие без опубликованной редакции CMS.
            raise LegalDocumentError(
                "No published revision for document type",
                code="no_published_revision",
            )

    row = Consent(
        user_id=int(user_id),
        doc_type=resolved_type,
        doc_version=version,
        accepted_at=_utcnow(),
        ip=ip,
        user_agent=user_agent,
        revision_id=resolved_revision_id,
        source=source,
        content_sha256=sha,
        confirmation_result=(confirmation_result or "accepted")[:32],
    )
    db.add(row)
    if commit:
        db.commit()
        db.refresh(row)
    else:
        db.flush()
    return row
