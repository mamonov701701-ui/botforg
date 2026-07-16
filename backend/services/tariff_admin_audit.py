"""Запись AdminAuditLog для тарифной админки (Этап 6.4)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from backend.models.tariff import AdminAuditLog, GiftGrant


def gift_grant_snapshot(grant: GiftGrant) -> dict[str, Any]:
    gift_type = (
        grant.gift_type.value if hasattr(grant.gift_type, "value") else str(grant.gift_type)
    )
    status = grant.status.value if hasattr(grant.status, "value") else str(grant.status)
    return {
        "id": grant.id,
        "target_user_id": grant.target_user_id,
        "gift_type": gift_type,
        "plan_id": grant.plan_id,
        "addon_package_id": grant.addon_package_id,
        "amount": grant.amount,
        "starts_at": _iso(grant.starts_at),
        "ends_at": _iso(grant.ends_at),
        "status": status,
        "reason": grant.reason,
        "admin_comment": grant.admin_comment,
        "granted_by_user_id": grant.granted_by_user_id,
    }


def write_admin_audit_log(
    db: Session,
    *,
    admin_user_id: int,
    action: str,
    entity_type: str,
    entity_id: int | None,
    old_value: dict[str, Any] | None = None,
    new_value: dict[str, Any] | None = None,
    comment: str | None = None,
    commit: bool = False,
) -> AdminAuditLog:
    row = AdminAuditLog(
        admin_user_id=admin_user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=old_value,
        new_value=new_value,
        comment=comment,
    )
    db.add(row)
    if commit:
        db.commit()
        db.refresh(row)
    else:
        db.flush()
    return row


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.isoformat() + "Z"
    return value.isoformat()
