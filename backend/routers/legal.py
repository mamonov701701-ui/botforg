"""API юридических документов и согласий (152-ФЗ)."""
from pathlib import Path

from fastapi import APIRouter, Depends, Request, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.legal import Consent
from backend.models.user import User

router = APIRouter(prefix="/legal", tags=["legal"])

DOCS_DIR = Path(__file__).resolve().parent.parent.parent / "docs" / "legal"
DOC_VERSIONS = {"privacy_policy": "1.0", "terms": "1.0", "consent_text": "1.0"}
DOC_FILES = {"privacy_policy": "privacy_policy_ru.md", "terms": "terms_ru.md", "consent_text": "consent_text_ru.md"}


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


@router.get("/doc/{doc_type}", response_class=PlainTextResponse)
async def get_legal_doc(doc_type: str):
    """Отдать один документ как text/markdown (для ссылок в согласии)."""
    if doc_type not in DOC_FILES:
        raise HTTPException(status_code=404, detail="Unknown doc_type")
    text = _read_doc(doc_type)
    return PlainTextResponse(content=text, media_type="text/markdown; charset=utf-8")


@router.get("/docs", response_model=DocsResponse)
async def get_legal_docs():
    """Версии и тексты документов (Политика ПДн, Пользовательское соглашение, текст согласия)."""
    return DocsResponse(
        privacy_policy=DocOut(version=DOC_VERSIONS["privacy_policy"], text=_read_doc("privacy_policy")),
        terms=DocOut(version=DOC_VERSIONS["terms"], text=_read_doc("terms")),
        consent_text=DocOut(version=DOC_VERSIONS["consent_text"], text=_read_doc("consent_text")),
    )


class ConsentAccept(BaseModel):
    doc_type: str  # "privacy_policy" | "terms" | "consent_text"
    doc_version: str


@router.get("/consent/status")
async def consent_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Список принятых пользователем документов (для проверки при первом входе)."""
    rows = db.query(Consent).filter(Consent.user_id == current_user.id).order_by(Consent.accepted_at.desc()).all()
    # Уникальные по doc_type (последняя принятая версия)
    seen = set()
    result = []
    for r in rows:
        if r.doc_type not in seen:
            seen.add(r.doc_type)
            result.append({"doc_type": r.doc_type, "doc_version": r.doc_version, "accepted_at": r.accepted_at.isoformat()})
    return {"accepted": result}


@router.post("/consent")
async def accept_consent(
    body: ConsentAccept,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Зафиксировать принятие документа пользователем (IP и User-Agent сохраняются)."""
    if body.doc_type not in DOC_VERSIONS or body.doc_version != DOC_VERSIONS.get(body.doc_type):
        return {"ok": False, "detail": "Unknown doc_type or version"}
    ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    consent = Consent(
        user_id=current_user.id,
        doc_type=body.doc_type,
        doc_version=body.doc_version,
        ip=ip,
        user_agent=user_agent,
    )
    db.add(consent)
    db.commit()
    return {"ok": True, "doc_type": body.doc_type, "doc_version": body.doc_version}
