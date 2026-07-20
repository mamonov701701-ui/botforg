"""
Админ API юридических документов и checklist (6.14.9B-1A).

RBAC: require_tariff_admin (owner/admin / BF Администратор).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.tariff_admin import require_tariff_admin
from backend.models.user import User
from backend.schemas.legal import (
    LegalChecklistItemOut,
    LegalChecklistItemUpdateIn,
    LegalDraftCreateIn,
    LegalDraftUpdateIn,
    LegalLaunchStatusOut,
    LegalRevisionAdminOut,
)
from backend.services.legal_documents import (
    LegalDocumentError,
    archive_revision,
    create_draft,
    list_admin_revisions,
    mark_lawyer_approved,
    publish_revision,
    submit_for_review,
    update_draft,
)
from backend.services.legal_launch import (
    LegalLaunchError,
    compute_legal_launch_status,
    get_checklist_items,
    set_checklist_item,
    sync_required_revisions_checklist,
)

router = APIRouter(prefix="/api/admin/legal", tags=["legal-admin"])


def _http(exc: Exception) -> HTTPException:
    code = getattr(exc, "code", "legal_error")
    message = getattr(exc, "message", str(exc))
    status_code = status.HTTP_400_BAD_REQUEST
    if code in {"revision_not_found", "unknown_slug", "unknown_doc_type"}:
        status_code = status.HTTP_404_NOT_FOUND
    if code in {"revision_immutable", "publish_requires_lawyer_approval"}:
        status_code = status.HTTP_409_CONFLICT
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


def _admin_out(rev) -> LegalRevisionAdminOut:
    return LegalRevisionAdminOut(
        id=rev.id,
        doc_type=rev.doc_type,
        slug=rev.slug,
        version=rev.version,
        status=rev.status,
        title=rev.title,
        body_markdown=rev.body_markdown or "",
        content_sha256=rev.content_sha256 or "",
        published_at=rev.published_at,
        archived_at=rev.archived_at,
        internal_notes=rev.internal_notes,
        created_by_user_id=rev.created_by_user_id,
        updated_by_user_id=rev.updated_by_user_id,
        lawyer_approved_by_user_id=rev.lawyer_approved_by_user_id,
        published_by_user_id=rev.published_by_user_id,
        created_at=rev.created_at,
        updated_at=rev.updated_at,
        lawyer_approved_at=rev.lawyer_approved_at,
    )


@router.get("/revisions", response_model=list[LegalRevisionAdminOut])
async def admin_list_revisions(
    doc_type: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_tariff_admin),
):
    try:
        rows = list_admin_revisions(db, doc_type=doc_type)
    except LegalDocumentError as exc:
        raise _http(exc) from exc
    return [_admin_out(r) for r in rows]


@router.post(
    "/revisions",
    response_model=LegalRevisionAdminOut,
    status_code=status.HTTP_201_CREATED,
)
async def admin_create_draft(
    body: LegalDraftCreateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    try:
        rev = create_draft(
            db,
            doc_type=body.doc_type,
            version=body.version,
            title=body.title,
            body_markdown=body.body_markdown,
            actor_user_id=admin.id,
            internal_notes=body.internal_notes,
            commit=True,
        )
    except LegalDocumentError as exc:
        raise _http(exc) from exc
    return _admin_out(rev)


@router.patch("/revisions/{revision_id}", response_model=LegalRevisionAdminOut)
async def admin_update_draft(
    revision_id: int,
    body: LegalDraftUpdateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    try:
        rev = update_draft(
            db,
            revision_id=revision_id,
            actor_user_id=admin.id,
            title=body.title,
            body_markdown=body.body_markdown,
            internal_notes=body.internal_notes,
            clear_internal_notes=body.clear_internal_notes,
            commit=True,
        )
    except LegalDocumentError as exc:
        raise _http(exc) from exc
    return _admin_out(rev)


@router.post(
    "/revisions/{revision_id}/submit-review",
    response_model=LegalRevisionAdminOut,
)
async def admin_submit_review(
    revision_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    try:
        rev = submit_for_review(
            db, revision_id=revision_id, actor_user_id=admin.id, commit=True
        )
    except LegalDocumentError as exc:
        raise _http(exc) from exc
    return _admin_out(rev)


@router.post(
    "/revisions/{revision_id}/lawyer-approve",
    response_model=LegalRevisionAdminOut,
)
async def admin_lawyer_approve(
    revision_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    try:
        rev = mark_lawyer_approved(
            db, revision_id=revision_id, actor_user_id=admin.id, commit=True
        )
    except LegalDocumentError as exc:
        raise _http(exc) from exc
    return _admin_out(rev)


@router.post(
    "/revisions/{revision_id}/publish",
    response_model=LegalRevisionAdminOut,
)
async def admin_publish(
    revision_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    try:
        rev = publish_revision(
            db, revision_id=revision_id, actor_user_id=admin.id, commit=True
        )
        sync_required_revisions_checklist(db, actor_user_id=admin.id)
        db.commit()
        db.refresh(rev)
    except LegalDocumentError as exc:
        raise _http(exc) from exc
    return _admin_out(rev)


@router.post(
    "/revisions/{revision_id}/archive",
    response_model=LegalRevisionAdminOut,
)
async def admin_archive(
    revision_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    try:
        rev = archive_revision(
            db, revision_id=revision_id, actor_user_id=admin.id, commit=True
        )
        sync_required_revisions_checklist(db, actor_user_id=admin.id)
        db.commit()
        db.refresh(rev)
    except LegalDocumentError as exc:
        raise _http(exc) from exc
    return _admin_out(rev)


@router.get("/checklist", response_model=list[LegalChecklistItemOut])
async def admin_get_checklist(
    db: Session = Depends(get_db),
    _: User = Depends(require_tariff_admin),
):
    sync_required_revisions_checklist(db)
    db.commit()
    return get_checklist_items(db)


@router.patch("/checklist/{item_key}", response_model=LegalChecklistItemOut)
async def admin_update_checklist(
    item_key: str,
    body: LegalChecklistItemUpdateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    try:
        row = set_checklist_item(
            db,
            item_key=item_key,
            is_completed=body.is_completed,
            actor_user_id=admin.id,
            note=body.note,
            commit=True,
        )
    except LegalLaunchError as exc:
        raise _http(exc) from exc
    return row


@router.get("/launch-status", response_model=LegalLaunchStatusOut)
async def admin_launch_status(
    db: Session = Depends(get_db),
    _: User = Depends(require_tariff_admin),
):
    st = compute_legal_launch_status(db)
    db.commit()
    return LegalLaunchStatusOut(
        legal_launch_ready=st.legal_launch_ready,
        environment=st.environment,
        payments_blocked=st.payments_blocked,
        checklist_complete=st.checklist_complete,
        required_docs_published=st.required_docs_published,
        missing_checklist_keys=st.missing_checklist_keys,
        missing_doc_types=st.missing_doc_types,
    )
