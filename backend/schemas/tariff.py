"""Pydantic-схемы API сводки тарифов и лимитов (Этап 5.4+) и публичного каталога (6.1)."""
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field

from backend.services.tariff_limits import TariffLimitsSummary


class PublicTariffOut(BaseModel):
    """Публичная карточка тарифа (GET /tariffs). Без ORM/admin-полей."""

    code: str
    name: str
    description_ru: str | None = None
    price_month: Decimal | None = None
    currency: str = "RUB"
    is_recommended: bool = False
    sort_order: int = 0
    limits: dict[str, Any] = Field(default_factory=dict)


class PublicAddonOut(BaseModel):
    """Публичная карточка пакета (GET /addons). Без ORM/admin-полей."""

    code: str
    name_ru: str
    description_ru: str | None = None
    type: str
    amount: int
    price: Decimal
    currency: str = "RUB"
    duration_type: str
    # Calendar days from successful activation (matches fulfillment).
    validity_days: int = 30
    available_from_plan: Any = None
    max_per_period: int | None = None
    sort_order: int = 0


class BillingPeriodOut(BaseModel):
    start: datetime
    end: datetime


class CurrentPlanOut(BaseModel):
    code: str
    slug: str
    name: str
    billing_period: BillingPeriodOut
    subscription_status: str | None = None
    source: str


class LimitUsageOut(BaseModel):
    limit: int | None
    used: int
    remaining: int | None


class TariffWarningOut(BaseModel):
    type: str
    threshold: int
    message: str


class TariffFlagsOut(BaseModel):
    marketplace_access: bool
    template_publish: bool
    scenario_publish: bool
    export_reports: bool
    priority_support: bool
    addon_purchase: bool = False


class TariffSummaryOut(BaseModel):
    current_plan: CurrentPlanOut
    messages: LimitUsageOut
    active_bots: LimitUsageOut
    team_members: LimitUsageOut
    active_addons: list[dict[str, Any]] = Field(default_factory=list)
    active_gifts: list[dict[str, Any]] = Field(default_factory=list)
    warnings: list[TariffWarningOut] = Field(default_factory=list)
    flags: TariffFlagsOut


def tariff_summary_from_service(summary: TariffLimitsSummary) -> TariffSummaryOut:
    """Собрать ответ API из результата get_user_tariff_limits (read-only)."""
    return TariffSummaryOut(
        current_plan=CurrentPlanOut(
            code=summary.plan_code,
            slug=summary.plan_code,
            name=summary.plan_name,
            billing_period=BillingPeriodOut(
                start=summary.period_start,
                end=summary.period_end,
            ),
            subscription_status=summary.subscription_status,
            source=summary.source,
        ),
        messages=LimitUsageOut(
            limit=summary.messages_limit,
            used=summary.messages_used,
            remaining=summary.messages_remaining,
        ),
        active_bots=LimitUsageOut(
            limit=summary.active_bots_limit,
            used=summary.active_bots_used,
            remaining=summary.active_bots_remaining,
        ),
        team_members=LimitUsageOut(
            limit=summary.team_members_limit,
            used=summary.team_members_used,
            remaining=summary.team_members_remaining,
        ),
        active_addons=summary.active_addons,
        active_gifts=summary.active_gifts,
        warnings=[
            TariffWarningOut(
                type=w.type,
                threshold=w.threshold,
                message=w.message,
            )
            for w in summary.warnings
        ],
        flags=TariffFlagsOut(
            marketplace_access=summary.marketplace_access,
            template_publish=summary.template_publish,
            scenario_publish=summary.scenario_publish,
            export_reports=summary.export_reports,
            priority_support=summary.priority_support,
            addon_purchase=summary.addon_purchase,
        ),
    )
