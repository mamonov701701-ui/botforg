"""Admin read/update/create/lifecycle of Plan catalog (Этапы 7.1.1–7.1.3)."""
from __future__ import annotations

import re
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.checkout import CheckoutIntent, CheckoutProductType
from backend.models.plan import Plan
from backend.models.tariff import (
    GiftGrant,
    SubscriptionStatus,
    UserSubscription,
)
from backend.models.user import User
from backend.services.tariff_admin_audit import write_admin_audit_log
from backend.services.tariff_limits import _parse_plan_limits

ACTION_TARIFF_PLAN_UPDATED = "tariff_plan_updated"
ACTION_TARIFF_PLAN_CREATED = "tariff_plan_created"
ACTION_TARIFF_PLAN_PUBLISHED = "tariff_plan_published"
ACTION_TARIFF_PLAN_HIDDEN = "tariff_plan_hidden"
ACTION_TARIFF_PLAN_ARCHIVED = "tariff_plan_archived"
ACTION_TARIFF_PLAN_REACTIVATED = "tariff_plan_reactivated"
ACTION_TARIFF_PLAN_DELETED = "tariff_plan_deleted"
ENTITY_PLAN = "plan"

_PLAN_CODE_RE = re.compile(r"^[a-z0-9_]+$")
_PLAN_CODE_MAX = 32

_CANONICAL_LIMIT_KEYS = (
    "monthly_messages",
    "active_bots",
    "team_members",
    "analytics_history_days",
    "addon_purchase",
    "export_reports",
    "priority_support",
    "marketplace_access",
    "template_publish",
    "scenario_publish",
)

# Keep seed/migration compatibility keys in sync when canonical is written.
_LIMIT_ALIASES = {
    "active_bots": "max_bots",
    "team_members": "max_team_members",
}

_CREATE_LIMIT_DEFAULTS: dict[str, Any] = {
    "monthly_messages": 500,
    "active_bots": 1,
    "team_members": 0,
    "analytics_history_days": 7,
    "addon_purchase": False,
    "export_reports": False,
    "priority_support": False,
    "marketplace_access": True,
    "template_publish": True,
    "scenario_publish": True,
}


def _canonical_limits(plan: Plan) -> dict[str, Any]:
    parsed = _parse_plan_limits(plan)
    return {
        "monthly_messages": parsed["monthly_messages"],
        "active_bots": parsed["active_bots"],
        "team_members": parsed["team_members"],
        "analytics_history_days": parsed["analytics_history_days"],
        "addon_purchase": parsed["addon_purchase"],
        "export_reports": parsed["export_reports"],
        "priority_support": parsed["priority_support"],
        "marketplace_access": parsed["marketplace_access"],
        "template_publish": parsed["template_publish"],
        "scenario_publish": parsed["scenario_publish"],
    }


def _money_str(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return format(value, "f")
    return str(value)


def plan_snapshot(plan: Plan) -> dict[str, Any]:
    """JSON-safe before/after for AdminAuditLog."""
    return {
        "id": int(plan.id),
        "code": plan.code,
        "name": plan.name,
        "name_ru": plan.name_ru,
        "description_ru": plan.description_ru,
        "price_month": _money_str(plan.price_month),
        "currency": plan.currency or "RUB",
        "is_active": bool(plan.is_active) if plan.is_active is not None else True,
        "is_public": bool(plan.is_public) if plan.is_public is not None else True,
        "is_recommended": bool(plan.is_recommended)
        if plan.is_recommended is not None
        else False,
        "sort_order": int(plan.sort_order or 0),
        "limits": dict(plan.limits or {}),
    }


def merge_plan_limits(existing: dict[str, Any] | None, patch: dict[str, Any]) -> dict[str, Any]:
    """
    Update only provided canonical keys; keep unknown/legacy keys.
    Sync max_bots / max_team_members when active_bots / team_members change.
    """
    out = dict(existing or {})
    for key, value in patch.items():
        if key not in _CANONICAL_LIMIT_KEYS:
            continue
        out[key] = value
        alias = _LIMIT_ALIASES.get(key)
        if alias is not None:
            out[alias] = value
    return out


def build_create_limits(limits_in: dict[str, Any] | None) -> dict[str, Any]:
    """Full limits JSON for a new Plan: defaults + provided canonical + aliases."""
    base = dict(_CREATE_LIMIT_DEFAULTS)
    # Seed aliases matching defaults.
    base["max_bots"] = base["active_bots"]
    base["max_team_members"] = base["team_members"]
    if limits_in:
        return merge_plan_limits(base, limits_in)
    return base


def normalize_plan_code(raw: str) -> str:
    code = (raw or "").strip().lower()
    if not code or not _PLAN_CODE_RE.match(code) or len(code) > _PLAN_CODE_MAX:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_plan_code",
                "message": "Код тарифа: только a-z, 0-9 и _ (до 32 символов)",
            },
        )
    return code


def _batch_reference_stats(db: Session, plans: list[Plan]) -> dict[int, dict[str, Any]]:
    """plan_id → subscription/checkout/gift counts + has_references (no N+1)."""
    if not plans:
        return {}
    plan_ids = [int(p.id) for p in plans]
    codes = [str(p.code) for p in plans]
    code_by_id = {int(p.id): str(p.code) for p in plans}

    sub_counts: dict[int, int] = {
        int(pid): int(cnt)
        for pid, cnt in (
            db.query(UserSubscription.plan_id, func.count())
            .filter(
                UserSubscription.plan_id.in_(plan_ids),
                UserSubscription.status.in_(
                    [
                        SubscriptionStatus.ACTIVE.value,
                        SubscriptionStatus.TRIALING.value,
                    ]
                ),
            )
            .group_by(UserSubscription.plan_id)
            .all()
        )
    }
    gift_counts: dict[int, int] = {
        int(pid): int(cnt)
        for pid, cnt in (
            db.query(GiftGrant.plan_id, func.count())
            .filter(GiftGrant.plan_id.in_(plan_ids))
            .group_by(GiftGrant.plan_id)
            .all()
        )
    }
    checkout_by_code: dict[str, int] = {
        str(code): int(cnt)
        for code, cnt in (
            db.query(CheckoutIntent.product_code, func.count())
            .filter(
                CheckoutIntent.product_type == CheckoutProductType.TARIFF.value,
                CheckoutIntent.product_code.in_(codes),
            )
            .group_by(CheckoutIntent.product_code)
            .all()
        )
    }
    legacy_counts: dict[str, int] = {
        str(code): int(cnt)
        for code, cnt in (
            db.query(User.plan_code, func.count())
            .filter(User.plan_code.in_(codes))
            .group_by(User.plan_code)
            .all()
        )
        if code
    }
    # Any subscription row (incl. cancelled) still blocks physical delete.
    sub_all_counts: dict[int, int] = {
        int(pid): int(cnt)
        for pid, cnt in (
            db.query(UserSubscription.plan_id, func.count())
            .filter(UserSubscription.plan_id.in_(plan_ids))
            .group_by(UserSubscription.plan_id)
            .all()
        )
    }

    out: dict[int, dict[str, Any]] = {}
    for pid in plan_ids:
        code = code_by_id[pid]
        sub_n = int(sub_counts.get(pid, 0))
        sub_all = int(sub_all_counts.get(pid, 0))
        gift_n = int(gift_counts.get(pid, 0))
        chk_n = int(checkout_by_code.get(code, 0))
        legacy_n = int(legacy_counts.get(code, 0))
        has_refs = sub_all > 0 or gift_n > 0 or chk_n > 0 or legacy_n > 0
        out[pid] = {
            "subscription_count": sub_n,
            "gift_count": gift_n,
            "checkout_count": chk_n,
            "legacy_user_count": legacy_n,
            "subscription_ref_count": sub_all,
            "has_references": has_refs,
            "can_delete": not has_refs,
        }
    return out


def _plan_row_dict(plan: Plan, refs: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": int(plan.id),
        "code": plan.code,
        "name": plan.name,
        "name_ru": plan.name_ru,
        "description_ru": plan.description_ru,
        "price_month": plan.price_month,
        "currency": (plan.currency or "RUB"),
        "is_active": bool(plan.is_active) if plan.is_active is not None else True,
        "is_public": bool(plan.is_public) if plan.is_public is not None else True,
        "is_recommended": bool(plan.is_recommended)
        if plan.is_recommended is not None
        else False,
        "sort_order": int(plan.sort_order or 0),
        "limits": _canonical_limits(plan),
        "created_at": plan.created_at,
        "subscription_count": int(refs.get("subscription_count", 0)),
        "checkout_count": int(refs.get("checkout_count", 0)),
        "gift_count": int(refs.get("gift_count", 0)),
        "has_references": bool(refs.get("has_references", False)),
        "can_delete": bool(refs.get("can_delete", True)),
    }


def list_admin_plans(db: Session) -> list[dict[str, Any]]:
    """
    All Plan rows for admin catalog (no is_public/is_active filter).
    Sorted by sort_order ASC, code ASC.
    """
    plans = (
        db.query(Plan)
        .order_by(
            func.coalesce(Plan.sort_order, 0).asc(),
            Plan.code.asc(),
        )
        .all()
    )
    stats = _batch_reference_stats(db, plans)
    return [
        _plan_row_dict(plan, stats.get(int(plan.id), {}))
        for plan in plans
    ]


def get_admin_plan_row(db: Session, plan: Plan) -> dict[str, Any]:
    stats = _batch_reference_stats(db, [plan])
    return _plan_row_dict(plan, stats.get(int(plan.id), {}))


def _values_equal(a: Any, b: Any) -> bool:
    if isinstance(a, Decimal) or isinstance(b, Decimal):
        if a is None and b is None:
            return True
        if a is None or b is None:
            return False
        return Decimal(str(a)) == Decimal(str(b))
    return a == b


def update_admin_plan(
    db: Session,
    *,
    plan_id: int,
    patch: dict[str, Any],
    admin_user_id: int,
) -> tuple[dict[str, Any], bool]:
    """
    Apply partial Plan update. Returns (admin row dict, mutated).
    No-op (empty or identical values): no DB mutation, no audit.
    """
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Тариф не найден",
        )

    if "code" in patch or "is_active" in patch or "is_public" in patch:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "immutable_field",
                "message": "Поля code, is_active и is_public нельзя менять через этот endpoint",
            },
        )

    before = plan_snapshot(plan)
    changed: list[str] = []

    scalar_fields = (
        "name",
        "name_ru",
        "description_ru",
        "price_month",
        "currency",
        "is_recommended",
        "sort_order",
    )
    for field in scalar_fields:
        if field not in patch:
            continue
        new_val = patch[field]
        if field == "name" and isinstance(new_val, str):
            new_val = new_val.strip()
            if not new_val:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={"code": "invalid_name", "message": "Название не может быть пустым"},
                )
        if field == "currency":
            if not isinstance(new_val, str) or not new_val.strip():
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={
                        "code": "invalid_currency",
                        "message": "Валюта не может быть пустой",
                    },
                )
            new_val = new_val.strip().upper()
        if field == "name_ru" and isinstance(new_val, str):
            new_val = new_val.strip() or None
        if field == "description_ru" and isinstance(new_val, str):
            new_val = new_val.strip() or None
        old_val = getattr(plan, field)
        if not _values_equal(old_val, new_val):
            setattr(plan, field, new_val)
            changed.append(field)

    if "limits" in patch and patch["limits"] is not None:
        limits_patch = patch["limits"]
        if not isinstance(limits_patch, dict):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "invalid_limits", "message": "limits must be an object"},
            )
        merged = merge_plan_limits(
            dict(plan.limits or {}) if isinstance(plan.limits, dict) else {},
            limits_patch,
        )
        if merged != (plan.limits or {}):
            plan.limits = merged
            changed.append("limits")

    if not changed:
        return get_admin_plan_row(db, plan), False

    db.flush()
    after = plan_snapshot(plan)
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_TARIFF_PLAN_UPDATED,
        entity_type=ENTITY_PLAN,
        entity_id=int(plan.id),
        old_value=before,
        new_value={**after, "changed_fields": changed},
        comment=f"plan={plan.code} fields={','.join(changed)}",
        commit=False,
    )
    db.commit()
    db.refresh(plan)
    return get_admin_plan_row(db, plan), True


def create_admin_plan(
    db: Session,
    *,
    payload: dict[str, Any],
    admin_user_id: int,
) -> dict[str, Any]:
    code = normalize_plan_code(str(payload.get("code") or ""))
    existing = db.query(Plan).filter(Plan.code == code).first()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "plan_code_exists",
                "message": f"Тариф с кодом {code!r} уже существует",
            },
        )

    name = str(payload.get("name") or "").strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_name", "message": "Название обязательно"},
        )
    name_ru = payload.get("name_ru")
    if isinstance(name_ru, str):
        name_ru = name_ru.strip() or None
    if not name_ru:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_name_ru", "message": "Русское название обязательно"},
        )

    currency = str(payload.get("currency") or "RUB").strip().upper()
    if not currency:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_currency", "message": "Валюта не может быть пустой"},
        )

    description_ru = payload.get("description_ru")
    if isinstance(description_ru, str):
        description_ru = description_ru.strip() or None

    price_month = payload.get("price_month")
    if price_month is not None and Decimal(str(price_month)) < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "invalid_price", "message": "Цена должна быть ≥ 0"},
        )

    limits = build_create_limits(
        payload.get("limits") if isinstance(payload.get("limits"), dict) else None
    )

    plan = Plan(
        code=code,
        name=name,
        name_ru=name_ru,
        description_ru=description_ru,
        price_month=price_month,
        currency=currency,
        is_active=True,
        is_public=bool(payload.get("is_public", True)),
        is_recommended=bool(payload.get("is_recommended", False)),
        sort_order=int(payload.get("sort_order") or 0),
        limits=limits,
    )
    db.add(plan)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "plan_code_exists",
                "message": f"Тариф с кодом {code!r} уже существует",
            },
        ) from exc

    after = plan_snapshot(plan)
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_TARIFF_PLAN_CREATED,
        entity_type=ENTITY_PLAN,
        entity_id=int(plan.id),
        old_value=None,
        new_value=after,
        comment=f"plan={plan.code} created",
        commit=False,
    )
    db.commit()
    db.refresh(plan)
    return get_admin_plan_row(db, plan)


def set_admin_plan_visibility(
    db: Session,
    *,
    plan_id: int,
    is_public: bool,
    admin_user_id: int,
) -> tuple[dict[str, Any], bool]:
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тариф не найден")

    current = bool(plan.is_public) if plan.is_public is not None else True
    if current is bool(is_public):
        return get_admin_plan_row(db, plan), False

    before = plan_snapshot(plan)
    plan.is_public = bool(is_public)
    db.flush()
    after = plan_snapshot(plan)
    action = (
        ACTION_TARIFF_PLAN_PUBLISHED if is_public else ACTION_TARIFF_PLAN_HIDDEN
    )
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=action,
        entity_type=ENTITY_PLAN,
        entity_id=int(plan.id),
        old_value=before,
        new_value={**after, "changed_fields": ["is_public"]},
        comment=f"plan={plan.code} is_public={is_public}",
        commit=False,
    )
    db.commit()
    db.refresh(plan)
    return get_admin_plan_row(db, plan), True


def archive_admin_plan(
    db: Session,
    *,
    plan_id: int,
    admin_user_id: int,
) -> tuple[dict[str, Any], bool]:
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тариф не найден")

    current = bool(plan.is_active) if plan.is_active is not None else True
    if not current:
        return get_admin_plan_row(db, plan), False

    before = plan_snapshot(plan)
    plan.is_active = False
    db.flush()
    after = plan_snapshot(plan)
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_TARIFF_PLAN_ARCHIVED,
        entity_type=ENTITY_PLAN,
        entity_id=int(plan.id),
        old_value=before,
        new_value={**after, "changed_fields": ["is_active"]},
        comment=f"plan={plan.code} archived",
        commit=False,
    )
    db.commit()
    db.refresh(plan)
    return get_admin_plan_row(db, plan), True


def reactivate_admin_plan(
    db: Session,
    *,
    plan_id: int,
    admin_user_id: int,
) -> tuple[dict[str, Any], bool]:
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тариф не найден")

    current = bool(plan.is_active) if plan.is_active is not None else True
    if current:
        return get_admin_plan_row(db, plan), False

    before = plan_snapshot(plan)
    plan.is_active = True
    # Do not change is_public.
    db.flush()
    after = plan_snapshot(plan)
    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_TARIFF_PLAN_REACTIVATED,
        entity_type=ENTITY_PLAN,
        entity_id=int(plan.id),
        old_value=before,
        new_value={**after, "changed_fields": ["is_active"]},
        comment=f"plan={plan.code} reactivated",
        commit=False,
    )
    db.commit()
    db.refresh(plan)
    return get_admin_plan_row(db, plan), True


def count_plan_references(db: Session, plan: Plan) -> dict[str, int]:
    """Authoritative reference counts for delete gating (recomputed each call)."""
    pid = int(plan.id)
    code = str(plan.code)
    subscriptions = (
        db.query(func.count(UserSubscription.id))
        .filter(UserSubscription.plan_id == pid)
        .scalar()
        or 0
    )
    gifts = (
        db.query(func.count(GiftGrant.id)).filter(GiftGrant.plan_id == pid).scalar() or 0
    )
    checkouts = (
        db.query(func.count(CheckoutIntent.id))
        .filter(
            CheckoutIntent.product_type == CheckoutProductType.TARIFF.value,
            CheckoutIntent.product_code == code,
        )
        .scalar()
        or 0
    )
    legacy_users = (
        db.query(func.count(User.id)).filter(User.plan_code == code).scalar() or 0
    )
    return {
        "subscriptions": int(subscriptions),
        "gifts": int(gifts),
        "checkouts": int(checkouts),
        "legacy_users": int(legacy_users),
    }


def delete_admin_plan(
    db: Session,
    *,
    plan_id: int,
    admin_user_id: int,
) -> dict[str, Any]:
    """
    Physical Plan delete. Rechecks references immediately before delete.
    Raises 409 plan_in_use when any reference exists.
    """
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тариф не найден")

    refs = count_plan_references(db, plan)
    if any(v > 0 for v in refs.values()):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "plan_in_use",
                "message": (
                    "Тариф используется и не может быть удалён. "
                    "Скройте его из каталога или архивируйте."
                ),
                "references": refs,
            },
        )

    snapshot = plan_snapshot(plan)
    entity_id = int(plan.id)
    code = plan.code

    write_admin_audit_log(
        db,
        admin_user_id=admin_user_id,
        action=ACTION_TARIFF_PLAN_DELETED,
        entity_type=ENTITY_PLAN,
        entity_id=entity_id,
        old_value=snapshot,
        new_value=None,
        comment=f"plan={code} deleted",
        commit=False,
    )

    try:
        db.delete(plan)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # Race: a reference appeared between check and delete.
        plan2 = db.query(Plan).filter(Plan.id == plan_id).first()
        if plan2 is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Тариф не найден",
            ) from exc
        refs2 = count_plan_references(db, plan2)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "plan_in_use",
                "message": (
                    "Тариф используется и не может быть удалён. "
                    "Скройте его из каталога или архивируйте."
                ),
                "references": refs2,
            },
        ) from exc

    return snapshot
