"""
Публичный API юридических документов + совместимость legacy consent (6.14.9B-1A).

Черновики / ready_for_review / lawyer_approved / internal_notes — не отдаются.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.checkout import CheckoutIntent
from backend.models.legal import Consent, LegalConsentSource, LegalDocumentRevision
from backend.models.user import User
from backend.schemas.legal import (
    LegalAccountOverviewOut,
    LegalConsentAcceptIn,
    LegalConsentAcceptedOut,
    LegalPurchaseSnapshotDocOut,
    LegalPurchaseSnapshotOut,
    LegalRevisionListItemOut,
    LegalRevisionPublicOut,
)
from backend.services.legal_consent import record_consent
from backend.services.legal_documents import (
    LegalDocumentError,
    get_public_version,
    get_published_by_slug,
    list_all_archived_documents,
    list_public_archive,
    list_public_documents,
)

router = APIRouter(prefix="/legal", tags=["legal"])

DOCS_DIR = Path(__file__).resolve().parent.parent.parent / "docs" / "legal"
DOC_VERSIONS = {"privacy_policy": "1.0", "terms": "1.0", "consent_text": "1.0"}
DOC_FILES = {
    "privacy_policy": "privacy_policy_ru.md",
    "terms": "terms_ru.md",
    "consent_text": "consent_text_ru.md",
}


def _read_doc(doc_type: str) -> str:
    fname = DOC_FILES.get(doc_type)
    if not fname:
        return ""
    path = DOCS_DIR / fname
    if not path.exists():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


class DocOut(BaseModel):
    version: str
    text: str


class DocsResponse(BaseModel):
    privacy_policy: DocOut
    terms: DocOut
    consent_text: DocOut


def _public_out(rev) -> LegalRevisionPublicOut:
    return LegalRevisionPublicOut(
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
    )


def _list_item(rev) -> LegalRevisionListItemOut:
    return LegalRevisionListItemOut(
        id=rev.id,
        doc_type=rev.doc_type,
        slug=rev.slug,
        version=rev.version,
        status=rev.status,
        title=rev.title,
        content_sha256=rev.content_sha256 or "",
        published_at=rev.published_at,
        archived_at=rev.archived_at,
    )


# --- Legacy file-based docs (AuthModal / Features links) ---


@router.get("/doc/{doc_type}", response_class=PlainTextResponse)
async def get_legal_doc(doc_type: str):
    if doc_type not in DOC_FILES:
        raise HTTPException(status_code=404, detail="Unknown doc_type")
    text = _read_doc(doc_type)
    return PlainTextResponse(content=text, media_type="text/markdown; charset=utf-8")


@router.get("/docs", response_model=DocsResponse)
async def get_legal_docs():
    return DocsResponse(
        privacy_policy=DocOut(
            version=DOC_VERSIONS["privacy_policy"], text=_read_doc("privacy_policy")
        ),
        terms=DocOut(version=DOC_VERSIONS["terms"], text=_read_doc("terms")),
        consent_text=DocOut(
            version=DOC_VERSIONS["consent_text"], text=_read_doc("consent_text")
        ),
    )


class ConsentAccept(BaseModel):
    doc_type: str
    doc_version: str


@router.get("/consent/status")
async def consent_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Consent)
        .filter(Consent.user_id == current_user.id)
        .order_by(Consent.accepted_at.desc())
        .all()
    )
    seen = set()
    result = []
    for r in rows:
        if r.doc_type not in seen:
            seen.add(r.doc_type)
            result.append(
                {
                    "doc_type": r.doc_type,
                    "doc_version": r.doc_version,
                    "accepted_at": r.accepted_at.isoformat(),
                    "revision_id": r.revision_id,
                    "source": r.source,
                    "content_sha256": r.content_sha256,
                }
            )
    return {"accepted": result}


@router.post("/consent")
async def accept_consent(
    body: ConsentAccept,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Legacy accept (AuthModal): maps terms/privacy aliases; source=login.

    Без опубликованной CMS-редакции согласие не создаётся (нет фиктивной 1.0).
    """
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    try:
        row = record_consent(
            db,
            user_id=current_user.id,
            doc_type=body.doc_type,
            source=LegalConsentSource.LOGIN.value,
            ip=ip,
            user_agent=user_agent,
            doc_version=body.doc_version,
            commit=True,
        )
    except LegalDocumentError as exc:
        return {
            "ok": False,
            "detail": exc.message,
            "code": exc.code,
        }
    return {
        "ok": True,
        "doc_type": row.doc_type,
        "doc_version": row.doc_version,
        "revision_id": row.revision_id,
    }


@router.post("/consent/v2")
async def accept_consent_v2(
    body: LegalConsentAcceptIn,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Явное согласие с source и опциональным revision_id."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    try:
        row = record_consent(
            db,
            user_id=current_user.id,
            doc_type=body.doc_type,
            source=body.source,
            ip=ip,
            user_agent=ua,
            revision_id=body.revision_id,
            doc_version=body.doc_version,
            commit=True,
        )
    except LegalDocumentError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    return {
        "ok": True,
        "id": row.id,
        "doc_type": row.doc_type,
        "doc_version": row.doc_version,
        "revision_id": row.revision_id,
        "source": row.source,
        "content_sha256": row.content_sha256,
    }


# --- CMS public documents ---


@router.get("/documents", response_model=list[LegalRevisionListItemOut])
async def public_list_documents(db: Session = Depends(get_db)):
    return [_list_item(r) for r in list_public_documents(db)]


@router.get("/archive", response_model=list[LegalRevisionListItemOut])
async def public_list_all_archive(db: Session = Depends(get_db)):
    """Все archived-редакции (публичный архив)."""
    return [_list_item(r) for r in list_all_archived_documents(db)]


@router.get("/documents/{slug}", response_model=LegalRevisionPublicOut)
async def public_get_current(slug: str, db: Session = Depends(get_db)):
    try:
        rev = get_published_by_slug(db, slug)
    except LegalDocumentError as exc:
        raise HTTPException(
            status_code=404, detail={"code": exc.code, "message": exc.message}
        ) from exc
    if rev is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "No published document"},
        )
    return _public_out(rev)


@router.get(
    "/documents/{slug}/versions/{version}",
    response_model=LegalRevisionPublicOut,
)
async def public_get_version(
    slug: str, version: str, db: Session = Depends(get_db)
):
    try:
        rev = get_public_version(db, slug=slug, version=version)
    except LegalDocumentError as exc:
        raise HTTPException(
            status_code=404, detail={"code": exc.code, "message": exc.message}
        ) from exc
    if rev is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "not_found", "message": "Version not found"},
        )
    return _public_out(rev)


@router.get(
    "/documents/{slug}/archive",
    response_model=list[LegalRevisionListItemOut],
)
async def public_archive(slug: str, db: Session = Depends(get_db)):
    try:
        rows = list_public_archive(db, slug)
    except LegalDocumentError as exc:
        raise HTTPException(
            status_code=404, detail={"code": exc.code, "message": exc.message}
        ) from exc
    return [_list_item(r) for r in rows]


def _snapshot_doc(rev: LegalDocumentRevision | None) -> LegalPurchaseSnapshotDocOut | None:
    if rev is None:
        return None
    return LegalPurchaseSnapshotDocOut(
        revision_id=int(rev.id),
        doc_type=rev.doc_type,
        slug=rev.slug,
        version=rev.version,
        title=rev.title,
    )


@router.get("/account", response_model=LegalAccountOverviewOut)
async def legal_account_overview(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    ЛК: действующие и архивные документы, legal snapshot покупок.
    Consent history остаётся в БД /consent/status; в overview — для совместимости.
    Без IP, user-agent и внутренних служебных полей.
    """
    current_documents = [_list_item(r) for r in list_public_documents(db)]
    archived_documents = [_list_item(r) for r in list_all_archived_documents(db)]

    rows = (
        db.query(Consent)
        .filter(Consent.user_id == current_user.id)
        .order_by(Consent.accepted_at.desc())
        .all()
    )
    seen: set[str] = set()
    accepted: list[LegalConsentAcceptedOut] = []
    for r in rows:
        if r.doc_type in seen:
            continue
        seen.add(r.doc_type)
        accepted.append(
            LegalConsentAcceptedOut(
                doc_type=r.doc_type,
                doc_version=r.doc_version,
                accepted_at=r.accepted_at,
                revision_id=r.revision_id,
                source=r.source,
            )
        )

    intents = (
        db.query(CheckoutIntent)
        .filter(
            CheckoutIntent.user_id == current_user.id,
            CheckoutIntent.legal_snapshot_at.isnot(None),
        )
        .order_by(CheckoutIntent.legal_snapshot_at.desc())
        .limit(100)
        .all()
    )
    rev_ids: set[int] = set()
    for intent in intents:
        for rid in (
            intent.offer_revision_id,
            intent.refund_policy_revision_id,
            intent.tariff_terms_revision_id,
        ):
            if rid is not None:
                rev_ids.add(int(rid))
    rev_by_id: dict[int, LegalDocumentRevision] = {}
    if rev_ids:
        for rev in (
            db.query(LegalDocumentRevision)
            .filter(LegalDocumentRevision.id.in_(rev_ids))
            .all()
        ):
            rev_by_id[int(rev.id)] = rev

    purchase_snapshots: list[LegalPurchaseSnapshotOut] = []
    for intent in intents:
        offer = rev_by_id.get(int(intent.offer_revision_id)) if intent.offer_revision_id else None
        refund = (
            rev_by_id.get(int(intent.refund_policy_revision_id))
            if intent.refund_policy_revision_id
            else None
        )
        tariff = (
            rev_by_id.get(int(intent.tariff_terms_revision_id))
            if intent.tariff_terms_revision_id
            else None
        )
        purchase_snapshots.append(
            LegalPurchaseSnapshotOut(
                checkout_intent_id=int(intent.id),
                product_type=intent.product_type,
                product_code=intent.product_code,
                product_name=intent.product_name,
                amount=str(intent.amount),
                currency=intent.currency,
                status=intent.status,
                legal_snapshot_at=intent.legal_snapshot_at,
                refund_formula_version=intent.refund_formula_version,
                offer=_snapshot_doc(offer),
                refund_policy=_snapshot_doc(refund),
                tariff_terms=_snapshot_doc(tariff),
            )
        )

    return LegalAccountOverviewOut(
        current_documents=current_documents,
        archived_documents=archived_documents,
        accepted=accepted,
        purchase_snapshots=purchase_snapshots,
    )
