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


class AdminAddonOut(BaseModel):
    """Admin read of an AddonPackage row (Этап 7.2)."""

    id: int
    code: str
    name_ru: str
    description_ru: str | None = None
    type: str
    amount: int
    price: Decimal
    currency: str = "RUB"
    duration_type: str
    validity_days: int = 30
    available_from_plan: Any = None
    max_per_period: int | None = None
    is_active: bool = True
    is_public: bool = True
    sort_order: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None
    user_addon_count: int = 0
    checkout_count: int = 0
    gift_count: int = 0
    refund_count: int = 0
    has_references: bool = False
    can_delete: bool = False


class AdminAddonListOut(BaseModel):
    items: list[AdminAddonOut]
    total: int


class AdminCustomMessagesProductOut(BaseModel):
    """System «Настраиваемый пакет сообщений» — read-only admin card (not CRUD)."""

    code: str
    title: str
    public_title: str
    resource_type: str
    sales_enabled: bool
    sales_status_label: str
    active_grid_version_id: int | None = None
    active_grid_version_number: int | None = None
    currency: str = "RUB"
    validity_days: int
    min_quantity: int
    max_quantity: int
    pricing_grids_hint: str


class AdminAddonCreateIn(BaseModel):
    """POST AddonPackage (Этап 7.2)."""

    model_config = ConfigDict(extra="forbid")

    code: str = Field(..., min_length=1, max_length=64)
    name_ru: str = Field(..., min_length=1, max_length=255)
    description_ru: str | None = None
    type: str = Field(..., min_length=1, max_length=32)
    amount: int = Field(..., ge=1)
    price: Decimal = Field(..., ge=0)
    currency: str = Field(default="RUB", min_length=3, max_length=10)
    duration_type: str = Field(default="current_period", min_length=1, max_length=64)
    validity_days: int = Field(default=30, ge=1, le=3650)
    available_from_plan: list[str] | None = None
    max_per_period: int | None = Field(default=None, ge=1)
    is_public: bool = True
    sort_order: int = 0

    @field_validator("code", "name_ru", "description_ru", "type", "currency", "duration_type", mode="before")
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

    @field_validator("type")
    @classmethod
    def _normalize_type(cls, v: str) -> str:
        return v.lower()


class AdminAddonUpdateIn(BaseModel):
    """
    PATCH AddonPackage (Этап 7.2).
    code / is_active / is_public are immutable here (extra=forbid).
    """

    model_config = ConfigDict(extra="forbid")

    name_ru: str | None = Field(default=None, min_length=1, max_length=255)
    description_ru: str | None = None
    type: str | None = Field(default=None, min_length=1, max_length=32)
    amount: int | None = Field(default=None, ge=1)
    price: Decimal | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, min_length=3, max_length=10)
    duration_type: str | None = Field(default=None, min_length=1, max_length=64)
    validity_days: int | None = Field(default=None, ge=1, le=3650)
    available_from_plan: list[str] | None = None
    max_per_period: int | None = Field(default=None, ge=1)
    sort_order: int | None = None

    @field_validator(
        "name_ru",
        "description_ru",
        "type",
        "currency",
        "duration_type",
        mode="before",
    )
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

    @field_validator("type")
    @classmethod
    def _normalize_type(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.lower()


class AdminAddonVisibilityIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_public: bool


class AdminAddonAuditChangeOut(BaseModel):
    field: str
    label: str
    before: str
    after: str


class AdminAddonAuditItemOut(BaseModel):
    id: int
    created_at: datetime | None = None
    action: str
    action_label: str
    entity_type: str
    entity_id: int | None = None
    admin_user_id: int
    admin_email: str | None = None
    addon_code: str | None = None
    addon_name: str | None = None
    comment: str | None = None
    changed_fields: list[str] | None = None
    changes: list[AdminAddonAuditChangeOut] = Field(default_factory=list)


class AdminAddonAuditListOut(BaseModel):
    items: list[AdminAddonAuditItemOut]
    total: int
    limit: int
    offset: int


class AdminPricingTierOut(BaseModel):
    id: int
    resource_type: str
    range_start: int
    range_end: int | None = None
    unit_price: Decimal
    currency: str = "RUB"
    is_active: bool = True
    sort_order: int = 0
    used_in_purchases: bool = False
    can_delete: bool = True
    grid_version_id: int | None = None


class AdminPricingTierListOut(BaseModel):
    items: list[AdminPricingTierOut]
    total: int


class AdminPricingTierCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resource_type: str = Field(..., min_length=1, max_length=32)
    range_start: int = Field(..., ge=1)
    range_end: int | None = Field(default=None, ge=1)
    unit_price: Decimal
    currency: str = Field(default="RUB", min_length=3, max_length=10)
    is_active: bool = True
    sort_order: int | None = None

    @field_validator("resource_type", "currency", mode="before")
    @classmethod
    def _strip_tier_strings(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("currency")
    @classmethod
    def _upper_tier_currency(cls, v: str) -> str:
        return v.upper()

    @field_validator("resource_type")
    @classmethod
    def _lower_resource_type(cls, v: str) -> str:
        return v.lower()


class AdminPricingTierUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resource_type: str | None = Field(default=None, min_length=1, max_length=32)
    range_start: int | None = Field(default=None, ge=1)
    range_end: int | None = Field(default=None, ge=1)
    unit_price: Decimal | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=10)
    sort_order: int | None = None

    @field_validator("resource_type", "currency", mode="before")
    @classmethod
    def _strip_tier_strings(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("currency")
    @classmethod
    def _upper_tier_currency(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.upper()

    @field_validator("resource_type")
    @classmethod
    def _lower_resource_type(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.lower()


class AdminPricingGridVersionOut(BaseModel):
    id: int
    resource_type: str
    currency: str = "RUB"
    status: str
    version_number: int
    based_on_version_id: int | None = None
    created_at: datetime | str | None = None
    published_at: datetime | str | None = None
    archived_at: datetime | str | None = None
    note: str | None = None
    tiers_count: int = 0
    tiers: list[AdminPricingTierOut] = Field(default_factory=list)


class AdminPricingGridVersionListOut(BaseModel):
    items: list[AdminPricingGridVersionOut]
    total: int


class AdminPricingGridCreateDraftIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resource_type: str = Field(..., min_length=1, max_length=32)
    currency: str = Field(default="RUB", min_length=3, max_length=10)
    based_on_version_id: int | None = None
    note: str | None = None

    @field_validator("resource_type", "currency", mode="before")
    @classmethod
    def _strip_strings(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("currency")
    @classmethod
    def _upper_currency(cls, v: str) -> str:
        return v.upper()

    @field_validator("resource_type")
    @classmethod
    def _lower_resource(cls, v: str) -> str:
        return v.lower()


class AdminPricingGridTierCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    range_start: int = Field(..., ge=1)
    range_end: int | None = Field(default=None, ge=1)
    unit_price: Decimal
    currency: str | None = Field(default=None, min_length=3, max_length=10)
    sort_order: int | None = None

    @field_validator("currency", mode="before")
    @classmethod
    def _strip_currency(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("currency")
    @classmethod
    def _upper_currency(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.upper()


class AdminPricingGridTierUpdateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    range_start: int | None = Field(default=None, ge=1)
    range_end: int | None = Field(default=None, ge=1)
    unit_price: Decimal | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=10)
    sort_order: int | None = None

    @field_validator("currency", mode="before")
    @classmethod
    def _strip_currency(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("currency")
    @classmethod
    def _upper_currency(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.upper()
