"""
Безопасное определение IP клиента webhook ЮKassa (Этап 6.12.2).

По умолчанию — только request.client.host.
X-Forwarded-For / X-Real-IP учитываются только если:
  1) YOOKASSA_WEBHOOK_TRUST_PROXY=true
  2) peer (TCP) входит в YOOKASSA_WEBHOOK_TRUSTED_PROXIES
Иначе заголовки игнорируются (защита от spoofing).

YOOKASSA_WEBHOOK_SKIP_IP_CHECK в production запрещён (fail-closed).
"""
from __future__ import annotations

import ipaddress
import logging
from typing import Iterable

from starlette.requests import Request

from backend.settings import settings

logger = logging.getLogger(__name__)

WEBHOOK_ROUTE_PATH = "/webhooks/payments/yookassa"


def _is_production() -> bool:
    return (getattr(settings, "ENVIRONMENT", "") or "").strip().lower() == "production"


def parse_trusted_proxy_networks(
    raw: str | None,
) -> list[ipaddress.IPv4Network | ipaddress.IPv6Network]:
    networks: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = []
    text = (raw or "").strip()
    if not text:
        return networks
    for part in text.split(","):
        token = part.strip()
        if not token:
            continue
        try:
            if "/" in token:
                networks.append(ipaddress.ip_network(token, strict=False))
            else:
                addr = ipaddress.ip_address(token)
                networks.append(
                    ipaddress.ip_network(f"{addr}/{addr.max_prefixlen}", strict=False)
                )
        except ValueError:
            logger.warning("Ignoring invalid trusted proxy entry")
    return networks


def _peer_in_trusted(
    peer: str,
    networks: Iterable[ipaddress.IPv4Network | ipaddress.IPv6Network],
) -> bool:
    try:
        addr = ipaddress.ip_address(peer.strip())
    except ValueError:
        return False
    return any(addr in net for net in networks)


def _valid_ip_token(value: str) -> str | None:
    token = (value or "").strip()
    if not token:
        return None
    try:
        ipaddress.ip_address(token)
    except ValueError:
        return None
    return token


def resolve_yookassa_webhook_client_ip(request: Request) -> str | None:
    """
    IP для allowlist ЮKassa.

    - default: TCP peer (request.client.host)
    - proxy headers: только от доверенного peer при явной конфигурации
    """
    peer = request.client.host if request.client and request.client.host else None
    if not peer:
        return None

    trust = bool(getattr(settings, "YOOKASSA_WEBHOOK_TRUST_PROXY", False))
    if not trust:
        return peer

    networks = parse_trusted_proxy_networks(
        getattr(settings, "YOOKASSA_WEBHOOK_TRUSTED_PROXIES", None)
    )
    if not networks:
        # fail-closed: trust flag без списка — заголовки не принимаем
        return peer

    if not _peer_in_trusted(peer, networks):
        # недоверенный клиент — игнорируем spoofed X-Forwarded-For / X-Real-IP
        return peer

    x_real = request.headers.get("x-real-ip")
    if x_real:
        candidate = _valid_ip_token(x_real.split(",")[0])
        if candidate:
            return candidate

    xff = request.headers.get("x-forwarded-for")
    if xff:
        # при append справа оригинальный клиент — слева
        candidate = _valid_ip_token(xff.split(",")[0])
        if candidate:
            return candidate

    return peer


def yookassa_webhook_ip_check_skipped() -> bool:
    """True только вне production (pytest / явный local skip)."""
    if _is_production():
        return False
    if bool(getattr(settings, "TESTING", False)):
        return True
    return bool(getattr(settings, "YOOKASSA_WEBHOOK_SKIP_IP_CHECK", False))


def yookassa_webhook_ip_check_enabled() -> bool:
    return not yookassa_webhook_ip_check_skipped()


def assert_production_yookassa_webhook_safety() -> None:
    """
    Вызвать при старте в production.
    Raises RuntimeError при небезопасной конфигурации.
    """
    if not _is_production():
        return
    if bool(getattr(settings, "YOOKASSA_WEBHOOK_SKIP_IP_CHECK", False)):
        raise RuntimeError(
            "Production: YOOKASSA_WEBHOOK_SKIP_IP_CHECK must be false (fail-closed)"
        )
    if bool(getattr(settings, "YOOKASSA_WEBHOOK_TRUST_PROXY", False)):
        networks = parse_trusted_proxy_networks(
            getattr(settings, "YOOKASSA_WEBHOOK_TRUSTED_PROXIES", None)
        )
        if not networks:
            raise RuntimeError(
                "Production: YOOKASSA_WEBHOOK_TRUST_PROXY requires "
                "YOOKASSA_WEBHOOK_TRUSTED_PROXIES (fail-closed)"
            )
