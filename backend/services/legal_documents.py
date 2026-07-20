"""
Жизненный цикл редакций юридических документов (этап 6.14.9B-1A).
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from backend.models.legal import (
    DOC_TYPE_SLUGS,
    SLUG_TO_DOC_TYPE,
    LegalDocType,
    LegalDocumentRevision,
    LegalRevisionStatus,
)
from backend.models.tariff import AdminAuditLog


class LegalDocumentError(Exception):
    def __init__(self, message: str, *, code: str = "legal_error") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


_IMMUTABLE = frozenset(
    {
        LegalRevisionStatus.PUBLISHED.value,
        LegalRevisionStatus.ARCHIVED.value,
    }
)

_EDITABLE = frozenset(
    {
        LegalRevisionStatus.DRAFT.value,
        LegalRevisionStatus.READY_FOR_REVIEW.value,
        LegalRevisionStatus.LAWYER_APPROVED.value,
    }
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def content_sha256(body: str) -> str:
    return hashlib.sha256((body or "").encode("utf-8")).hexdigest()


def assert_known_doc_type(doc_type: str) -> str:
    values = {e.value for e in LegalDocType}
    if doc_type not in values:
        raise LegalDocumentError(
            f"Unknown doc_type {doc_type!r}", code="unknown_doc_type"
        )
    return doc_type


def slug_for_doc_type(doc_type: str) -> str:
    assert_known_doc_type(doc_type)
    return DOC_TYPE_SLUGS[doc_type]


def doc_type_for_slug(slug: str) -> str:
    mapped = SLUG_TO_DOC_TYPE.get(slug)
    if mapped is None:
        raise LegalDocumentError(f"Unknown slug {slug!r}", code="unknown_slug")
    return mapped


def _write_audit(
    db: Session,
    *,
    admin_user_id: int,
    action: str,
    entity_id: int | None,
    old_value: dict | None = None,
    new_value: dict | None = None,
    comment: str | None = None,
) -> None:
    # Never put internal_notes / body secrets into audit payloads from callers.
    db.add(
        AdminAuditLog(
            admin_user_id=int(admin_user_id),
            action=action,
            entity_type="legal_document_revision",
            entity_id=entity_id,
            old_value=old_value,
            new_value=new_value,
            comment=comment,
            created_at=_utcnow(),
        )
    )


def _public_safe_revision_dict(rev: LegalDocumentRevision) -> dict[str, Any]:
    return {
        "id": rev.id,
        "doc_type": rev.doc_type,
        "slug": rev.slug,
        "version": rev.version,
        "status": rev.status,
        "title": rev.title,
        "content_sha256": rev.content_sha256,
        "published_at": rev.published_at.isoformat() if rev.published_at else None,
        "archived_at": rev.archived_at.isoformat() if rev.archived_at else None,
    }


def create_draft(
    db: Session,
    *,
    doc_type: str,
    version: str,
    title: str,
    body_markdown: str,
    actor_user_id: int,
    internal_notes: str | None = None,
    commit: bool = True,
) -> LegalDocumentRevision:
    doc_type = assert_known_doc_type(doc_type)
    version = (version or "").strip()
    if not version:
        raise LegalDocumentError("version required", code="version_required")
    title = (title or "").strip()
    if not title:
        raise LegalDocumentError("title required", code="title_required")

    existing = (
        db.query(LegalDocumentRevision)
        .filter(
            LegalDocumentRevision.doc_type == doc_type,
            LegalDocumentRevision.version == version,
        )
        .first()
    )
    if existing is not None:
        raise LegalDocumentError(
            "Version already exists for this doc_type",
            code="version_conflict",
        )

    now = _utcnow()
    body = body_markdown or ""
    rev = LegalDocumentRevision(
        doc_type=doc_type,
        slug=slug_for_doc_type(doc_type),
        version=version,
        status=LegalRevisionStatus.DRAFT.value,
        title=title,
        body_markdown=body,
        content_sha256=content_sha256(body),
        internal_notes=internal_notes,
        created_by_user_id=int(actor_user_id),
        updated_by_user_id=int(actor_user_id),
        created_at=now,
        updated_at=now,
    )
    db.add(rev)
    db.flush()
    _write_audit(
        db,
        admin_user_id=actor_user_id,
        action="legal_revision_created",
        entity_id=rev.id,
        new_value={
            "doc_type": doc_type,
            "version": version,
            "status": rev.status,
            "content_sha256": rev.content_sha256,
        },
    )
    if commit:
        db.commit()
        db.refresh(rev)
    return rev


def update_draft(
    db: Session,
    *,
    revision_id: int,
    actor_user_id: int,
    title: str | None = None,
    body_markdown: str | None = None,
    internal_notes: str | None = None,
    clear_internal_notes: bool = False,
    commit: bool = True,
) -> LegalDocumentRevision:
    rev = db.get(LegalDocumentRevision, int(revision_id))
    if rev is None:
        raise LegalDocumentError("Revision not found", code="revision_not_found")
    if rev.status in _IMMUTABLE:
        raise LegalDocumentError(
            "Published/archived revisions are immutable",
            code="revision_immutable",
        )
    if rev.status not in {
        LegalRevisionStatus.DRAFT.value,
        LegalRevisionStatus.READY_FOR_REVIEW.value,
    }:
        # lawyer_approved: content edits require new revision; only status transitions
        raise LegalDocumentError(
            "Only draft or ready_for_review can be edited; "
            "create a new revision after lawyer approval",
            code="revision_not_editable",
        )

    if title is not None:
        title_s = title.strip()
        if not title_s:
            raise LegalDocumentError("title required", code="title_required")
        rev.title = title_s
    if body_markdown is not None:
        rev.body_markdown = body_markdown
        rev.content_sha256 = content_sha256(body_markdown)
    if clear_internal_notes:
        rev.internal_notes = None
    elif internal_notes is not None:
        rev.internal_notes = internal_notes
    rev.updated_by_user_id = int(actor_user_id)
    rev.updated_at = _utcnow()
    # Editing after ready_for_review returns to draft.
    if rev.status == LegalRevisionStatus.READY_FOR_REVIEW.value:
        rev.status = LegalRevisionStatus.DRAFT.value

    _write_audit(
        db,
        admin_user_id=actor_user_id,
        action="legal_revision_updated",
        entity_id=rev.id,
        new_value={
            "status": rev.status,
            "content_sha256": rev.content_sha256,
            "title": rev.title,
        },
    )
    if commit:
        db.commit()
        db.refresh(rev)
    return rev


def submit_for_review(
    db: Session,
    *,
    revision_id: int,
    actor_user_id: int,
    commit: bool = True,
) -> LegalDocumentRevision:
    rev = db.get(LegalDocumentRevision, int(revision_id))
    if rev is None:
        raise LegalDocumentError("Revision not found", code="revision_not_found")
    if rev.status != LegalRevisionStatus.DRAFT.value:
        raise LegalDocumentError(
            "Only draft can be submitted for review",
            code="invalid_status_transition",
        )
    if not (rev.body_markdown or "").strip():
        raise LegalDocumentError("Body required", code="body_required")
    rev.status = LegalRevisionStatus.READY_FOR_REVIEW.value
    rev.updated_by_user_id = int(actor_user_id)
    rev.updated_at = _utcnow()
    _write_audit(
        db,
        admin_user_id=actor_user_id,
        action="legal_revision_ready_for_review",
        entity_id=rev.id,
        new_value={"status": rev.status},
    )
    if commit:
        db.commit()
        db.refresh(rev)
    return rev


def mark_lawyer_approved(
    db: Session,
    *,
    revision_id: int,
    actor_user_id: int,
    commit: bool = True,
) -> LegalDocumentRevision:
    rev = db.get(LegalDocumentRevision, int(revision_id))
    if rev is None:
        raise LegalDocumentError("Revision not found", code="revision_not_found")
    if rev.status != LegalRevisionStatus.READY_FOR_REVIEW.value:
        raise LegalDocumentError(
            "Only ready_for_review can be lawyer-approved",
            code="invalid_status_transition",
        )
    rev.status = LegalRevisionStatus.LAWYER_APPROVED.value
    rev.lawyer_approved_by_user_id = int(actor_user_id)
    rev.lawyer_approved_at = _utcnow()
    rev.updated_by_user_id = int(actor_user_id)
    rev.updated_at = _utcnow()
    _write_audit(
        db,
        admin_user_id=actor_user_id,
        action="legal_revision_lawyer_approved",
        entity_id=rev.id,
        new_value={"status": rev.status},
    )
    if commit:
        db.commit()
        db.refresh(rev)
    return rev


def publish_revision(
    db: Session,
    *,
    revision_id: int,
    actor_user_id: int,
    commit: bool = True,
) -> LegalDocumentRevision:
    """
    Атомарная публикация готового черновика.

    Требует status=draft (ready_for_review / lawyer_approved не в рабочем процессе).
    В одной транзакции: предыдущая published того же doc_type → archived,
    draft → published (+ published_at, content_sha256).
    """
    rev = db.get(LegalDocumentRevision, int(revision_id))
    if rev is None:
        raise LegalDocumentError("Revision not found", code="revision_not_found")
    if rev.status != LegalRevisionStatus.DRAFT.value:
        raise LegalDocumentError(
            "Опубликовать можно только черновик",
            code="invalid_status_transition",
        )
    if not (rev.body_markdown or "").strip():
        raise LegalDocumentError(
            "Перед публикацией заполните текст документа",
            code="body_required",
        )
    if not (rev.title or "").strip():
        raise LegalDocumentError(
            "Перед публикацией укажите название документа",
            code="title_required",
        )

    rev.content_sha256 = content_sha256(rev.body_markdown or "")
    now = _utcnow()
    previous = (
        db.query(LegalDocumentRevision)
        .filter(
            LegalDocumentRevision.doc_type == rev.doc_type,
            LegalDocumentRevision.status == LegalRevisionStatus.PUBLISHED.value,
            LegalDocumentRevision.id != rev.id,
        )
        .all()
    )
    for old in previous:
        old.status = LegalRevisionStatus.ARCHIVED.value
        old.archived_at = now
        old.updated_at = now
        _write_audit(
            db,
            admin_user_id=actor_user_id,
            action="legal_revision_archived",
            entity_id=old.id,
            new_value={"status": old.status, "superseded_by": rev.id},
        )

    rev.status = LegalRevisionStatus.PUBLISHED.value
    rev.published_at = now
    rev.published_by_user_id = int(actor_user_id)
    rev.updated_by_user_id = int(actor_user_id)
    rev.updated_at = now
    _write_audit(
        db,
        admin_user_id=actor_user_id,
        action="legal_revision_published",
        entity_id=rev.id,
        new_value=_public_safe_revision_dict(rev),
    )
    if commit:
        try:
            db.commit()
            db.refresh(rev)
        except Exception:
            db.rollback()
            raise
    else:
        db.flush()
    return rev


def delete_draft(
    db: Session,
    *,
    revision_id: int,
    actor_user_id: int,
    commit: bool = True,
) -> None:
    """Удалить только черновик (published/archived неизменяемы)."""
    rev = db.get(LegalDocumentRevision, int(revision_id))
    if rev is None:
        raise LegalDocumentError("Revision not found", code="revision_not_found")
    if rev.status != LegalRevisionStatus.DRAFT.value:
        raise LegalDocumentError(
            "Only draft revisions can be deleted",
            code="revision_immutable",
        )
    rid = int(rev.id)
    db.delete(rev)
    _write_audit(
        db,
        admin_user_id=actor_user_id,
        action="legal_revision_draft_deleted",
        entity_id=rid,
        new_value={"deleted": True},
    )
    if commit:
        db.commit()


def archive_revision(
    db: Session,
    *,
    revision_id: int,
    actor_user_id: int,
    commit: bool = True,
) -> LegalDocumentRevision:
    rev = db.get(LegalDocumentRevision, int(revision_id))
    if rev is None:
        raise LegalDocumentError("Revision not found", code="revision_not_found")
    if rev.status == LegalRevisionStatus.ARCHIVED.value:
        return rev
    if rev.status == LegalRevisionStatus.DRAFT.value:
        raise LegalDocumentError(
            "Archive draft by deleting workflow is not supported; publish path only",
            code="invalid_status_transition",
        )
    if rev.status not in {
        LegalRevisionStatus.PUBLISHED.value,
        LegalRevisionStatus.LAWYER_APPROVED.value,
        LegalRevisionStatus.READY_FOR_REVIEW.value,
    }:
        raise LegalDocumentError(
            "Cannot archive this status",
            code="invalid_status_transition",
        )
    rev.status = LegalRevisionStatus.ARCHIVED.value
    rev.archived_at = _utcnow()
    rev.updated_by_user_id = int(actor_user_id)
    rev.updated_at = _utcnow()
    _write_audit(
        db,
        admin_user_id=actor_user_id,
        action="legal_revision_archived",
        entity_id=rev.id,
        new_value={"status": rev.status},
    )
    if commit:
        db.commit()
        db.refresh(rev)
    return rev


def get_published_by_type(
    db: Session, doc_type: str
) -> LegalDocumentRevision | None:
    assert_known_doc_type(doc_type)
    return (
        db.query(LegalDocumentRevision)
        .filter(
            LegalDocumentRevision.doc_type == doc_type,
            LegalDocumentRevision.status == LegalRevisionStatus.PUBLISHED.value,
        )
        .first()
    )


def get_published_by_slug(
    db: Session, slug: str
) -> LegalDocumentRevision | None:
    doc_type = doc_type_for_slug(slug)
    return get_published_by_type(db, doc_type)


def get_public_version(
    db: Session, *, slug: str, version: str
) -> LegalDocumentRevision | None:
    doc_type = doc_type_for_slug(slug)
    rev = (
        db.query(LegalDocumentRevision)
        .filter(
            LegalDocumentRevision.doc_type == doc_type,
            LegalDocumentRevision.version == version,
            LegalDocumentRevision.status.in_(
                [
                    LegalRevisionStatus.PUBLISHED.value,
                    LegalRevisionStatus.ARCHIVED.value,
                ]
            ),
        )
        .first()
    )
    return rev


def list_public_documents(db: Session) -> list[LegalDocumentRevision]:
    return (
        db.query(LegalDocumentRevision)
        .filter(
            LegalDocumentRevision.status == LegalRevisionStatus.PUBLISHED.value
        )
        .order_by(LegalDocumentRevision.doc_type.asc())
        .all()
    )


def list_public_archive(db: Session, slug: str) -> list[LegalDocumentRevision]:
    """Архивные редакции одного типа (без текущей published)."""
    doc_type = doc_type_for_slug(slug)
    return (
        db.query(LegalDocumentRevision)
        .filter(
            LegalDocumentRevision.doc_type == doc_type,
            LegalDocumentRevision.status == LegalRevisionStatus.ARCHIVED.value,
        )
        .order_by(LegalDocumentRevision.id.desc())
        .all()
    )


def list_all_archived_documents(db: Session) -> list[LegalDocumentRevision]:
    """Все archived-редакции для публичного/ЛК архива."""
    return (
        db.query(LegalDocumentRevision)
        .filter(
            LegalDocumentRevision.status == LegalRevisionStatus.ARCHIVED.value,
        )
        .order_by(
            LegalDocumentRevision.doc_type.asc(),
            LegalDocumentRevision.id.desc(),
        )
        .all()
    )


def list_admin_revisions(
    db: Session, *, doc_type: str | None = None
) -> list[LegalDocumentRevision]:
    q = db.query(LegalDocumentRevision)
    if doc_type:
        assert_known_doc_type(doc_type)
        q = q.filter(LegalDocumentRevision.doc_type == doc_type)
    return q.order_by(
        LegalDocumentRevision.doc_type.asc(),
        LegalDocumentRevision.created_at.desc(),
    ).all()
