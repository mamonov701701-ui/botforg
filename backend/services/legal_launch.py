"""
Чек-лист юридической готовности и gate production-платежей (6.14.9B-1A).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.models.legal import (
    REQUIRED_PUBLISHED_DOC_TYPES,
    LegalChecklistItemKey,
    LegalDocumentRevision,
    LegalLaunchChecklistItem,
    LegalRevisionStatus,
)
from backend.models.tariff import AdminAuditLog
from backend.services.legal_documents import LegalDocumentError
from backend.settings import settings


class LegalLaunchError(Exception):
    def __init__(self, message: str, *, code: str = "legal_launch_error") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@dataclass(frozen=True)
class LegalLaunchStatus:
    legal_launch_ready: bool
    environment: str
    payments_blocked: bool
    checklist_complete: bool
    required_docs_published: bool
    missing_checklist_keys: list[str]
    missing_doc_types: list[str]


def ensure_checklist_seeded(db: Session) -> None:
    """Idempotent seed — migration also seeds; safe for tests."""
    labels = {
        LegalChecklistItemKey.SELLER_DETAILS.value: "Реквизиты продавца",
        LegalChecklistItemKey.PAYMENT_PROVIDER.value: "Платёжный провайдер",
        LegalChecklistItemKey.FISCAL_CASH_REGISTER.value: "Касса",
        LegalChecklistItemKey.HOSTING_DATACENTER.value: "Хостинг и ЦОД",
        LegalChecklistItemKey.SUBPROCESSORS.value: "Субобработчики",
        LegalChecklistItemKey.RETENTION_PERIODS.value: "Сроки хранения",
        LegalChecklistItemKey.LAWYER_DOCUMENTS_APPROVED.value: (
            "Документы проверены юристом"
        ),
        LegalChecklistItemKey.REQUIRED_REVISIONS_PUBLISHED.value: (
            "Обязательные редакции опубликованы"
        ),
        LegalChecklistItemKey.OWNER_LAUNCH_CONFIRMATION.value: (
            "Ручное подтверждение владельца запуска"
        ),
    }
    now = _utcnow()
    for key, label in labels.items():
        row = (
            db.query(LegalLaunchChecklistItem)
            .filter(LegalLaunchChecklistItem.item_key == key)
            .first()
        )
        if row is None:
            db.add(
                LegalLaunchChecklistItem(
                    item_key=key,
                    label_ru=label,
                    is_completed=False,
                    updated_at=now,
                )
            )
    db.flush()


def required_docs_published(db: Session) -> tuple[bool, list[str]]:
    missing: list[str] = []
    for doc_type in sorted(REQUIRED_PUBLISHED_DOC_TYPES):
        row = (
            db.query(LegalDocumentRevision.id)
            .filter(
                LegalDocumentRevision.doc_type == doc_type,
                LegalDocumentRevision.status == LegalRevisionStatus.PUBLISHED.value,
            )
            .first()
        )
        if row is None:
            missing.append(doc_type)
    return (len(missing) == 0), missing


def get_checklist_items(db: Session) -> list[LegalLaunchChecklistItem]:
    ensure_checklist_seeded(db)
    return (
        db.query(LegalLaunchChecklistItem)
        .order_by(LegalLaunchChecklistItem.id.asc())
        .all()
    )


def set_checklist_item(
    db: Session,
    *,
    item_key: str,
    is_completed: bool,
    actor_user_id: int,
    note: str | None = None,
    commit: bool = True,
) -> LegalLaunchChecklistItem:
    ensure_checklist_seeded(db)
    keys = {e.value for e in LegalChecklistItemKey}
    if item_key not in keys:
        raise LegalLaunchError(f"Unknown checklist key {item_key!r}", code="unknown_item")

    # Backend-owned keys: cannot be blindly set from frontend for readiness.
    # required_revisions_published is derived; lawyer_documents_approved is manual
    # but still stored — owner confirmation is manual.
    row = (
        db.query(LegalLaunchChecklistItem)
        .filter(LegalLaunchChecklistItem.item_key == item_key)
        .one()
    )
    if item_key == LegalChecklistItemKey.REQUIRED_REVISIONS_PUBLISHED.value:
        # Always sync from published docs — ignore client claim.
        ok, _ = required_docs_published(db)
        is_completed = ok

    row.is_completed = bool(is_completed)
    row.completed_at = _utcnow() if row.is_completed else None
    row.completed_by_user_id = int(actor_user_id) if row.is_completed else None
    if note is not None:
        row.note = note
    row.updated_at = _utcnow()

    db.add(
        AdminAuditLog(
            admin_user_id=int(actor_user_id),
            action="legal_checklist_updated",
            entity_type="legal_launch_checklist_item",
            entity_id=row.id,
            new_value={
                "item_key": item_key,
                "is_completed": row.is_completed,
            },
            comment=None,
            created_at=_utcnow(),
        )
    )
    if commit:
        db.commit()
        db.refresh(row)
    else:
        db.flush()
    return row


def sync_required_revisions_checklist(db: Session, *, actor_user_id: int | None = None) -> None:
    ensure_checklist_seeded(db)
    ok, _ = required_docs_published(db)
    row = (
        db.query(LegalLaunchChecklistItem)
        .filter(
            LegalLaunchChecklistItem.item_key
            == LegalChecklistItemKey.REQUIRED_REVISIONS_PUBLISHED.value
        )
        .one()
    )
    row.is_completed = ok
    row.completed_at = _utcnow() if ok else None
    if actor_user_id is not None and ok:
        row.completed_by_user_id = int(actor_user_id)
    row.updated_at = _utcnow()
    db.flush()


def compute_legal_launch_status(db: Session) -> LegalLaunchStatus:
    """Backend-only readiness — never trust a client-supplied flag."""
    ensure_checklist_seeded(db)
    sync_required_revisions_checklist(db)
    items = get_checklist_items(db)
    missing_keys = [i.item_key for i in items if not i.is_completed]
    docs_ok, missing_docs = required_docs_published(db)
    checklist_complete = len(missing_keys) == 0
    ready = checklist_complete and docs_ok
    env = (settings.ENVIRONMENT or "development").strip().lower()
    # Block only real production. development / test / TESTING stay open.
    is_prod = env == "production"
    payments_blocked = is_prod and not ready
    return LegalLaunchStatus(
        legal_launch_ready=ready,
        environment=env,
        payments_blocked=payments_blocked,
        checklist_complete=checklist_complete,
        required_docs_published=docs_ok,
        missing_checklist_keys=missing_keys,
        missing_doc_types=missing_docs,
    )


def assert_production_payments_allowed(db: Session) -> None:
    status = compute_legal_launch_status(db)
    if status.payments_blocked:
        raise LegalLaunchError(
            "Legal launch checklist is not complete; production payments are blocked",
            code="legal_launch_not_ready",
        )
