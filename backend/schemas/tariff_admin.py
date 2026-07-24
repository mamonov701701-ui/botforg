"""Схемы admin API подарочных начислений (Этап 6.4) и каталога планов (7.1.1)."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

AdminGiftType = Literal["plan", "messages", "active_bot", "team_member"]


class AdminUserLookupOut(BaseModel):
    id: int
    public_id: int
    email: str
    name: str | None = None
    role: str
    plan_code: str | None = None


class GiftGrantCreateIn(BaseModel):
    target_user_id: int
    gift_type: AdminGiftType
    starts_at: datetime
    ends_at: datetime
    plan_id: int | None = None
    plan_code: str | None = None
    amount: int | None = Field(default=None, ge=1)
    reason: str | None = None
    admin_comment: str | None = None

    @model_validator(mode="after")
    def validate_by_gift_type(self) -> GiftGrantCreateIn:
        if self.starts_at >= self.ends_at:
            raise ValueError("starts_at must be earlier than ends_at")
        if self.gift_type == "plan":
            if self.plan_id is None and not (self.plan_code or "").strip():
                raise ValueError("plan gift requires plan_id or plan_code")
        elif self.amount is None:
            raise ValueError(f"{self.gift_type} gift requires amount")
        return self


class GiftGrantOut(BaseModel):
    id: int
    target_user_id: int | None
    gift_type: str
    plan_id: int | None = None
    addon_package_id: int | None = None
    amount: int | None = None
    starts_at: datetime
    ends_at: datetime
    granted_by_user_id: int
    reason: str | None = None
    admin_comment: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class GiftRevokeOut(BaseModel):
    gift: GiftGrantOut
    already_cancelled: bool = False


class AdminAuditLogOut(BaseModel):
    id: int
    admin_user_id: int
    action: str
    entity_type: str
    entity_id: int | None
    old_value: dict[str, Any] | None = None
    new_value: dict[str, Any] | None = None
    comment: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class AdminPlanLimitsOut(BaseModel):
    """Canonical limits from tariff_limits._parse_plan_limits (no legacy aliases)."""

    monthly_messages: int | None = None
    active_bots: int | None = None
    team_members: int | None = None
    analytics_history_days: int | None = None
    addon_purchase: bool = False
    export_reports: bool = False
    priority_support: bool = False
    marketplace_access: bool = True
    template_publish: bool = True
    scenario_publish: bool = True


class AdminPlanOut(BaseModel):
    """Admin read of a Plan row (Этап 7.1.1+)."""

    id: int
    code: str
    name: str
    name_ru: str | None = None
    description_ru: str | None = None
    price_month: Decimal | None = None
    currency: str = "RUB"
    is_active: bool = True
    is_public: bool = True
    is_recommended: bool = False
    sort_order: int = 0
    limits: AdminPlanLimitsOut
    created_at: datetime | None = None
    subscription_count: int = 0
    checkout_count: int = 0
    gift_count: int = 0
    has_references: bool = False
    can_delete: bool = False


class AdminPlanListOut(BaseModel):
    items: list[AdminPlanOut]
    total: int


class AdminPlanLimitsPatchIn(BaseModel):
    """Partial canonical limits. Unset keys are left unchanged; null = unlimited."""

    model_config = ConfigDict(extra="forbid")

    monthly_messages: int | None = Field(default=None, ge=0)
    active_bots: int | None = Field(default=None, ge=0)
    team_members: int | None = Field(default=None, ge=0)
    analytics_history_days: int | None = Field(default=None, ge=0)
    addon_purchase: bool | None = None
    export_reports: bool | None = None
    priority_support: bool | None = None
    marketplace_access: bool | None = None
    template_publish: bool | None = None
    scenario_publish: bool | None = None


class AdminPlanUpdateIn(BaseModel):
    """
    PATCH Plan (Этап 7.1.2).
    code / is_active / is_public are immutable here (extra=forbid).
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=128)
    name_ru: str | None = Field(default=None, max_length=255)
    description_ru: str | None = None
    price_month: Decimal | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=10)
    is_recommended: bool | None = None
    sort_order: int | None = None
    limits: AdminPlanLimitsPatchIn | None = None

    @field_validator("name", "name_ru", "description_ru", "currency", mode="before")
    @classmethod
    def _strip_strings(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("currency")
    @classmethod
    def _upper_currency(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not v:
            raise ValueError("currency must not be empty")
        return v.upper()


class AdminPlanLimitsCreateIn(BaseModel):
    """Canonical limits for create (defaults applied server-side for omitted keys)."""

    model_config = ConfigDict(extra="forbid")

    monthly_messages: int | None = Field(default=None, ge=0)
    active_bots: int | None = Field(default=None, ge=0)
    team_members: int | None = Field(default=None, ge=0)
    analytics_history_days: int | None = Field(default=None, ge=0)
    addon_purchase: bool | None = None
    export_reports: bool | None = None
    priority_support: bool | None = None
    marketplace_access: bool | None = None
    template_publish: bool | None = None
    scenario_publish: bool | None = None


class AdminPlanCreateIn(BaseModel):
    """POST Plan (Этап 7.1.3)."""

    model_config = ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=128)
    name_ru: str = Field(..., min_length=1, max_length=255)
    description_ru: str | None = None
    price_month: Decimal | None = Field(default=None, ge=0)
    currency: str = Field(default="RUB", min_length=3, max_length=10)
    is_public: bool = True
    is_recommended: bool = False
    sort_order: int = 0
    limits: AdminPlanLimitsCreateIn | None = None

    @field_validator("code", "name", "name_ru", "description_ru", "currency", mode="before")
    @classmethod
    def _strip_strings(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("code")
    @classmethod
    def _normalize_code(cls, v: str) -> str:
        return v.lower()

    @field_validator("currency")
    @classmethod
    def _upper_currency(cls, v: str) -> str:
        if not v:
            raise ValueError("currency must not be empty")
        return v.upper()


class AdminPlanVisibilityIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_public: bool


class AdminPlanAuditChangeOut(BaseModel):
    field: str
    label: str
    before: str
    after: str


class AdminPlanAuditItemOut(BaseModel):
    id: int
    created_at: datetime | None = None
    action: str
    action_label: str
    entity_type: str
    entity_id: int | None = None
    admin_user_id: int
    admin_email: str | None = None
    plan_code: str | None = None
    plan_name: str | None = None
    comment: str | None = None
    changed_fields: list[str] | None = None
    changes: list[AdminPlanAuditChangeOut] = Field(default_factory=list)


class AdminPlanAuditListOut(BaseModel):
    items: list[AdminPlanAuditItemOut]
    total: int
    limit: int
    offset: int
