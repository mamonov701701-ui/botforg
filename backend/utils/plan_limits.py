"""
Проверка лимитов тарифного плана.
При превышении — HTTPException 403 с понятным сообщением.
"""
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.models.plan import Plan
from backend.models.user import User


DEFAULT_LIMITS = {
    "max_bots": 1,
    "can_publish": False,
    "can_use_analytics": False,
    "max_team_members": 0,
    "can_publish_templates": False,
    "can_sell_templates": False,
    "can_view_marketplace_stats": False,
}


def get_plan_limits(db: Session, plan_code: str) -> dict[str, Any]:
    """Получить лимиты тарифа. Если тариф не найден — free."""
    plan = db.query(Plan).filter(Plan.code == plan_code).first()
    if not plan or not plan.limits:
        return DEFAULT_LIMITS.copy()
    limits = dict(DEFAULT_LIMITS)
    limits.update(plan.limits)
    return limits


def get_user_plan_limits(db: Session, user: User) -> dict[str, Any]:
    """Лимиты effective тарифа пользователя, без legacy users.plan_code."""
    from backend.services.tariff_limits import get_user_tariff_limits

    summary = get_user_tariff_limits(db, int(user.id))
    return get_plan_limits(db, summary.plan_code)


def check_max_bots(db: Session, user: User) -> None:
    """
    Legacy-обёртка: лимит **активных** production-ботов (тариф active_bots + пакеты).

    Не считает черновики (placeholder без канала). Предпочтительно вызывать
    ``ensure_can_activate_bot`` из ``backend.services.tariff_enforcement``.
    """
    from backend.services.tariff_enforcement import (
        TariffLimitExceeded,
        ensure_can_activate_bot,
    )

    try:
        ensure_can_activate_bot(db, user.id)
    except TariffLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=exc.message,
        ) from exc


def check_can_publish(db: Session, user: User) -> None:
    """Проверить право публикации сценариев. При отсутствии — 403."""
    limits = get_user_plan_limits(db, user)
    if not limits.get("can_publish", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Публикация сценариев доступна на тарифе Pro и выше. Перейдите на Pro или Team.",
        )


def check_can_use_analytics(db: Session, user: User) -> None:
    """Проверить право использования аналитики. При отсутствии — 403."""
    limits = get_user_plan_limits(db, user)
    if not limits.get("can_use_analytics", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аналитика доступна на тарифе Pro и выше. Перейдите на Pro или Team.",
        )


def check_can_publish_templates(db: Session, user: User) -> None:
    """Проверить право публикации шаблонов. При отсутствии — 403."""
    from backend.services.tariff_limits import get_user_tariff_limits

    summary = get_user_tariff_limits(db, int(user.id))
    if summary.plan_code not in {"team", "corporate"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Публикация шаблонов доступна на тарифе Team. Перейдите на Team.",
        )


def check_can_sell_templates(db: Session, user: User) -> None:
    """Проверить право продажи шаблонов (mock). При отсутствии — 403."""
    from backend.services.tariff_limits import get_user_tariff_limits

    summary = get_user_tariff_limits(db, int(user.id))
    if summary.plan_code not in {"team", "corporate"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Продажа шаблонов доступна на тарифе Team. Перейдите на Team.",
        )


def require_developer_plan(db: Session, user: User) -> None:
    """Проверить effective доступ к кабинету автора шаблонов. При отсутствии — 403."""
    from backend.services.tariff_limits import get_user_tariff_limits

    summary = get_user_tariff_limits(db, int(user.id))
    if summary.plan_code not in {"team", "corporate"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Кабинет автора доступен на тарифе Team. Перейдите на Team.",
        )


def check_can_view_marketplace_stats(db: Session, user: User) -> None:
    """Проверить право просмотра статистики маркетплейса. При отсутствии — 403."""
    from backend.services.tariff_limits import get_user_tariff_limits

    summary = get_user_tariff_limits(db, int(user.id))
    if summary.plan_code not in {"team", "corporate"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Статистика маркетплейса доступна на тарифе Team. Перейдите на Team.",
        )


def check_max_team_members(db: Session, user: User, owner_id: int) -> None:
    """
    Legacy-обёртка: лимит участников команды (тариф + пакеты + подарки + PLAN gift).

    Лимит считается для владельца команды (owner_id), не по устаревшему users.plan_code
    переданного user. Предпочтительно вызывать ensure_can_add_team_member из tariff_enforcement.
    """
    from backend.services.tariff_enforcement import (
        TariffLimitExceeded,
        ensure_can_add_team_member,
    )

    _ = user  # совместимость сигнатуры; источник тарифа — owner_id
    try:
        ensure_can_add_team_member(db, owner_id)
    except TariffLimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=exc.message,
        ) from exc
