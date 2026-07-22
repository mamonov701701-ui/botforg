"""
Расчёт тарифных лимитов пользователя (Этап 4).

Только вычисление лимитов и usage summary — без enforcement в runtime.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from backend.models.plan import Plan
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    GiftGrant,
    GiftGrantStatus,
    GiftType,
    SubscriptionStatus,
    UsageCounter,
    UserAddon,
    UserAddonStatus,
    UserSubscription,
)
from backend.models.user import User
from backend.services.bot_usage import count_production_active_bots
from backend.services.team_usage import count_team_members_for_owner

FALLBACK_PLAN_CODE = "start"

# При равном sort_order выше приоритет у подписки, затем gift, legacy, fallback.
_PLAN_SOURCE_PRIORITY: dict[str, int] = {
    "subscription": 40,
    "gift_plan": 30,
    "legacy_plan_code": 20,
    "fallback_start": 10,
}

# Безопасные defaults при отсутствии Plan.limits (тариф «Старт»)
DEFAULT_NUMERIC_LIMITS: dict[str, int | None] = {
    "active_bots": 1,
    "monthly_messages": 500,
    "team_members": 0,
}

MESSAGE_WARNING_THRESHOLDS = (70, 85, 95, 100)

MESSAGE_WARNING_TEXTS: dict[int, str] = {
    70: "Использовано 70% лимита сообщений.",
    85: "Лимит сообщений скоро закончится.",
    95: "Лимит сообщений почти исчерпан.",
    100: "Лимит сообщений исчерпан.",
}

ACTIVE_BOTS_WARNING_TEXTS: dict[int, str] = {
    70: "Использовано 70% лимита активных ботов.",
    85: "Лимит активных ботов скоро закончится.",
    95: "Лимит активных ботов почти исчерпан.",
    100: "Лимит активных ботов исчерпан.",
}

TEAM_MEMBERS_WARNING_TEXTS: dict[int, str] = {
    70: "Использовано 70% лимита участников команды.",
    85: "Лимит участников команды скоро закончится.",
    95: "Лимит участников команды почти исчерпан.",
    100: "Лимит участников команды исчерпан.",
}


@dataclass
class TariffLimitWarning:
    type: str
    threshold: int
    message: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "threshold": self.threshold,
            "message": self.message,
        }


@dataclass
class TariffLimitsSummary:
    plan_code: str
    plan_name: str
    period_start: datetime
    period_end: datetime
    messages_limit: int | None
    messages_used: int
    messages_remaining: int | None
    # Plan monthly_messages before addon/gift bonuses (FIFO plan_base bucket).
    messages_plan_base: int | None = None
    active_bots_limit: int | None = None
    active_bots_used: int = 0
    active_bots_remaining: int | None = None
    team_members_limit: int | None = None
    team_members_used: int = 0
    team_members_remaining: int | None = None
    active_addons: list[dict[str, Any]] = field(default_factory=list)
    active_gifts: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[TariffLimitWarning] = field(default_factory=list)
    subscription_status: str | None = None
    # Дополнительные поля из Plan.limits (для будущего UI/enforcement)
    analytics_history_days: int | None = None
    export_reports: bool = False
    priority_support: bool = False
    marketplace_access: bool = True
    template_publish: bool = True
    scenario_publish: bool = True
    # Purchase of public addon packages (Business+). Default False = fail-closed.
    addon_purchase: bool = False
    source: str = "legacy_plan_code"  # subscription | legacy_plan_code | fallback_start

    def to_dict(self) -> dict[str, Any]:
        return {
            "plan_code": self.plan_code,
            "plan_name": self.plan_name,
            "period_start": self.period_start.isoformat(),
            "period_end": self.period_end.isoformat(),
            "messages_limit": self.messages_limit,
            "messages_used": self.messages_used,
            "messages_remaining": self.messages_remaining,
            "active_bots_limit": self.active_bots_limit,
            "active_bots_used": self.active_bots_used,
            "active_bots_remaining": self.active_bots_remaining,
            "team_members_limit": self.team_members_limit,
            "team_members_used": self.team_members_used,
            "team_members_remaining": self.team_members_remaining,
            "active_addons": self.active_addons,
            "active_gifts": self.active_gifts,
            "warnings": [w.to_dict() for w in self.warnings],
            "source": self.source,
        }


def get_user_tariff_limits(
    db: Session,
    user_id: int,
    at: datetime | None = None,
) -> TariffLimitsSummary:
    """Рассчитать итоговые лимиты, usage и предупреждения для пользователя."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError(f"User {user_id} not found")

    at_dt = _normalize_dt(at or datetime.now(timezone.utc))

    subscription = _find_active_subscription(db, user_id, at_dt)

    if subscription:
        period_start = _normalize_dt(subscription.current_period_start)
        period_end = _normalize_dt(subscription.current_period_end)
    else:
        period_start, period_end = _calendar_month_period(at_dt)

    plan, source = _resolve_effective_plan(
        db,
        user,
        subscription,
        user_id,
        at_dt,
        period_start,
        period_end,
    )

    base = _parse_plan_limits(plan)
    messages_limit = base["monthly_messages"]
    active_bots_limit = base["active_bots"]
    team_members_limit = base["team_members"]

    active_addons: list[dict[str, Any]] = []
    addon_bonuses = _sum_active_addons(
        db, user_id, at_dt, period_start, period_end, active_addons
    )
    messages_limit = _add_int_limit(messages_limit, addon_bonuses["messages"])
    active_bots_limit = _add_int_limit(active_bots_limit, addon_bonuses["active_bots"])
    team_members_limit = _add_int_limit(team_members_limit, addon_bonuses["team_members"])

    active_gifts: list[dict[str, Any]] = []
    gift_bonuses = _sum_active_gifts(
        db, user_id, at_dt, period_start, period_end, active_gifts
    )
    messages_limit = _add_int_limit(messages_limit, gift_bonuses["messages"])
    active_bots_limit = _add_int_limit(active_bots_limit, gift_bonuses["active_bots"])
    team_members_limit = _add_int_limit(team_members_limit, gift_bonuses["team_members"])

    usage = _find_usage(db, user_id, period_start, period_end)
    messages_used = usage.messages_used if usage else 0
    # Источник истины — bot_usage (не UsageCounter.active_bots_used): см. TARIFFS_STAGE_5_1.
    active_bots_used = count_production_active_bots(db, user_id)
    # Источник истины — team_members (не UsageCounter.team_members_used): см. 5.4.1.
    team_members_used = count_team_members_for_owner(db, user_id)

    plan_code = plan.code if plan else FALLBACK_PLAN_CODE
    plan_name = _plan_display_name(plan)

    subscription_status = (
        _enum_value(subscription.status) if subscription else None
    )

    summary = TariffLimitsSummary(
        plan_code=plan_code,
        plan_name=plan_name,
        period_start=period_start,
        period_end=period_end,
        subscription_status=subscription_status,
        messages_limit=messages_limit,
        messages_used=messages_used,
        messages_remaining=_remaining(messages_limit, messages_used),
        messages_plan_base=base["monthly_messages"],
        active_bots_limit=active_bots_limit,
        active_bots_used=active_bots_used,
        active_bots_remaining=_remaining(active_bots_limit, active_bots_used),
        team_members_limit=team_members_limit,
        team_members_used=team_members_used,
        team_members_remaining=_remaining(team_members_limit, team_members_used),
        active_addons=active_addons,
        active_gifts=active_gifts,
        analytics_history_days=base.get("analytics_history_days"),
        export_reports=bool(base.get("export_reports")),
        priority_support=bool(base.get("priority_support")),
        marketplace_access=bool(base.get("marketplace_access", True)),
        template_publish=bool(base.get("template_publish", True)),
        scenario_publish=bool(base.get("scenario_publish", True)),
        addon_purchase=bool(base.get("addon_purchase", False)),
        source=source,
    )
    summary.warnings = (
        _build_usage_warnings(
            messages_limit,
            messages_used,
            warning_type="messages_usage",
            texts=MESSAGE_WARNING_TEXTS,
        )
        + _build_usage_warnings(
            active_bots_limit,
            active_bots_used,
            warning_type="active_bots_usage",
            texts=ACTIVE_BOTS_WARNING_TEXTS,
        )
        + _build_usage_warnings(
            team_members_limit,
            team_members_used,
            warning_type="team_members_usage",
            texts=TEAM_MEMBERS_WARNING_TEXTS,
        )
    )
    return summary


def _normalize_dt(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _calendar_month_period(at: datetime) -> tuple[datetime, datetime]:
    start = at.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if at.month == 12:
        end = start.replace(year=at.year + 1, month=1)
    else:
        end = start.replace(month=at.month + 1)
    return start, end


def _periods_overlap(
    a_start: datetime,
    a_end: datetime,
    b_start: datetime,
    b_end: datetime,
) -> bool:
    return a_start < b_end and b_start < a_end


def _find_active_subscription(
    db: Session, user_id: int, at: datetime
) -> UserSubscription | None:
    candidates = (
        db.query(UserSubscription)
        .filter(
            UserSubscription.user_id == user_id,
            UserSubscription.status == SubscriptionStatus.ACTIVE,
        )
        .all()
    )
    for sub in candidates:
        start = _normalize_dt(sub.current_period_start)
        end = _normalize_dt(sub.current_period_end)
        if start <= at <= end:
            return sub
    return None


def _resolve_plan(
    db: Session,
    user: User,
    subscription: UserSubscription | None,
) -> tuple[Plan | None, str]:
    if subscription:
        plan = db.query(Plan).filter(Plan.id == subscription.plan_id).first()
        if plan:
            return plan, "subscription"
    plan_code = (user.plan_code or "").strip() or FALLBACK_PLAN_CODE
    plan = db.query(Plan).filter(Plan.code == plan_code).first()
    if plan:
        return plan, "legacy_plan_code"
    plan = db.query(Plan).filter(Plan.code == FALLBACK_PLAN_CODE).first()
    return plan, "fallback_start"


def _plan_sort_order(plan: Plan | None) -> int:
    if not plan or plan.sort_order is None:
        return 0
    return int(plan.sort_order)


def _find_active_plan_gift_grants(
    db: Session,
    user_id: int,
    at: datetime,
    period_start: datetime,
    period_end: datetime,
) -> list[GiftGrant]:
    grants = (
        db.query(GiftGrant)
        .filter(
            GiftGrant.target_user_id == user_id,
            GiftGrant.status == GiftGrantStatus.ACTIVE,
            GiftGrant.gift_type == GiftType.PLAN,
        )
        .all()
    )
    active: list[GiftGrant] = []
    for grant in grants:
        starts = _normalize_dt(grant.starts_at)
        ends = _normalize_dt(grant.ends_at)
        if not (starts <= at <= ends):
            continue
        if not _periods_overlap(starts, ends, period_start, period_end):
            continue
        active.append(grant)
    return active


def _resolve_effective_plan(
    db: Session,
    user: User,
    subscription: UserSubscription | None,
    user_id: int,
    at: datetime,
    period_start: datetime,
    period_end: datetime,
) -> tuple[Plan | None, str]:
    """
    Базовый тариф: подписка / legacy / fallback + активные PLAN gifts.

    Выбирается план с максимальным sort_order; при равенстве — приоритет источника
    (subscription > gift_plan > legacy_plan_code > fallback_start).
    """
    base_plan, base_source = _resolve_plan(db, user, subscription)
    candidates: list[tuple[Plan, str]] = []
    if base_plan:
        candidates.append((base_plan, base_source))

    for grant in _find_active_plan_gift_grants(
        db, user_id, at, period_start, period_end
    ):
        if not grant.plan_id:
            continue
        gift_plan = db.query(Plan).filter(Plan.id == grant.plan_id).first()
        if gift_plan:
            candidates.append((gift_plan, "gift_plan"))

    if not candidates:
        plan = db.query(Plan).filter(Plan.code == FALLBACK_PLAN_CODE).first()
        return plan, "fallback_start"

    def _rank(item: tuple[Plan, str]) -> tuple[int, int]:
        plan, source = item
        return (_plan_sort_order(plan), _PLAN_SOURCE_PRIORITY.get(source, 0))

    return max(candidates, key=_rank)


def _parse_plan_limits(plan: Plan | None) -> dict[str, Any]:
    raw: dict[str, Any] = {}
    if plan and isinstance(plan.limits, dict):
        raw = dict(plan.limits)

    return {
        "active_bots": _read_numeric_limit(
            raw, "active_bots", legacy_key="max_bots", default=DEFAULT_NUMERIC_LIMITS["active_bots"]
        ),
        "monthly_messages": _read_numeric_limit(
            raw,
            "monthly_messages",
            default=DEFAULT_NUMERIC_LIMITS["monthly_messages"],
        ),
        "team_members": _read_numeric_limit(
            raw, "team_members", legacy_key="max_team_members", default=DEFAULT_NUMERIC_LIMITS["team_members"]
        ),
        "analytics_history_days": _read_numeric_limit(raw, "analytics_history_days", default=None),
        "export_reports": bool(raw.get("export_reports", False)),
        "priority_support": bool(raw.get("priority_support", False)),
        "marketplace_access": bool(raw.get("marketplace_access", True)),
        "template_publish": bool(raw.get("template_publish", True)),
        "scenario_publish": bool(raw.get("scenario_publish", True)),
        # Missing key → False (fail-closed): Start / legacy free/pro/developer.
        "addon_purchase": bool(raw.get("addon_purchase", False)),
    }


def _read_numeric_limit(
    raw: dict[str, Any],
    key: str,
    *,
    legacy_key: str | None = None,
    default: int | None,
) -> int | None:
    """Прочитать лимит: явный JSON null → безлимит (None), отсутствие ключа → default."""
    if key in raw:
        return _coerce_limit_int(raw[key], default=default, missing_means_default=False)
    if legacy_key and legacy_key in raw:
        return _coerce_limit_int(raw[legacy_key], default=default, missing_means_default=False)
    return default


def _coerce_limit_int(
    value: Any,
    *,
    default: int | None,
    missing_means_default: bool = True,
) -> int | None:
    if value is None:
        return default if missing_means_default else None
    if isinstance(value, bool):
        return default if missing_means_default else None
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _plan_display_name(plan: Plan | None) -> str:
    if not plan:
        return "Старт"
    return plan.name_ru or plan.name or plan.code


def _sum_active_addons(
    db: Session,
    user_id: int,
    at: datetime,
    period_start: datetime,
    period_end: datetime,
    out_list: list[dict[str, Any]],
) -> dict[str, int]:
    bonuses = {"messages": 0, "active_bots": 0, "team_members": 0}
    rows = (
        db.query(UserAddon, AddonPackage)
        .join(AddonPackage, UserAddon.addon_package_id == AddonPackage.id)
        .filter(
            UserAddon.user_id == user_id,
            UserAddon.status == UserAddonStatus.ACTIVE,
        )
        .all()
    )
    for user_addon, package in rows:
        p_start = _normalize_dt(user_addon.period_start)
        p_end = _normalize_dt(user_addon.period_end)
        if not (p_start <= at <= p_end):
            continue
        if not _periods_overlap(p_start, p_end, period_start, period_end):
            continue
        amount = user_addon.amount or package.amount or 0
        pkg_type = _enum_value(package.type)
        _apply_addon_bonus(bonuses, pkg_type, amount)
        period_end_iso = p_end.isoformat()
        out_list.append(
            {
                "id": user_addon.id,
                "code": package.code,
                "name_ru": package.name_ru,
                "type": pkg_type,
                "amount": amount,
                "period_start": p_start.isoformat(),
                "period_end": period_end_iso,
                # Alias for UI: same source of truth as period_end.
                "expires_at": period_end_iso,
            }
        )
    return bonuses


def _sum_active_gifts(
    db: Session,
    user_id: int,
    at: datetime,
    period_start: datetime,
    period_end: datetime,
    out_list: list[dict[str, Any]],
) -> dict[str, int]:
    bonuses = {"messages": 0, "active_bots": 0, "team_members": 0}
    grants = (
        db.query(GiftGrant)
        .filter(
            GiftGrant.target_user_id == user_id,
            GiftGrant.status == GiftGrantStatus.ACTIVE,
        )
        .all()
    )
    for grant in grants:
        starts = _normalize_dt(grant.starts_at)
        ends = _normalize_dt(grant.ends_at)
        if not (starts <= at <= ends):
            continue
        if not _periods_overlap(starts, ends, period_start, period_end):
            continue

        gift_type = _enum_value(grant.gift_type)
        amount = grant.amount or 0
        entry: dict[str, Any] = {
            "id": grant.id,
            "gift_type": gift_type,
            "amount": amount,
            "starts_at": starts.isoformat(),
            "ends_at": ends.isoformat(),
        }

        if gift_type == GiftType.MESSAGES.value:
            bonuses["messages"] += amount
        elif gift_type == GiftType.ACTIVE_BOT.value:
            bonuses["active_bots"] += amount
        elif gift_type == GiftType.TEAM_MEMBER.value:
            bonuses["team_members"] += amount
        elif gift_type == GiftType.ADDON.value:
            if grant.addon_package_id:
                package = (
                    db.query(AddonPackage)
                    .filter(AddonPackage.id == grant.addon_package_id)
                    .first()
                )
                if package:
                    pkg_amount = amount or package.amount or 0
                    entry["addon_package_code"] = package.code
                    _apply_addon_bonus(
                        bonuses, _enum_value(package.type), pkg_amount
                    )
                    amount = pkg_amount
        elif gift_type == GiftType.PLAN.value:
            if grant.plan_id:
                gift_plan = (
                    db.query(Plan).filter(Plan.id == grant.plan_id).first()
                )
                if gift_plan:
                    entry["plan_id"] = gift_plan.id
                    entry["plan_code"] = gift_plan.code
                    entry["plan_name_ru"] = _plan_display_name(gift_plan)
                else:
                    entry["status"] = "unsupported_missing_plan_row"
            else:
                entry["status"] = "unsupported_missing_plan_id"
                entry["message"] = (
                    "PLAN gift requires plan_id; base tariff limits unchanged."
                )
        out_list.append(entry)
    return bonuses


def _apply_addon_bonus(bonuses: dict[str, int], pkg_type: str, amount: int) -> None:
    if pkg_type == AddonPackageType.MESSAGES.value:
        bonuses["messages"] += amount
    elif pkg_type == AddonPackageType.ACTIVE_BOT.value:
        bonuses["active_bots"] += amount
    elif pkg_type == AddonPackageType.TEAM_MEMBER.value:
        bonuses["team_members"] += amount


def _enum_value(value: Any) -> str:
    if hasattr(value, "value"):
        return str(value.value)
    return str(value)


def _find_usage(
    db: Session,
    user_id: int,
    period_start: datetime,
    period_end: datetime,
) -> UsageCounter | None:
    counters = (
        db.query(UsageCounter)
        .filter(UsageCounter.user_id == user_id)
        .all()
    )
    for counter in counters:
        c_start = _normalize_dt(counter.period_start)
        c_end = _normalize_dt(counter.period_end)
        if _periods_overlap(c_start, c_end, period_start, period_end):
            return counter
    return None


def _add_int_limit(base: int | None, bonus: int) -> int | None:
    if base is None:
        return None
    return base + bonus


def _remaining(limit: int | None, used: int) -> int | None:
    if limit is None:
        return None
    return max(0, limit - used)


def _build_usage_warnings(
    limit: int | None,
    used: int,
    *,
    warning_type: str,
    texts: dict[int, str],
) -> list[TariffLimitWarning]:
    if limit is None or limit <= 0:
        return []
    usage_pct = (used / limit) * 100
    warnings: list[TariffLimitWarning] = []
    for threshold in MESSAGE_WARNING_THRESHOLDS:
        if usage_pct >= threshold:
            warnings.append(
                TariffLimitWarning(
                    type=warning_type,
                    threshold=threshold,
                    message=texts[threshold],
                )
            )
    return warnings


def _build_message_warnings(
    messages_limit: int | None,
    messages_used: int,
) -> list[TariffLimitWarning]:
    """Обратная совместимость для прямых вызовов в тестах."""
    return _build_usage_warnings(
        messages_limit,
        messages_used,
        warning_type="messages_usage",
        texts=MESSAGE_WARNING_TEXTS,
    )
