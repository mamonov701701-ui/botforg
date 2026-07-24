"""Admin journal of Plan audit events (Этап 7.1.5)."""
from __future__ import annotations

from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models.tariff import AdminAuditLog
from backend.models.user import User
from backend.services.tariff_admin_plans import (
    ACTION_TARIFF_PLAN_ARCHIVED,
    ACTION_TARIFF_PLAN_CREATED,
    ACTION_TARIFF_PLAN_DELETED,
    ACTION_TARIFF_PLAN_HIDDEN,
    ACTION_TARIFF_PLAN_PUBLISHED,
    ACTION_TARIFF_PLAN_REACTIVATED,
    ACTION_TARIFF_PLAN_UPDATED,
    ENTITY_PLAN,
    _CANONICAL_LIMIT_KEYS,
)

TARIFF_PLAN_AUDIT_ACTIONS: tuple[str, ...] = (
    ACTION_TARIFF_PLAN_CREATED,
    ACTION_TARIFF_PLAN_UPDATED,
    ACTION_TARIFF_PLAN_PUBLISHED,
    ACTION_TARIFF_PLAN_HIDDEN,
    ACTION_TARIFF_PLAN_ARCHIVED,
    ACTION_TARIFF_PLAN_REACTIVATED,
    ACTION_TARIFF_PLAN_DELETED,
)

ACTION_LABELS_RU: dict[str, str] = {
    ACTION_TARIFF_PLAN_CREATED: "Создание",
    ACTION_TARIFF_PLAN_UPDATED: "Изменение",
    ACTION_TARIFF_PLAN_PUBLISHED: "Публикация",
    ACTION_TARIFF_PLAN_HIDDEN: "Скрытие",
    ACTION_TARIFF_PLAN_ARCHIVED: "Архивирование",
    ACTION_TARIFF_PLAN_REACTIVATED: "Восстановление",
    ACTION_TARIFF_PLAN_DELETED: "Удаление",
}

_FIELD_LABELS_RU: dict[str, str] = {
    "name": "Название",
    "name_ru": "Русское название",
    "description_ru": "Описание",
    "price_month": "Цена",
    "currency": "Валюта",
    "is_recommended": "Рекомендуемый",
    "sort_order": "Порядок сортировки",
    "is_public": "Публичность",
    "is_active": "Состояние",
    "limits": "Лимиты",
    "code": "Код",
}

_LIMIT_LABELS_RU: dict[str, str] = {
    "monthly_messages": "Сообщений в месяц",
    "active_bots": "Активных ботов",
    "team_members": "Участников команды",
    "analytics_history_days": "История аналитики, дней",
    "addon_purchase": "Покупка доп. пакетов",
    "export_reports": "Экспорт отчётов",
    "priority_support": "Приоритетная поддержка",
    "marketplace_access": "Маркетплейс",
    "template_publish": "Публикация шаблонов",
    "scenario_publish": "Публикация сценариев",
}

# Never show as separate user-facing limit keys.
_LIMIT_ALIAS_SKIP = frozenset({"max_bots", "max_team_members"})


def action_label_ru(action: str) -> str:
    return ACTION_LABELS_RU.get(action, action)


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _format_bool(value: Any) -> str:
    if value is True:
        return "Да"
    if value is False:
        return "Нет"
    return "—"


def _format_price(value: Any, currency: Any = None) -> str:
    if value is None or value == "":
        return "По запросу"
    cur = str(currency or "RUB").upper()
    suffix = "₽" if cur == "RUB" else cur
    return f"{value} {suffix} / мес."


def _format_scalar(field: str, value: Any, *, sibling: dict[str, Any] | None = None) -> str:
    if field in ("is_public", "is_active", "is_recommended"):
        if field == "is_public":
            if value is True:
                return "Публичный"
            if value is False:
                return "Скрыт"
            return "—"
        if field == "is_active":
            if value is True:
                return "Активен"
            if value is False:
                return "Архивирован"
            return "—"
        return _format_bool(value)
    if field == "price_month":
        return _format_price(value, (sibling or {}).get("currency"))
    if isinstance(value, bool):
        return _format_bool(value)
    if value is None or value == "":
        return "—"
    return str(value)


def _format_limit_value(key: str, value: Any) -> str:
    if key in (
        "addon_purchase",
        "export_reports",
        "priority_support",
        "marketplace_access",
        "template_publish",
        "scenario_publish",
    ):
        return _format_bool(value)
    if value is None:
        return "∞"
    return str(value)


def _limit_diff_lines(
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
) -> list[dict[str, str]]:
    b = _as_dict(before)
    a = _as_dict(after)
    keys: list[str] = []
    for k in _CANONICAL_LIMIT_KEYS:
        keys.append(k)
    for k in list(b.keys()) + list(a.keys()):
        if (
            k not in keys
            and k not in _LIMIT_ALIAS_SKIP
            and k in _LIMIT_LABELS_RU
        ):
            keys.append(k)

    lines: list[dict[str, str]] = []
    for key in keys:
        if key in _LIMIT_ALIAS_SKIP:
            continue
        if key not in b and key not in a:
            continue
        bv = b.get(key) if key in b else None
        av = a.get(key) if key in a else None
        if key not in b:
            bv_disp = "—"
            av_disp = _format_limit_value(key, av)
        elif key not in a:
            bv_disp = _format_limit_value(key, bv)
            av_disp = "—"
        else:
            if bv == av:
                continue
            bv_disp = _format_limit_value(key, bv)
            av_disp = _format_limit_value(key, av)
        lines.append(
            {
                "field": key,
                "label": _LIMIT_LABELS_RU.get(key, key),
                "before": bv_disp,
                "after": av_disp,
            }
        )
    return lines


def build_plan_audit_changes(
    action: str,
    old_value: dict[str, Any] | None,
    new_value: dict[str, Any] | None,
) -> list[dict[str, str]]:
    """Human-readable change lines (no raw JSON, no alias duplicates)."""
    old = _as_dict(old_value)
    new = _as_dict(new_value)
    # Strip presentation-only key from new_value copies.
    new_clean = {k: v for k, v in new.items() if k != "changed_fields"}

    if action == ACTION_TARIFF_PLAN_CREATED:
        snapshot = new_clean
        lines: list[dict[str, str]] = []
        for field in (
            "code",
            "name",
            "name_ru",
            "description_ru",
            "price_month",
            "currency",
            "is_public",
            "is_recommended",
            "sort_order",
        ):
            if field not in snapshot:
                continue
            lines.append(
                {
                    "field": field,
                    "label": _FIELD_LABELS_RU.get(field, field),
                    "before": "—",
                    "after": _format_scalar(field, snapshot.get(field), sibling=snapshot),
                }
            )
        if "limits" in snapshot:
            for lim in _limit_diff_lines({}, _as_dict(snapshot.get("limits"))):
                lines.append(
                    {
                        "field": f"limits.{lim['field']}",
                        "label": lim["label"],
                        "before": "—",
                        "after": lim["after"],
                    }
                )
        return lines

    if action == ACTION_TARIFF_PLAN_DELETED:
        snapshot = old
        lines = []
        for field in (
            "code",
            "name",
            "name_ru",
            "description_ru",
            "price_month",
            "currency",
            "is_public",
            "is_active",
            "is_recommended",
            "sort_order",
        ):
            if field not in snapshot:
                continue
            lines.append(
                {
                    "field": field,
                    "label": _FIELD_LABELS_RU.get(field, field),
                    "before": _format_scalar(field, snapshot.get(field), sibling=snapshot),
                    "after": "—",
                }
            )
        if "limits" in snapshot:
            for lim in _limit_diff_lines(_as_dict(snapshot.get("limits")), {}):
                lines.append(
                    {
                        "field": f"limits.{lim['field']}",
                        "label": lim["label"],
                        "before": lim["before"],
                        "after": "—",
                    }
                )
        return lines

    changed = new.get("changed_fields")
    if isinstance(changed, list) and changed:
        fields = [str(f) for f in changed]
    else:
        fields = sorted(set(old.keys()) | set(new_clean.keys()))

    lines = []
    for field in fields:
        if field == "changed_fields":
            continue
        if field == "limits":
            for lim in _limit_diff_lines(old.get("limits"), new_clean.get("limits")):
                lines.append(
                    {
                        "field": f"limits.{lim['field']}",
                        "label": lim["label"],
                        "before": lim["before"],
                        "after": lim["after"],
                    }
                )
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


def _plan_identity(
    old_value: dict[str, Any] | None,
    new_value: dict[str, Any] | None,
) -> tuple[str | None, str | None]:
    """plan_code / display name; for deleted plans take from old_value snapshot."""
    old = _as_dict(old_value)
    new = _as_dict(new_value)
    for src in (new, old):
        code = src.get("code")
        if isinstance(code, str) and code.strip():
            name = src.get("name_ru") or src.get("name") or code
            return code, str(name) if name is not None else code
    return None, None


def present_plan_audit_row(
    row: AdminAuditLog,
    *,
    admin_email: str | None,
) -> dict[str, Any]:
    old_v = row.old_value if isinstance(row.old_value, dict) else None
    new_v = row.new_value if isinstance(row.new_value, dict) else None
    plan_code, plan_name = _plan_identity(old_v, new_v)
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
        "plan_code": plan_code,
        "plan_name": plan_name,
        "comment": row.comment,
        "changed_fields": changed,
        "changes": build_plan_audit_changes(row.action, old_v, new_v),
    }


def list_plan_audit_events(
    db: Session,
    *,
    action: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    limit = max(1, min(int(limit or 20), 100))
    offset = max(0, int(offset or 0))

    q = db.query(AdminAuditLog).filter(
        AdminAuditLog.entity_type == ENTITY_PLAN,
        AdminAuditLog.action.in_(TARIFF_PLAN_AUDIT_ACTIONS),
    )
    if action:
        action = action.strip()
        if action not in TARIFF_PLAN_AUDIT_ACTIONS:
            # Unknown action → empty page (not gifts / unrelated).
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
        present_plan_audit_row(r, admin_email=emails.get(int(r.admin_user_id)))
        for r in rows
    ]
    return {
        "items": items,
        "total": int(total),
        "limit": limit,
        "offset": offset,
    }
