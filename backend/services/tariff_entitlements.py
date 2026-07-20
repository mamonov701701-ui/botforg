"""
Внутренний сервис entitlement тарифной системы (Этап 6.3).

Создаёт/завершает UserSubscription, UserAddon, GiftGrant.
Нет публичных purchase endpoints и нет имитации оплаты.
Цены от клиента не принимаются.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from backend.models.plan import Plan
from backend.models.tariff import (
    AddonPackage,
    GiftGrant,
    GiftGrantStatus,
    GiftType,
    SubscriptionStatus,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
    UserSubscription,
)


class EntitlementError(Exception):
    """Доменная ошибка entitlement (невалидный период, overlap, missing refs)."""

    def __init__(self, message: str, *, code: str = "entitlement_error") -> None:
        self.message = message
        self.code = code
        super().__init__(message)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_dt(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _validate_period(start: datetime, end: datetime) -> tuple[datetime, datetime]:
    start_n = _normalize_dt(start)
    end_n = _normalize_dt(end)
    if start_n >= end_n:
        raise EntitlementError(
            "period_start must be earlier than period_end",
            code="invalid_period",
        )
    return start_n, end_n


def _periods_overlap(
    a_start: datetime,
    a_end: datetime,
    b_start: datetime,
    b_end: datetime,
) -> bool:
    return a_start < b_end and b_start < a_end


def _enum_value(value: Any) -> str:
    return value.value if hasattr(value, "value") else str(value)


def activate_subscription(
    db: Session,
    *,
    user_id: int,
    plan_id: int,
    period_start: datetime,
    period_end: datetime,
    auto_renew: bool = True,
    payment_provider: str | None = None,
    provider_subscription_id: str | None = None,
    replace_active: bool = True,
    commit: bool = True,
) -> UserSubscription:
    """
    Создать ACTIVE UserSubscription на период.

    Idempotent: если передан provider_subscription_id и запись уже есть — вернуть её.
    При replace_active=True отменяет пересекающиеся ACTIVE подписки пользователя.
    При replace_active=False и overlap — EntitlementError.
    """
    period_start, period_end = _validate_period(period_start, period_end)
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise EntitlementError(f"Plan id={plan_id} not found", code="plan_not_found")

    if provider_subscription_id:
        existing = (
            db.query(UserSubscription)
            .filter(
                UserSubscription.user_id == user_id,
                UserSubscription.provider_subscription_id == provider_subscription_id,
            )
            .first()
        )
        if existing:
            return existing

    active = (
        db.query(UserSubscription)
        .filter(
            UserSubscription.user_id == user_id,
            UserSubscription.status == SubscriptionStatus.ACTIVE,
        )
        .all()
    )
    overlapping = [
        sub
        for sub in active
        if _periods_overlap(
            _normalize_dt(sub.current_period_start),
            _normalize_dt(sub.current_period_end),
            period_start,
            period_end,
        )
    ]
    if overlapping and not replace_active:
        raise EntitlementError(
            "Active subscription already overlaps the requested period",
            code="subscription_overlap",
        )
    now = _utcnow()
    for sub in overlapping:
        sub.status = SubscriptionStatus.CANCELLED
        sub.cancelled_at = now
        sub.updated_at = now

    sub = UserSubscription(
        user_id=user_id,
        plan_id=plan_id,
        status=SubscriptionStatus.ACTIVE,
        current_period_start=period_start,
        current_period_end=period_end,
        auto_renew=auto_renew,
        payment_provider=payment_provider,
        provider_subscription_id=provider_subscription_id,
    )
    db.add(sub)
    if commit:
        db.commit()
        db.refresh(sub)
    else:
        db.flush()
    return sub


def create_user_addon(
    db: Session,
    *,
    user_id: int,
    addon_package_id: int,
    period_start: datetime,
    period_end: datetime,
    source: UserAddonSource | str,
    amount: int | None = None,
    created_by_admin_id: int | None = None,
    provider_ref: str | None = None,
    commit: bool = True,
) -> UserAddon:
    """
    Создать UserAddon на период. amount по умолчанию из каталога AddonPackage.

    Idempotent: если передан provider_ref и запись уже есть — вернуть её.
    """
    period_start, period_end = _validate_period(period_start, period_end)
    pkg = db.query(AddonPackage).filter(AddonPackage.id == addon_package_id).first()
    if not pkg:
        raise EntitlementError(
            f"AddonPackage id={addon_package_id} not found",
            code="addon_not_found",
        )

    ref = (provider_ref or "").strip() or None
    if ref:
        existing = (
            db.query(UserAddon).filter(UserAddon.provider_ref == ref).first()
        )
        if existing:
            return existing

    source_val = source if isinstance(source, UserAddonSource) else UserAddonSource(source)
    addon = UserAddon(
        user_id=user_id,
        addon_package_id=addon_package_id,
        amount=int(amount if amount is not None else pkg.amount),
        period_start=period_start,
        period_end=period_end,
        status=UserAddonStatus.ACTIVE,
        source=source_val,
        provider_ref=ref,
        created_by_admin_id=created_by_admin_id,
    )
    db.add(addon)
    if commit:
        db.commit()
        db.refresh(addon)
    else:
        db.flush()
    return addon


def grant_gift(
    db: Session,
    *,
    target_user_id: int,
    gift_type: GiftType | str,
    starts_at: datetime,
    ends_at: datetime,
    granted_by_user_id: int,
    plan_id: int | None = None,
    addon_package_id: int | None = None,
    amount: int | None = None,
    reason: str | None = None,
    admin_comment: str | None = None,
    commit: bool = True,
) -> GiftGrant:
    """Выдать GiftGrant (ACTIVE). Не создаёт оплату."""
    starts_at, ends_at = _validate_period(starts_at, ends_at)
    gift_type_val = gift_type if isinstance(gift_type, GiftType) else GiftType(gift_type)

    if gift_type_val == GiftType.PLAN and plan_id is None:
        raise EntitlementError("PLAN gift requires plan_id", code="gift_plan_required")
    if gift_type_val == GiftType.ADDON and addon_package_id is None:
        raise EntitlementError(
            "ADDON gift requires addon_package_id",
            code="gift_addon_required",
        )
    if gift_type_val in (
        GiftType.MESSAGES,
        GiftType.ACTIVE_BOT,
        GiftType.TEAM_MEMBER,
    ) and amount is None:
        raise EntitlementError(
            f"{_enum_value(gift_type_val)} gift requires amount",
            code="gift_amount_required",
        )

    grant = GiftGrant(
        target_user_id=target_user_id,
        gift_type=gift_type_val,
        plan_id=plan_id,
        addon_package_id=addon_package_id,
        amount=amount,
        starts_at=starts_at,
        ends_at=ends_at,
        granted_by_user_id=granted_by_user_id,
        reason=reason,
        admin_comment=admin_comment,
        status=GiftGrantStatus.ACTIVE,
    )
    db.add(grant)
    if commit:
        db.commit()
        db.refresh(grant)
    else:
        db.flush()
    return grant


def revoke_gift(
    db: Session,
    *,
    gift_id: int,
    commit: bool = True,
) -> GiftGrant:
    """Отозвать подарок: status=CANCELLED. Повторный revoke идемпотентен."""
    grant = db.query(GiftGrant).filter(GiftGrant.id == gift_id).first()
    if not grant:
        raise EntitlementError(f"GiftGrant id={gift_id} not found", code="gift_not_found")
    if grant.status != GiftGrantStatus.CANCELLED:
        grant.status = GiftGrantStatus.CANCELLED
        grant.updated_at = _utcnow()
    if commit:
        db.commit()
        db.refresh(grant)
    else:
        db.flush()
    return grant


def expire_entitlements(
    db: Session,
    *,
    now: datetime | None = None,
    commit: bool = True,
) -> dict[str, int]:
    """
    Пометить истёкшие ACTIVE entitlements как EXPIRED по переданному now.

    Возвращает counts: subscriptions, addons, gifts.
    """
    at = _normalize_dt(now or _utcnow())
    sub_q = (
        db.query(UserSubscription)
        .filter(
            UserSubscription.status == SubscriptionStatus.ACTIVE,
            UserSubscription.current_period_end <= at,
        )
        .all()
    )
    for sub in sub_q:
        sub.status = SubscriptionStatus.EXPIRED
        sub.updated_at = at

    addon_q = (
        db.query(UserAddon)
        .filter(
            UserAddon.status == UserAddonStatus.ACTIVE,
            UserAddon.period_end <= at,
        )
        .all()
    )
    for addon in addon_q:
        addon.status = UserAddonStatus.EXPIRED
        addon.updated_at = at

    gift_q = (
        db.query(GiftGrant)
        .filter(
            GiftGrant.status == GiftGrantStatus.ACTIVE,
            GiftGrant.ends_at <= at,
        )
        .all()
    )
    for gift in gift_q:
        gift.status = GiftGrantStatus.EXPIRED
        gift.updated_at = at

    if commit:
        db.commit()
    else:
        db.flush()

    return {
        "subscriptions": len(sub_q),
        "addons": len(addon_q),
        "gifts": len(gift_q),
    }


def cancel_subscription_immediate(
    db: Session,
    *,
    subscription_id: int,
    expected_user_id: int,
    commit: bool = True,
) -> UserSubscription:
    """
    Немедленно отменить целевую UserSubscription (Этап 6.14.8).

    Идемпотентно, если уже CANCELLED/EXPIRED. Не трогает другие подписки.
    """
    sub = db.get(UserSubscription, int(subscription_id))
    if sub is None:
        raise EntitlementError(
            f"UserSubscription id={subscription_id} not found",
            code="subscription_not_found",
        )
    if int(sub.user_id) != int(expected_user_id):
        raise EntitlementError(
            "Subscription does not belong to refund user",
            code="subscription_user_mismatch",
        )
    now = _utcnow()
    status_val = _enum_value(sub.status)
    if status_val in (
        SubscriptionStatus.CANCELLED.value,
        SubscriptionStatus.EXPIRED.value,
    ):
        if commit:
            db.commit()
            db.refresh(sub)
        return sub
    sub.status = SubscriptionStatus.CANCELLED
    sub.cancelled_at = now
    sub.auto_renew = False
    sub.updated_at = now
    if commit:
        db.commit()
        db.refresh(sub)
    else:
        db.flush()
    return sub


def schedule_subscription_end(
    db: Session,
    *,
    subscription_id: int,
    expected_user_id: int,
    effective_at: datetime,
    commit: bool = True,
) -> UserSubscription:
    """
    Прекратить доступ к целевой подписке с даты effective_at.

    Если effective_at <= now — немедленная отмена.
    Иначе усечь current_period_end и отключить auto_renew (остаётся ACTIVE до expire).
    """
    at = _normalize_dt(effective_at)
    now = _utcnow()
    if at <= now:
        return cancel_subscription_immediate(
            db,
            subscription_id=subscription_id,
            expected_user_id=expected_user_id,
            commit=commit,
        )

    sub = db.get(UserSubscription, int(subscription_id))
    if sub is None:
        raise EntitlementError(
            f"UserSubscription id={subscription_id} not found",
            code="subscription_not_found",
        )
    if int(sub.user_id) != int(expected_user_id):
        raise EntitlementError(
            "Subscription does not belong to refund user",
            code="subscription_user_mismatch",
        )
    status_val = _enum_value(sub.status)
    if status_val in (
        SubscriptionStatus.CANCELLED.value,
        SubscriptionStatus.EXPIRED.value,
    ):
        if commit:
            db.commit()
            db.refresh(sub)
        return sub

    period_start = _normalize_dt(sub.current_period_start)
    if at <= period_start:
        raise EntitlementError(
            "effective_at must be after period_start",
            code="invalid_effective_at",
        )
    # Truncate end; never extend past original end.
    original_end = _normalize_dt(sub.current_period_end)
    new_end = at if at < original_end else original_end
    if new_end <= now:
        return cancel_subscription_immediate(
            db,
            subscription_id=subscription_id,
            expected_user_id=expected_user_id,
            commit=commit,
        )
    sub.current_period_end = new_end
    sub.auto_renew = False
    sub.updated_at = now
    if commit:
        db.commit()
        db.refresh(sub)
    else:
        db.flush()
    return sub


def cancel_user_addon(
    db: Session,
    *,
    user_addon_id: int,
    expected_user_id: int,
    commit: bool = True,
) -> UserAddon:
    """Отменить целевой UserAddon. Идемпотентно для CANCELLED/EXPIRED."""
    addon = db.get(UserAddon, int(user_addon_id))
    if addon is None:
        raise EntitlementError(
            f"UserAddon id={user_addon_id} not found",
            code="addon_not_found",
        )
    if int(addon.user_id) != int(expected_user_id):
        raise EntitlementError(
            "Addon does not belong to refund user",
            code="addon_user_mismatch",
        )
    now = _utcnow()
    status_val = _enum_value(addon.status)
    if status_val in (
        UserAddonStatus.CANCELLED.value,
        UserAddonStatus.EXPIRED.value,
    ):
        if commit:
            db.commit()
            db.refresh(addon)
        return addon
    addon.status = UserAddonStatus.CANCELLED
    addon.updated_at = now
    if commit:
        db.commit()
        db.refresh(addon)
    else:
        db.flush()
    return addon


def expire_user_addon(
    db: Session,
    *,
    user_addon_id: int,
    expected_user_id: int,
    commit: bool = True,
) -> UserAddon:
    """Пометить целевой UserAddon как EXPIRED. Идемпотентно."""
    addon = db.get(UserAddon, int(user_addon_id))
    if addon is None:
        raise EntitlementError(
            f"UserAddon id={user_addon_id} not found",
            code="addon_not_found",
        )
    if int(addon.user_id) != int(expected_user_id):
        raise EntitlementError(
            "Addon does not belong to refund user",
            code="addon_user_mismatch",
        )
    now = _utcnow()
    status_val = _enum_value(addon.status)
    if status_val in (
        UserAddonStatus.CANCELLED.value,
        UserAddonStatus.EXPIRED.value,
    ):
        if commit:
            db.commit()
            db.refresh(addon)
        return addon
    addon.status = UserAddonStatus.EXPIRED
    addon.updated_at = now
    if commit:
        db.commit()
        db.refresh(addon)
    else:
        db.flush()
    return addon


def reduce_user_addon_amount(
    db: Session,
    *,
    user_addon_id: int,
    expected_user_id: int,
    revoke_units: int,
    commit: bool = True,
) -> UserAddon:
    """
    Уменьшить amount целевого addon на revoke_units.

    Запрет отрицательного amount. Не трогает UsageCounter.
    Идемпотентность полной отмены: если уже CANCELLED/EXPIRED — no-op.
    """
    if int(revoke_units) < 0:
        raise EntitlementError(
            "revoke_units must be >= 0",
            code="negative_revoke_units",
        )
    addon = db.get(UserAddon, int(user_addon_id))
    if addon is None:
        raise EntitlementError(
            f"UserAddon id={user_addon_id} not found",
            code="addon_not_found",
        )
    if int(addon.user_id) != int(expected_user_id):
        raise EntitlementError(
            "Addon does not belong to refund user",
            code="addon_user_mismatch",
        )
    now = _utcnow()
    status_val = _enum_value(addon.status)
    if status_val in (
        UserAddonStatus.CANCELLED.value,
        UserAddonStatus.EXPIRED.value,
    ):
        if commit:
            db.commit()
            db.refresh(addon)
        return addon

    current = int(addon.amount or 0)
    if int(revoke_units) > current:
        raise EntitlementError(
            "Cannot revoke more units than this purchase granted",
            code="revoke_exceeds_grant",
        )
    new_amount = current - int(revoke_units)
    if new_amount < 0:
        raise EntitlementError(
            "Addon amount would become negative",
            code="negative_addon_amount",
        )
    addon.amount = new_amount
    addon.updated_at = now
    if new_amount == 0:
        addon.status = UserAddonStatus.CANCELLED
    if commit:
        db.commit()
        db.refresh(addon)
    else:
        db.flush()
    return addon
