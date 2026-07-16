"""Схемы admin API подарочных начислений (Этап 6.4)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

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
