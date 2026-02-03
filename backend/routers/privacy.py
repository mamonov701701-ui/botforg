"""Запросы субъекта персональных данных (152-ФЗ): экспорт и удаление/анонимизация."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
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

router = APIRouter(prefix="/privacy", tags=["privacy"])


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
            "two_factor_enabled": settings_row.two_factor_enabled,
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


@router.post("/delete")
async def privacy_delete(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Удаление/анонимизация аккаунта и связанных данных (где возможно).
    """
    uid = current_user.id
    # Анонимизируем пользователя вместо физического удаления (сохраняем FK)
    current_user.email = f"deleted_{uid}@anonymized.local"
    current_user.name = None
    current_user.avatar = None
    # Оставляем невалидный хеш (в БД может быть NOT NULL на hashed_password)
    _sentinel_hash = "deleted_anonymized"
    current_user.hashed_password = _sentinel_hash
    current_user.password_hash = _sentinel_hash
    current_user.token_version = getattr(current_user, "token_version", 0) + 1
    db.commit()
    # Удаляем согласия
    db.query(Consent).filter(Consent.user_id == uid).delete()
    # Обезличиваем привязку сообщений и событий к пользователю
    db.query(Message).filter(Message.user_id == uid).update({Message.user_id: None})
    db.query(Event).filter(Event.user_id == uid).update({Event.user_id: None})
    # Анонимизируем названия/описания ботов пользователя (владельца не меняем из-за FK)
    db.query(Bot).filter(Bot.owner_id == uid).update({
        Bot.title: "Bot (owner deleted)",
        Bot.description: None,
    })
    db.commit()
    return {"ok": True, "message": "Аккаунт анонимизирован. Согласия удалены, привязка сообщений и событий снята, боты обезличены."}
