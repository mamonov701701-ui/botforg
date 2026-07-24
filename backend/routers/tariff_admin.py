"""
Admin API подарочных начислений тарифов (Этап 6.4).

Права: owner / admin / BF Администратор.
Бизнес-логика entitlement — только через tariff_entitlements.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.tariff_admin import require_tariff_admin
from backend.models.plan import Plan
from backend.models.tariff import GiftGrant, GiftGrantStatus, GiftType
from backend.models.user import User
from backend.schemas.tariff_admin import (
    AdminPlanAuditListOut,
    AdminPlanCreateIn,
    AdminPlanListOut,
    AdminPlanOut,
    AdminPlanLimitsOut,
    AdminPlanUpdateIn,
    AdminPlanVisibilityIn,
    AdminUserLookupOut,
    GiftGrantCreateIn,
    GiftGrantOut,
    GiftRevokeOut,
)
from backend.services.tariff_admin_audit import gift_grant_snapshot, write_admin_audit_log
from backend.services.tariff_admin_plan_audit import (
    TARIFF_PLAN_AUDIT_ACTIONS,
    list_plan_audit_events,
)
from backend.services.tariff_admin_plans import (
    archive_admin_plan,
    create_admin_plan,
    delete_admin_plan,
    list_admin_plans,
    reactivate_admin_plan,
    set_admin_plan_visibility,
    update_admin_plan,
)
from backend.services.tariff_entitlements import EntitlementError, grant_gift, revoke_gift

router = APIRouter(prefix="/api/admin/tariffs", tags=["Tariff Admin"])

ENTITY_GIFT_GRANT = "gift_grant"
ACTION_GIFT_GRANT = "gift_grant"
ACTION_GIFT_REVOKE = "gift_revoke"


def _gift_out(grant: GiftGrant) -> GiftGrantOut:
    gift_type = (
        grant.gift_type.value if hasattr(grant.gift_type, "value") else str(grant.gift_type)
    )
    status_val = (
        grant.status.value if hasattr(grant.status, "value") else str(grant.status)
    )
    return GiftGrantOut(
        id=grant.id,
        target_user_id=grant.target_user_id,
        gift_type=gift_type,
        plan_id=grant.plan_id,
        addon_package_id=grant.addon_package_id,
        amount=grant.amount,
        starts_at=grant.starts_at,
        ends_at=grant.ends_at,
        granted_by_user_id=grant.granted_by_user_id,
        reason=grant.reason,
        admin_comment=grant.admin_comment,
        status=status_val,
        created_at=grant.created_at,
        updated_at=grant.updated_at,
    )


def _entitlement_http(exc: EntitlementError) -> HTTPException:
    code = getattr(exc, "code", "entitlement_error")
    if code == "gift_not_found":
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    return HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail={"code": code, "message": exc.message},
    )


def _resolve_plan_id(db: Session, body: GiftGrantCreateIn) -> int | None:
    if body.gift_type != "plan":
        return body.plan_id
    if body.plan_id is not None:
        plan = db.query(Plan).filter(Plan.id == body.plan_id).first()
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "plan_not_found", "message": f"Plan id={body.plan_id} not found"},
            )
        return plan.id
    code = (body.plan_code or "").strip()
    plan = db.query(Plan).filter(Plan.code == code).first()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "plan_not_found", "message": f"Plan code={code!r} not found"},
        )
    return plan.id


@router.get("/users/lookup", response_model=AdminUserLookupOut)
async def lookup_user(
    user_id: int | None = Query(None, ge=1),
    email: str | None = Query(None, min_length=1),
    db: Session = Depends(get_db),
    _: User = Depends(require_tariff_admin),
):
    """Найти пользователя по ID или email (ровно один критерий обязателен)."""
    if user_id is None and not (email or "").strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Укажите user_id или email",
        )
    if user_id is not None:
        user = db.query(User).filter(User.id == user_id).first()
    else:
        needle = email.strip()
        user = (
            db.query(User)
            .filter(func.lower(User.email) == needle.lower())
            .first()
        )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    return AdminUserLookupOut(
        id=user.id,
        public_id=user.public_id,
        email=user.email,
        name=user.name,
        role=user.role,
        plan_code=user.plan_code,
    )


def _admin_plan_out(row: dict) -> AdminPlanOut:
    return AdminPlanOut(
        id=row["id"],
        code=row["code"],
        name=row["name"],
        name_ru=row["name_ru"],
        description_ru=row["description_ru"],
        price_month=row["price_month"],
        currency=row["currency"],
        is_active=row["is_active"],
        is_public=row["is_public"],
        is_recommended=row["is_recommended"],
        sort_order=row["sort_order"],
        limits=AdminPlanLimitsOut(**row["limits"]),
        created_at=row["created_at"],
        subscription_count=row.get("subscription_count", 0),
        checkout_count=row.get("checkout_count", 0),
        gift_count=row.get("gift_count", 0),
        has_references=row["has_references"],
        can_delete=row["can_delete"],
    )


@router.get("/plans", response_model=AdminPlanListOut)
async def list_plans_admin(
    db: Session = Depends(get_db),
    _: User = Depends(require_tariff_admin),
):
    """
    Все Plan для админки (включая hidden/inactive/legacy).
    Без фильтра is_public / is_active.
    """
    rows = list_admin_plans(db)
    items = [_admin_plan_out(row) for row in rows]
    return AdminPlanListOut(items=items, total=len(items))


@router.get("/plans/audit", response_model=AdminPlanAuditListOut)
async def list_plan_audit_admin(
    action: str | None = Query(
        None,
        description="Filter by tariff_plan_* action",
        max_length=64,
    ),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(require_tariff_admin),
):
    """
    Журнал изменений тарифов (7.1.5).
    Только entity_type=plan и tariff_plan_* (без gift audit).
    """
    if action is not None and action.strip() and action.strip() not in TARIFF_PLAN_AUDIT_ACTIONS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_audit_action",
                "message": "Неизвестное действие журнала тарифов",
            },
        )
    data = list_plan_audit_events(
        db,
        action=(action.strip() if action and action.strip() else None),
        limit=limit,
        offset=offset,
    )
    return AdminPlanAuditListOut.model_validate(data)


@router.post("/plans", response_model=AdminPlanOut, status_code=status.HTTP_201_CREATED)
async def create_plan_admin(
    body: AdminPlanCreateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    """Создание Plan (7.1.3). is_active всегда true при создании."""
    payload = body.model_dump(exclude_unset=True)
    if body.limits is not None:
        payload["limits"] = body.limits.model_dump(exclude_unset=True)
    row = create_admin_plan(db, payload=payload, admin_user_id=int(admin.id))
    return _admin_plan_out(row)


@router.patch("/plans/{plan_id}", response_model=AdminPlanOut)
async def patch_plan_admin(
    plan_id: int,
    body: AdminPlanUpdateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    """
    Частичное обновление Plan (7.1.2).
    Не меняет code / is_active / is_public.
    """
    patch = body.model_dump(exclude_unset=True)
    if "limits" in patch and patch["limits"] is not None:
        # Preserve nested exclude_unset semantics for partial limits.
        patch["limits"] = body.limits.model_dump(exclude_unset=True) if body.limits else {}
    row, _mutated = update_admin_plan(
        db,
        plan_id=plan_id,
        patch=patch,
        admin_user_id=int(admin.id),
    )
    return _admin_plan_out(row)


@router.post("/plans/{plan_id}/visibility", response_model=AdminPlanOut)
async def set_plan_visibility_admin(
    plan_id: int,
    body: AdminPlanVisibilityIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    """Публичность Plan: hide/publish (7.1.3). Не меняет is_active."""
    row, _ = set_admin_plan_visibility(
        db,
        plan_id=plan_id,
        is_public=body.is_public,
        admin_user_id=int(admin.id),
    )
    return _admin_plan_out(row)


@router.post("/plans/{plan_id}/archive", response_model=AdminPlanOut)
async def archive_plan_admin(
    plan_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    """Архивирование Plan: is_active=false. Подписки сохраняют limits."""
    row, _ = archive_admin_plan(
        db, plan_id=plan_id, admin_user_id=int(admin.id)
    )
    return _admin_plan_out(row)


@router.post("/plans/{plan_id}/reactivate", response_model=AdminPlanOut)
async def reactivate_plan_admin(
    plan_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    """Восстановление Plan: is_active=true. is_public не меняется."""
    row, _ = reactivate_admin_plan(
        db, plan_id=plan_id, admin_user_id=int(admin.id)
    )
    return _admin_plan_out(row)


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_plan_admin(
    plan_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    """
    Физическое удаление Plan (7.1.4).
    Только без references; иначе 409 plan_in_use.
    """
    delete_admin_plan(db, plan_id=plan_id, admin_user_id=int(admin.id))
    return None


@router.get("/users/{user_id}/gifts", response_model=list[GiftGrantOut])
async def list_user_gifts(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_tariff_admin),
):
    """Список подарочных начислений пользователя (все статусы)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    grants = (
        db.query(GiftGrant)
        .filter(GiftGrant.target_user_id == user_id)
        .order_by(GiftGrant.id.desc())
        .all()
    )
    return [_gift_out(g) for g in grants]


@router.post("/gifts", response_model=GiftGrantOut, status_code=status.HTTP_201_CREATED)
async def create_gift_grant(
    body: GiftGrantCreateIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    """Выдать GiftGrant. Без оплаты; пишет AdminAuditLog."""
    target = db.query(User).filter(User.id == body.target_user_id).first()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")

    plan_id = _resolve_plan_id(db, body)
    try:
        grant = grant_gift(
            db,
            target_user_id=body.target_user_id,
            gift_type=GiftType(body.gift_type),
            starts_at=body.starts_at,
            ends_at=body.ends_at,
            granted_by_user_id=admin.id,
            plan_id=plan_id,
            amount=body.amount,
            reason=body.reason,
            admin_comment=body.admin_comment,
            commit=False,
        )
    except EntitlementError as exc:
        db.rollback()
        raise _entitlement_http(exc) from exc

    write_admin_audit_log(
        db,
        admin_user_id=admin.id,
        action=ACTION_GIFT_GRANT,
        entity_type=ENTITY_GIFT_GRANT,
        entity_id=grant.id,
        old_value=None,
        new_value=gift_grant_snapshot(grant),
        comment=body.admin_comment or body.reason,
        commit=False,
    )
    db.commit()
    db.refresh(grant)
    return _gift_out(grant)


@router.post("/gifts/{gift_id}/revoke", response_model=GiftRevokeOut)
async def revoke_gift_grant(
    gift_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    """Отозвать GiftGrant. Повторный revoke безопасен (идемпотентен)."""
    existing = db.query(GiftGrant).filter(GiftGrant.id == gift_id).first()
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Подарок не найден")

    already = existing.status == GiftGrantStatus.CANCELLED
    old_value = gift_grant_snapshot(existing)
    try:
        grant = revoke_gift(db, gift_id=gift_id, commit=False)
    except EntitlementError as exc:
        db.rollback()
        raise _entitlement_http(exc) from exc

    if not already:
        write_admin_audit_log(
            db,
            admin_user_id=admin.id,
            action=ACTION_GIFT_REVOKE,
            entity_type=ENTITY_GIFT_GRANT,
            entity_id=grant.id,
            old_value=old_value,
            new_value=gift_grant_snapshot(grant),
            comment=grant.admin_comment or grant.reason,
            commit=False,
        )
    db.commit()
    db.refresh(grant)
    return GiftRevokeOut(gift=_gift_out(grant), already_cancelled=already)
