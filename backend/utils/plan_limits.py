"""
Проверка лимитов тарифного плана.
При превышении — HTTPException 403 с понятным сообщением.
"""
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.models.plan import Plan
from backend.models.user import User
from backend.models.bot import Bot
from backend.models.team import TeamMember


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
    """Лимиты текущего тарифа пользователя."""
    return get_plan_limits(db, user.plan_code or "free")


def check_max_bots(db: Session, user: User) -> None:
    """Проверить лимит ботов. При превышении — 403."""
    limits = get_user_plan_limits(db, user)
    max_bots = limits.get("max_bots", 1)
    count = db.query(Bot).filter(Bot.owner_id == user.id).count()
    if count >= max_bots:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Лимит ботов ({max_bots}) достигнут. Перейдите на тариф Pro или Team для увеличения лимита.",
        )


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
    limits = get_user_plan_limits(db, user)
    if not limits.get("can_publish_templates", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Публикация шаблонов доступна на тарифе Developer. Перейдите на Developer.",
        )


def check_can_sell_templates(db: Session, user: User) -> None:
    """Проверить право продажи шаблонов (mock). При отсутствии — 403."""
    limits = get_user_plan_limits(db, user)
    if not limits.get("can_sell_templates", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Продажа шаблонов доступна на тарифе Developer. Перейдите на Developer.",
        )


def require_developer_plan(db: Session, user: User) -> None:
    """Проверить тариф Developer. При отсутствии — 403."""
    limits = get_user_plan_limits(db, user)
    if not limits.get("can_view_marketplace_stats", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Кабинет разработчика доступен на тарифе Developer. Перейдите на Developer.",
        )


def check_can_view_marketplace_stats(db: Session, user: User) -> None:
    """Проверить право просмотра статистики маркетплейса. При отсутствии — 403."""
    limits = get_user_plan_limits(db, user)
    if not limits.get("can_view_marketplace_stats", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Статистика маркетплейса доступна на тарифе Developer. Перейдите на Developer.",
        )


def check_max_team_members(db: Session, user: User, owner_id: int) -> None:
    """Проверить лимит участников команды. При превышении — 403."""
    limits = get_user_plan_limits(db, user)
    max_members = limits.get("max_team_members", 0)
    if max_members <= 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Команда недоступна на тарифе Free. Перейдите на Pro или Team.",
        )
    count = db.query(TeamMember).filter(TeamMember.owner_id == owner_id).count()
    if count >= max_members:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Лимит участников команды ({max_members}) достигнут. Перейдите на тариф Team для увеличения.",
        )
