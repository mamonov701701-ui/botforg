"""Запросы субъекта персональных данных (152-ФЗ): экспорт и удаление/анонимизация."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from fastapi.responses import JSONResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.user import User, UserSettings
from backend.models.legal import Consent
from backend.models.message import Message
from backend.models.bot import Bot
from backend.models.event import Event
from backend.models.auth import AccountDeletionRequest, UserTotp
from backend.auth.rate_limit import check_account_rate_limit
from backend.security import verify_password
from backend.services.account_security import audit, consume_backup_code, utcnow, verify_totp
from backend.services.legal_consent import record_consent
from backend.services.legal_documents import get_published_by_type
from backend.models.legal import LegalDocType
from backend.routers.platform_admin import require_owner
from pydantic import Field

router = APIRouter(prefix="/privacy", tags=["privacy"])


class OptionalConsentIn(BaseModel):
    accepted: bool


@router.get("/optional-consents")
async def optional_consents(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    row = db.query(Consent).filter(
        Consent.user_id == current_user.id,
        Consent.doc_type == LegalDocType.ADVERTISING_CONSENT.value,
    ).order_by(Consent.id.desc()).first()
    return {"advertising_consent": bool(row and row.confirmation_result == "accepted")}


@router.post("/optional-consents/advertising")
async def set_advertising_consent(
    body: OptionalConsentIn, current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    latest = db.query(Consent).filter(
        Consent.user_id == current_user.id,
        Consent.doc_type == LegalDocType.ADVERTISING_CONSENT.value,
    ).order_by(Consent.id.desc()).first()
    if body.accepted:
        published = get_published_by_type(db, LegalDocType.ADVERTISING_CONSENT.value)
        if published is None:
            raise HTTPException(503, "Документ согласия временно недоступен")
        revision_id = published.id
    else:
        if latest is None or latest.confirmation_result == "withdrawn":
            return {"advertising_consent": False}
        revision_id = latest.revision_id
        if revision_id is None:
            raise HTTPException(409, "Для отзыва старого согласия обратитесь в поддержку")
    record_consent(
        db, user_id=current_user.id, doc_type=LegalDocType.ADVERTISING_CONSENT.value,
        source="settings", revision_id=revision_id,
        confirmation_result="accepted" if body.accepted else "withdrawn",
    )
    return {"advertising_consent": body.accepted}


def _iso(dt):
    return dt.isoformat() if dt else None


def _event_aggregate(e):
    """Только агрегатные поля события (без payload, user_id, ip, user_agent, session_id)."""
    return {
        "id": e.id,
        "event_type": e.event_type,
        "event_name": e.event_name,
        "bot_id": e.bot_id,
        "channel": e.channel,
        "chat_hash": e.chat_hash,
        "node_id": e.node_id,
        "created_at": _iso(e.created_at),
    }


@router.post("/export")
async def privacy_export(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Выгрузка данных пользователя (JSON) для субъекта ПДн.
    При minimal storage: сообщения с пустым content не возвращаются; события — только агрегатные поля.
    """
    uid = current_user.id
    owner_bot_ids = [b.id for b in db.query(Bot).filter(Bot.owner_id == uid).all()]

    # Профиль
    profile = {
        "id": uid,
        "public_id": current_user.public_id,
        "email": current_user.email,
        "name": current_user.name,
        "avatar": current_user.avatar,
        "date_of_birth": _iso(current_user.date_of_birth),
        "phone": current_user.phone,
        "phone_verified": bool(current_user.phone_verified_at),
        "role": getattr(current_user, "role", None),
        "created_at": _iso(current_user.created_at),
    }
    # Согласия
    consents = db.query(Consent).filter(Consent.user_id == uid).all()
    consent_list = [
        {"doc_type": c.doc_type, "doc_version": c.doc_version, "accepted_at": _iso(c.accepted_at)}
        for c in consents
    ]
    # Боты (метаданные)
    bots = db.query(Bot).filter(Bot.owner_id == uid).all()
    bots_list = [
        {"id": b.id, "title": b.title, "username": b.username, "created_at": _iso(b.created_at)}
        for b in bots
    ]
    # Сообщения: только где user_id=current_user и content не пустой (minimal storage не хранит контент)
    messages = (
        db.query(Message)
        .filter(Message.user_id == uid, Message.content != "")
        .order_by(Message.created_at.desc())
        .all()
    )
    messages_list = [
        {"id": m.id, "bot_id": m.bot_id, "direction": m.direction, "content": m.content, "created_at": _iso(m.created_at)}
        for m in messages
    ]
    messages_stored = len(messages_list) > 0
    # События: с user_id=uid ИЛИ по ботам владельца (только агрегатные поля)
    events_q = (
        db.query(Event)
        .filter(or_(Event.user_id == uid, Event.bot_id.in_(owner_bot_ids)))
        .order_by(Event.created_at.desc())
        .limit(1000)
    )
    events_rows = events_q.all()
    events_list = [_event_aggregate(e) for e in events_rows]
    # Настройки (без секретов)
    settings_row = db.query(UserSettings).filter(UserSettings.user_id == uid).first()
    settings_export = None
    if settings_row:
        settings_export = {
            "language": settings_row.language,
            "timezone": settings_row.timezone,
            "two_factor_enabled": bool((totp_row := db.get(UserTotp, uid)) and totp_row.enabled_at),
            "interface_settings": settings_row.interface_settings,
            "notification_settings": settings_row.notification_settings,
            "agent_settings": settings_row.agent_settings,
        }
    payload = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "minimal_storage_default": True,
        "note": "message content is not stored by default unless enabled per bot (store_messages).",
        "profile": profile,
        "consents": consent_list,
        "bots": bots_list,
        "messages_stored": messages_stored,
        "messages_count": len(messages_list),
        "messages": messages_list,
        "events_sample_count": len(events_list),
        "events": events_list,
        "settings": settings_export,
    }
    return JSONResponse(content=payload)


class DeletionRequestIn(BaseModel):
    current_password: str
    two_factor_code: str | None = None


@router.get("/deletion-request")
async def deletion_request_status(
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    row = db.query(AccountDeletionRequest).filter(
        AccountDeletionRequest.user_id == current_user.id
    ).order_by(AccountDeletionRequest.requested_at.desc()).first()
    return {"status": row.status if row else "none", "requested_at": _iso(row.requested_at) if row else None}


@router.post("/delete")
async def privacy_delete(
    body: DeletionRequestIn, request: Request,
    current_user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Submit a protected request. Actual erasure awaits approved retention policy."""
    check_account_rate_limit(request, "delete_request", subject=str(current_user.id))
    if not current_user.hashed_password or not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(401, "Неверный пароль")
    totp = db.get(UserTotp, current_user.id)
    if totp and totp.enabled_at and not (
        body.two_factor_code and (
            verify_totp(db, current_user.id, body.two_factor_code)
            or consume_backup_code(db, current_user.id, body.two_factor_code)
        )
    ):
        db.rollback()
        raise HTTPException(401, "Требуется код двухфакторной защиты")
    existing = db.query(AccountDeletionRequest).filter(
        AccountDeletionRequest.user_id == current_user.id,
        AccountDeletionRequest.status.in_(("pending_review", "in_review", "awaiting_legal_policy", "needs_information")),
    ).first()
    if existing:
        return {"status": existing.status, "requested_at": _iso(existing.requested_at)}
    row = AccountDeletionRequest(user_id=current_user.id, status="pending_review", requested_at=utcnow())
    db.add(row)
    audit(db, current_user.id, "deletion_requested")
    db.commit()
    return {"status": row.status, "requested_at": _iso(row.requested_at)}


class DeletionReviewIn(BaseModel):
    status: str = Field(pattern="^(in_review|awaiting_legal_policy|needs_information)$")


@router.get("/admin/deletion-requests")
async def list_deletion_requests(
    db: Session = Depends(get_db), admin: User = Depends(require_owner),
):
    """Owner-only intake queue; no personal data beyond the contact address."""
    rows = db.query(AccountDeletionRequest).order_by(
        AccountDeletionRequest.requested_at.desc(), AccountDeletionRequest.id.desc()
    ).limit(100).all()
    return [{
        "id": row.id, "user_id": row.user_id, "status": row.status,
        "requested_at": _iso(row.requested_at),
        "email": db.get(User, row.user_id).email if db.get(User, row.user_id) else None,
    } for row in rows]


@router.post("/admin/deletion-requests/{request_id}/review")
async def review_deletion_request(
    request_id: int, body: DeletionReviewIn, db: Session = Depends(get_db),
    admin: User = Depends(require_owner),
):
    """Record an operational review state; never erase data through this route."""
    row = db.get(AccountDeletionRequest, request_id)
    if row is None:
        raise HTTPException(404, "Запрос не найден")
    if row.status == body.status:
        return {"id": row.id, "status": row.status}
    if row.status not in {"pending_review", "in_review", "awaiting_legal_policy", "needs_information"}:
        raise HTTPException(409, "Запрос нельзя изменить в текущем статусе")
    row.status = body.status
    audit(db, admin.id, f"deletion_review_{row.id}_{body.status}")
    audit(db, row.user_id, f"deletion_status_{row.id}_{body.status}")
    db.commit()
    return {"id": row.id, "status": row.status}
