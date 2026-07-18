"""
Диагностика конфигурации ЮKassa для администратора (Этап 6.12.2).

Только безопасные флаги: без shopId, secret, ciphertext, raw ошибок.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from backend.models.payment_provider_connection import PaymentProviderConnection
from backend.payments.yookassa_webhook_security import (
    WEBHOOK_ROUTE_PATH,
    parse_trusted_proxy_networks,
    yookassa_webhook_ip_check_enabled,
)
from backend.settings import settings


def _return_url_configured() -> bool:
    redirect = (getattr(settings, "YOOKASSA_REDIRECT_URL", None) or "").strip()
    frontend = (getattr(settings, "FRONTEND_URL", None) or "").strip()
    return bool(redirect or frontend)


def _pick_connection(db: Session) -> PaymentProviderConnection | None:
    default = (
        db.query(PaymentProviderConnection)
        .filter(
            PaymentProviderConnection.provider_code == "yookassa",
            PaymentProviderConnection.is_default.is_(True),
        )
        .order_by(PaymentProviderConnection.id.asc())
        .first()
    )
    if default:
        return default
    return (
        db.query(PaymentProviderConnection)
        .filter(PaymentProviderConnection.provider_code == "yookassa")
        .order_by(
            PaymentProviderConnection.enabled.desc(),
            PaymentProviderConnection.verified.desc(),
            PaymentProviderConnection.id.asc(),
        )
        .first()
    )


def build_yookassa_diagnostics(db: Session) -> dict[str, Any]:
    row = _pick_connection(db)
    trust_proxy = bool(getattr(settings, "YOOKASSA_WEBHOOK_TRUST_PROXY", False))
    trusted_configured = bool(
        parse_trusted_proxy_networks(
            getattr(settings, "YOOKASSA_WEBHOOK_TRUSTED_PROXIES", None)
        )
    )
    ip_check = yookassa_webhook_ip_check_enabled()
    return_ok = _return_url_configured()

    issues: list[str] = []
    if row is None:
        issues.append("no_connection")
        return {
            "provider": "yookassa",
            "has_connection": False,
            "connection_id": None,
            "connection_name": None,
            "enabled": None,
            "verified": None,
            "is_default": None,
            "mode": None,
            "return_url_configured": return_ok,
            "webhook_ip_check_enabled": ip_check,
            "webhook_trust_proxy_enabled": trust_proxy,
            "webhook_trusted_proxies_configured": trusted_configured,
            "webhook_route": WEBHOOK_ROUTE_PATH,
            "webhook_route_ready": True,
            "readiness": "missing",
            "issues": issues
            + (["return_url_missing"] if not return_ok else [])
            + (["webhook_ip_check_disabled"] if not ip_check else [])
            + (
                ["trust_proxy_without_allowlist"]
                if trust_proxy and not trusted_configured
                else []
            ),
        }

    mode = (row.mode or "").strip().lower()
    mode_out = mode if mode in ("test", "production") else None

    if not row.enabled:
        issues.append("not_enabled")
    if not row.verified:
        issues.append("not_verified")
    if not row.is_default:
        issues.append("not_default")
    if mode_out == "production":
        issues.append("live_mode_selected")
    if not return_ok:
        issues.append("return_url_missing")
    if not ip_check:
        issues.append("webhook_ip_check_disabled")
    if trust_proxy and not trusted_configured:
        issues.append("trust_proxy_without_allowlist")
    if not row.has_credentials():
        issues.append("credentials_missing")

    ready = (
        bool(row.enabled)
        and bool(row.verified)
        and bool(row.is_default)
        and bool(row.has_credentials())
        and return_ok
        and ip_check
        and not (trust_proxy and not trusted_configured)
        and mode_out == "test"
    )
    if ready:
        readiness = "ready"
        issues = []
    elif row is not None:
        readiness = "partial"
    else:
        readiness = "missing"

    return {
        "provider": "yookassa",
        "has_connection": True,
        "connection_id": int(row.id),
        "connection_name": row.connection_name,
        "enabled": bool(row.enabled),
        "verified": bool(row.verified),
        "is_default": bool(row.is_default),
        "mode": mode_out,
        "return_url_configured": return_ok,
        "webhook_ip_check_enabled": ip_check,
        "webhook_trust_proxy_enabled": trust_proxy,
        "webhook_trusted_proxies_configured": trusted_configured,
        "webhook_route": WEBHOOK_ROUTE_PATH,
        "webhook_route_ready": True,
        "readiness": readiness,
        "issues": issues,
    }
