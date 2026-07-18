"""Безопасная диагностика готовности ЮKassa (Этап 6.12.2). Без секретов."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class YooKassaDiagnosticsOut(BaseModel):
    provider: str = "yookassa"
    has_connection: bool
    connection_id: int | None = None
    connection_name: str | None = None
    enabled: bool | None = None
    verified: bool | None = None
    is_default: bool | None = None
    mode: Literal["test", "production"] | None = None
    return_url_configured: bool
    webhook_ip_check_enabled: bool
    webhook_trust_proxy_enabled: bool
    webhook_trusted_proxies_configured: bool
    webhook_route: str
    webhook_route_ready: bool = True
    readiness: Literal["missing", "partial", "ready"]
    issues: list[str] = Field(default_factory=list)
