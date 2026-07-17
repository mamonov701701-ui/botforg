"""Pydantic schemas for payment provider connections (no secret values out)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ConnectionCreateIn(BaseModel):
    provider_code: str = Field(..., min_length=2, max_length=64)
    connection_name: str = Field(..., min_length=1, max_length=128)
    mode: Literal["test", "production"] = "test"
    currency: str = Field(default="RUB", min_length=3, max_length=10)
    priority: int = Field(default=100, ge=0, le=1_000_000)
    enabled: bool = False
    credentials: dict[str, str] = Field(default_factory=dict)

    @field_validator("provider_code", "connection_name", "currency", mode="before")
    @classmethod
    def _strip(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("provider_code")
    @classmethod
    def _lower_code(cls, v: str) -> str:
        return v.lower()

    @field_validator("currency")
    @classmethod
    def _upper_currency(cls, v: str) -> str:
        return v.upper()


class ConnectionUpdateIn(BaseModel):
    """PATCH без credentials."""

    connection_name: str | None = Field(default=None, min_length=1, max_length=128)
    mode: Literal["test", "production"] | None = None
    currency: str | None = Field(default=None, min_length=3, max_length=10)
    priority: int | None = Field(default=None, ge=0, le=1_000_000)
    enabled: bool | None = None

    @field_validator("connection_name", "currency", mode="before")
    @classmethod
    def _strip(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("currency")
    @classmethod
    def _upper_currency(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return v.upper()


class ConnectionCredentialsIn(BaseModel):
    credentials: dict[str, str] = Field(..., min_length=1)


class ConnectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    provider_code: str
    connection_name: str
    mode: str
    enabled: bool
    verified: bool
    is_default: bool
    currency: str
    priority: int
    public_identifier_masked: str | None = None
    credentials_version: int
    credentials_key_id: str | None = None
    has_credentials: bool
    credential_fields_present: list[str] = Field(default_factory=list)
    adapter_status: str
    created_by: int | None = None
    updated_by: int | None = None
    verified_at: datetime | None = None
    last_health_check_at: datetime | None = None
    last_health_check_status: str | None = None
    created_at: datetime
    updated_at: datetime


class ConnectionVerifyOut(BaseModel):
    connection_id: int
    provider_code: str
    status: Literal["config_valid", "adapter_not_implemented", "invalid"]
    message: str
    verified: bool
    checked_at: datetime
