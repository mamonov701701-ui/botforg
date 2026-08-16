"""Admin journal of AddonPackage audit events (Этап 7.2)."""
from __future__ import annotations

from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models.tariff import AdminAuditLog
from backend.models.user import User
from backend.services.addon_package_types import ADDON_TYPE_LABELS_RU
from backend.services.tariff_admin_addons import (
    ACTION_ADDON_ARCHIVED,
    ACTION_ADDON_CREATED,
    ACTION_ADDON_DELETED,
    ACTION_ADDON_HIDDEN,
    ACTION_ADDON_PUBLISHED,
    ACTION_ADDON_REACTIVATED,
    ACTION_ADDON_UPDATED,
    ENTITY_ADDON_PACKAGE,
)
from backend.services.tariff_admin_pricing_grids import (
    ACTION_GRID_ARCHIVED,
    ACTION_GRID_DRAFT_CREATED,
    ACTION_GRID_DRAFT_DELETED,
    ACTION_GRID_PUBLISHED,
    ACTION_TIER_CREATED,
    ACTION_TIER_DELETED,
    ACTION_TIER_UPDATED,
    ENTITY_GRID_VERSION,
    ENTITY_PRICING_TIER,
)

ADDON_PACKAGE_AUDIT_ACTIONS: tuple[str, ...] = (
    ACTION_ADDON_CREATED,
    ACTION_ADDON_UPDATED,
    ACTION_ADDON_PUBLISHED,
    ACTION_ADDON_HIDDEN,
    ACTION_ADDON_ARCHIVED,
    ACTION_ADDON_REACTIVATED,
    ACTION_ADDON_DELETED,
)

PRICING_GRID_AUDIT_ACTIONS: tuple[str, ...] = (
    ACTION_GRID_DRAFT_CREATED,
    ACTION_GRID_PUBLISHED,
    ACTION_GRID_DRAFT_DELETED,
    ACTION_GRID_ARCHIVED,
    ACTION_TIER_CREATED,
    ACTION_TIER_UPDATED,
    ACTION_TIER_DELETED,
)

PACKAGES_TAB_AUDIT_ACTIONS: tuple[str, ...] = (
    *ADDON_PACKAGE_AUDIT_ACTIONS,
    *PRICING_GRID_AUDIT_ACTIONS,
)

ACTION_LABELS_RU: dict[str, str] = {
    ACTION_ADDON_CREATED: "Создание",
    ACTION_ADDON_UPDATED: "Изменение",
    ACTION_ADDON_PUBLISHED: "Публикация",
    ACTION_ADDON_HIDDEN: "Скрытие",
    ACTION_ADDON_ARCHIVED: "Архивирование",
    ACTION_ADDON_REACTIVATED: "Восстановление",
    ACTION_ADDON_DELETED: "Удаление",
    ACTION_GRID_DRAFT_CREATED: "Черновик сетки",
    ACTION_GRID_PUBLISHED: "Публикация сетки",
    ACTION_GRID_DRAFT_DELETED: "Удаление черновика сетки",
    ACTION_GRID_ARCHIVED: "Архив сетки",
    ACTION_TIER_CREATED: "Ступень добавлена",
    ACTION_TIER_UPDATED: "Ступень изменена",
    ACTION_TIER_DELETED: "Ступень удалена",
}

_FIELD_LABELS_RU: dict[str, str] = {
    "code": "Код",
    "name_ru": "Название",
    "description_ru": "Описание",
    "type": "Тип ресурса",
    "amount": "Количество",
    "price": "Цена",
    "currency": "Валюта",
    "duration_type": "Тип срока",
    "validity_days": "Срок действия, дней",
    "available_from_plan": "Доступен с тарифов",
    "max_per_period": "Лимит покупок за период",
    "is_public": "Публичность",
    "is_active": "Состояние",
    "sort_order": "Порядок сортировки",
}

_DURATION_LABELS_RU: dict[str, str] = {
    "current_period": "До конца текущего периода",
    "current_billing_period": "До конца текущего расчётного периода",
}


def action_label_ru(action: str) -> str:
    return ACTION_LABELS_RU.get(action, action)


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _format_bool_public(value: Any) -> str:
    if value is True:
        return "Публичный"
    if value is False:
        return "Скрыт"
    return "—"


def _format_bool_active(value: Any) -> str:
    if value is True:
        return "Активен"
    if value is False:
        return "Архивирован"
    return "—"


def _format_price(value: Any, currency: Any = None) -> str:
    if value is None or value == "":
        return "—"
    cur = str(currency or "RUB").upper()
    suffix = "₽" if cur == "RUB" else cur
    return f"{value} {suffix}"


def _format_available(value: Any) -> str:
    if value is None or value == "" or value == []:
        return "Все тарифы"
    if isinstance(value, list):
        return ", ".join(str(x) for x in value) or "Все тарифы"
    return str(value)


def _format_scalar(field: str, value: Any, *, sibling: dict[str, Any] | None = None) -> str:
    if field == "is_public":
        return _format_bool_public(value)
    if field == "is_active":
        return _format_bool_active(value)
    if field == "price":
        return _format_price(value, (sibling or {}).get("currency"))
    if field == "type":
        key = str(value or "")
        return ADDON_TYPE_LABELS_RU.get(key, key or "—")
    if field == "duration_type":
        key = str(value or "")
        return _DURATION_LABELS_RU.get(key, key or "—")
    if field == "available_from_plan":
        return _format_available(value)
    if field == "max_per_period" and (value is None or value == ""):
        return "Без ограничения"
    if value is None or value == "":
        return "—"
    return str(value)


def build_addon_audit_changes(
    action: str,
    old_value: dict[str, Any] | None,
    new_value: dict[str, Any] | None,
) -> list[dict[str, str]]:
    old = _as_dict(old_value)
    new = _as_dict(new_value)
    new_clean = {k: v for k, v in new.items() if k != "changed_fields"}
    snapshot_fields = (
        "code",
        "name_ru",
        "description_ru",
        "type",
        "amount",
        "price",
        "currency",
        "duration_type",
        "validity_days",
        "available_from_plan",
        "max_per_period",
        "is_public",
        "is_active",
        "sort_order",
    )

    if action == ACTION_ADDON_CREATED:
        lines: list[dict[str, str]] = []
        for field in snapshot_fields:
            if field not in new_clean:
                continue
            lines.append(
                {
                    "field": field,
                    "label": _FIELD_LABELS_RU.get(field, field),
                    "before": "—",
                    "after": _format_scalar(field, new_clean.get(field), sibling=new_clean),
                }
            )
        return lines

    if action == ACTION_ADDON_DELETED:
        lines = []
        for field in snapshot_fields:
            if field not in old:
                continue
            lines.append(
                {
                    "field": field,
                    "label": _FIELD_LABELS_RU.get(field, field),
                    "before": _format_scalar(field, old.get(field), sibling=old),
                    "after": "—",
                }
            )
        return lines

    changed = new.get("changed_fields")
    if isinstance(changed, list) and changed:
        fields = [str(f) for f in changed]
    else:
        fields = [f for f in snapshot_fields if f in old or f in new_clean]

    lines = []
    for field in fields:
        if field == "changed_fields":
            continue
        before = old.get(field) if field in old else None
        after = new_clean.get(field) if field in new_clean else None
        if field in old and field in new_clean and before == after:
            continue
        lines.append(
            {
                "field": field,
                "label": _FIELD_LABELS_RU.get(field, field),
                "before": _format_scalar(field, before, sibling=old),
                "after": _format_scalar(field, after, sibling=new_clean),
            }
        )
    return lines


def _addon_identity(
    old_value: dict[str, Any] | None,
    new_value: dict[str, Any] | None,
) -> tuple[str | None, str | None]:
    old = _as_dict(old_value)
    new = _as_dict(new_value)
    for src in (new, old):
        code = src.get("code")
        if isinstance(code, str) and code.strip():
            name = src.get("name_ru") or code
            return code, str(name) if name is not None else code
    return None, None


def _grid_identity(
    old_value: dict[str, Any] | None,
    new_value: dict[str, Any] | None,
) -> tuple[str | None, str | None]:
    old = _as_dict(old_value)
    new = _as_dict(new_value)
    # publish stores {"draft": ..., "previous_active": ...}
    for src in (new, old, _as_dict(new.get("draft")), _as_dict(old.get("draft"))):
        resource = src.get("resource_type")
        version = src.get("version_number")
        currency = src.get("currency")
        if resource:
            label = f"Сетка {resource}"
            if version is not None:
                label += f" v{version}"
            if currency:
                label += f" / {currency}"
            return str(resource), label
        if src.get("range_start") is not None:
            start = src.get("range_start")
            end = src.get("range_end")
            end_label = "∞" if end is None else end
            return "tier", f"Ступень {start}–{end_label}"
    return None, None


def present_addon_audit_row(
    row: AdminAuditLog,
    *,
    admin_email: str | None,
) -> dict[str, Any]:
    old_v = row.old_value if isinstance(row.old_value, dict) else None
    new_v = row.new_value if isinstance(row.new_value, dict) else None
    entity = str(row.entity_type or "")
    if entity in (ENTITY_GRID_VERSION, ENTITY_PRICING_TIER) or (
        str(row.action or "") in PRICING_GRID_AUDIT_ACTIONS
    ):
        code, name = _grid_identity(old_v, new_v)
        changes: list[dict[str, str]] = []
        if row.comment:
            changes.append(
                {
                    "field": "comment",
                    "label": "Комментарий",
                    "before": "—",
                    "after": str(row.comment),
                }
            )
        return {
            "id": int(row.id),
            "created_at": row.created_at,
            "action": row.action,
            "action_label": action_label_ru(row.action),
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
            "admin_user_id": int(row.admin_user_id),
            "admin_email": admin_email,
            "addon_code": code,
            "addon_name": name,
            "comment": row.comment,
            "changed_fields": None,
            "changes": changes,
        }

    addon_code, addon_name = _addon_identity(old_v, new_v)
    changed = None
    if isinstance(new_v, dict) and isinstance(new_v.get("changed_fields"), list):
        changed = [str(x) for x in new_v["changed_fields"]]

    return {
        "id": int(row.id),
        "created_at": row.created_at,
        "action": row.action,
        "action_label": action_label_ru(row.action),
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "admin_user_id": int(row.admin_user_id),
        "admin_email": admin_email,
        "addon_code": addon_code,
        "addon_name": addon_name,
        "comment": row.comment,
        "changed_fields": changed,
        "changes": build_addon_audit_changes(row.action, old_v, new_v),
    }


def list_addon_audit_events(
    db: Session,
    *,
    action: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    from sqlalchemy import and_, or_

    limit = max(1, min(int(limit or 20), 100))
    offset = max(0, int(offset or 0))

    q = db.query(AdminAuditLog).filter(
        or_(
            and_(
                AdminAuditLog.entity_type == ENTITY_ADDON_PACKAGE,
                AdminAuditLog.action.in_(ADDON_PACKAGE_AUDIT_ACTIONS),
            ),
            and_(
                AdminAuditLog.entity_type.in_(
                    [ENTITY_GRID_VERSION, ENTITY_PRICING_TIER]
                ),
                AdminAuditLog.action.in_(PRICING_GRID_AUDIT_ACTIONS),
            ),
        )
    )
    if action:
        action = action.strip()
        if action not in PACKAGES_TAB_AUDIT_ACTIONS:
            return {"items": [], "total": 0, "limit": limit, "offset": offset}
        q = q.filter(AdminAuditLog.action == action)

    total = q.with_entities(func.count(AdminAuditLog.id)).scalar() or 0
    rows = (
        q.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    admin_ids = {int(r.admin_user_id) for r in rows}
    emails: dict[int, str | None] = {}
    if admin_ids:
        for uid, email in (
            db.query(User.id, User.email).filter(User.id.in_(admin_ids)).all()
        ):
            emails[int(uid)] = email

    items = [
        present_addon_audit_row(r, admin_email=emails.get(int(r.admin_user_id)))
        for r in rows
    ]
    return {
        "items": items,
        "total": int(total),
        "limit": limit,
        "offset": offset,
    }
