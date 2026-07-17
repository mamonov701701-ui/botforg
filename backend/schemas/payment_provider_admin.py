"""Схемы admin API настроек платёжных провайдеров (Этап 6.9). Без секретов."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class PaymentProviderUpdateIn(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=128)
    enabled: bool | None = None
    mode: Literal["test", "production"] | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=10)
    priority: int | None = Field(default=None, ge=0, le=10000)


class PaymentProviderOut(BaseModel):
    code: str
    display_name: str
    enabled: bool
    mode: str
    currency: str
    priority: int
    is_default_for_new_payments: bool
    configured: bool
    readiness_status: str
    missing_required_settings: list[str] = Field(default_factory=list)
    masked_identifiers: dict[str, str] = Field(default_factory=dict)
    adapter_implemented: bool
    is_fake: bool
    last_health_check_at: datetime | None = None
    last_health_check_status: str | None = None
    last_health_check_message: str | None = None
    last_webhook_status: str | None = None
    last_webhook_at: datetime | None = None
    updated_at: datetime

    class Config:
        from_attributes = True


class PaymentProviderHealthOut(BaseModel):
    code: str
    status: str
    message: str
    configured: bool
    readiness_status: str
    checked_at: datetime
    details: dict[str, Any] = Field(default_factory=dict)
