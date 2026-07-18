"""Этап 6.12.2: trusted proxy IP, production fail-closed, YooKassa diagnostics."""
from __future__ import annotations

import pytest
from starlette.requests import Request

from backend.models.payment_provider_connection import PaymentProviderConnection
from backend.models.user import User
from backend.payments.yookassa_webhook_security import (
    assert_production_yookassa_webhook_safety,
    resolve_yookassa_webhook_client_ip,
    yookassa_webhook_ip_check_skipped,
)
from backend.services.yookassa_diagnostics import build_yookassa_diagnostics
from backend.settings import settings
from backend.tests.conftest import get_user_id, register_and_get_token


@pytest.fixture
def db(client):
    from backend.tests.conftest import TestingSessionLocal

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _make_request(
    *,
    peer: str,
    headers: dict[str, str] | None = None,
) -> Request:
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "https",
        "path": "/webhooks/payments/yookassa",
        "raw_path": b"/webhooks/payments/yookassa",
        "query_string": b"",
        "headers": [
            (k.lower().encode(), v.encode()) for k, v in (headers or {}).items()
        ],
        "client": (peer, 12345),
        "server": ("testserver", 443),
    }
    return Request(scope)


def test_default_uses_peer_ignores_forwarded(monkeypatch):
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUST_PROXY", False)
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUSTED_PROXIES", "127.0.0.1")
    req = _make_request(
        peer="10.0.0.5",
        headers={"x-forwarded-for": "185.71.76.1", "x-real-ip": "185.71.76.1"},
    )
    assert resolve_yookassa_webhook_client_ip(req) == "10.0.0.5"


def test_trusted_proxy_uses_forwarded_client(monkeypatch):
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUST_PROXY", True)
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUSTED_PROXIES", "127.0.0.1")
    req = _make_request(
        peer="127.0.0.1",
        headers={"x-forwarded-for": "185.71.76.1, 127.0.0.1"},
    )
    assert resolve_yookassa_webhook_client_ip(req) == "185.71.76.1"


def test_trusted_proxy_prefers_x_real_ip(monkeypatch):
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUST_PROXY", True)
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUSTED_PROXIES", "10.0.0.0/8")
    req = _make_request(
        peer="10.1.2.3",
        headers={
            "x-real-ip": "77.75.156.11",
            "x-forwarded-for": "8.8.8.8",
        },
    )
    assert resolve_yookassa_webhook_client_ip(req) == "77.75.156.11"


def test_spoofed_forwarded_from_untrusted_peer_ignored(monkeypatch):
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUST_PROXY", True)
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUSTED_PROXIES", "127.0.0.1")
    req = _make_request(
        peer="8.8.8.8",
        headers={"x-forwarded-for": "185.71.76.1"},
    )
    assert resolve_yookassa_webhook_client_ip(req) == "8.8.8.8"


def test_trust_proxy_without_allowlist_ignores_headers(monkeypatch):
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUST_PROXY", True)
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUSTED_PROXIES", "")
    req = _make_request(
        peer="127.0.0.1",
        headers={"x-forwarded-for": "185.71.76.1"},
    )
    assert resolve_yookassa_webhook_client_ip(req) == "127.0.0.1"


def test_production_never_skips_ip_check(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_SKIP_IP_CHECK", True)
    assert yookassa_webhook_ip_check_skipped() is False


def test_production_rejects_skip_ip_at_assert(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_SKIP_IP_CHECK", True)
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUST_PROXY", False)
    with pytest.raises(RuntimeError, match="YOOKASSA_WEBHOOK_SKIP_IP_CHECK"):
        assert_production_yookassa_webhook_safety()


def test_production_rejects_trust_proxy_without_allowlist(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_SKIP_IP_CHECK", False)
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUST_PROXY", True)
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUSTED_PROXIES", "")
    with pytest.raises(RuntimeError, match="TRUSTED_PROXIES"):
        assert_production_yookassa_webhook_safety()


def test_production_accepts_safe_webhook_config(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_SKIP_IP_CHECK", False)
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUST_PROXY", True)
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUSTED_PROXIES", "10.0.0.1")
    assert_production_yookassa_webhook_safety()


def test_diagnostics_missing_no_secrets(db, monkeypatch):
    monkeypatch.setattr(settings, "YOOKASSA_REDIRECT_URL", "")
    monkeypatch.setattr(settings, "FRONTEND_URL", "")
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_SKIP_IP_CHECK", False)
    monkeypatch.setattr(settings, "TESTING", False)
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUST_PROXY", False)

    data = build_yookassa_diagnostics(db)
    assert data["readiness"] == "missing"
    assert data["has_connection"] is False
    assert "no_connection" in data["issues"]
    blob = str(data).lower()
    for forbidden in (
        "secret",
        "shop_id",
        "shopid",
        "ciphertext",
        "test_secret",
        "password",
        "authorization",
    ):
        assert forbidden not in blob


def test_diagnostics_partial_and_ready(db, monkeypatch):
    monkeypatch.setattr(settings, "YOOKASSA_REDIRECT_URL", "https://app.example/billing")
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_SKIP_IP_CHECK", False)
    monkeypatch.setattr(settings, "TESTING", False)
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUST_PROXY", False)

    row = PaymentProviderConnection(
        provider_code="yookassa",
        connection_name="Sandbox",
        mode="test",
        enabled=True,
        verified=False,
        is_default=False,
        currency="RUB",
        credentials_version=1,
        credentials_key_id="default",
        credentials_encryption_version=1,
        credentials_nonce=b"n" * 12,
        credentials_ciphertext=b"c" * 16,
        credentials_auth_tag=b"t" * 16,
    )
    db.add(row)
    db.commit()

    partial = build_yookassa_diagnostics(db)
    assert partial["readiness"] == "partial"
    assert partial["has_connection"] is True
    assert "not_verified" in partial["issues"]
    assert "ciphertext" not in str(partial).lower()
    assert b"c" * 16 not in str(partial).encode()

    row.verified = True
    row.is_default = True
    db.commit()

    ready = build_yookassa_diagnostics(db)
    assert ready["readiness"] == "ready"
    assert ready["mode"] == "test"
    assert ready["webhook_route"] == "/webhooks/payments/yookassa"
    assert ready["issues"] == []
    assert ready["webhook_ip_check_enabled"] is True
    assert ready["return_url_configured"] is True


def test_diagnostics_endpoint_auth_and_safe_fields(client, db, monkeypatch):
    monkeypatch.setattr(settings, "YOOKASSA_REDIRECT_URL", "https://app.example/ok")
    monkeypatch.setattr(settings, "TESTING", False)
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_SKIP_IP_CHECK", False)
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")

    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    user = db.query(User).filter(User.id == uid).one()
    user.role = "owner"
    db.commit()
    headers = {"Authorization": token}

    res = client.get("/api/admin/payments/yookassa/diagnostics", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["provider"] == "yookassa"
    assert body["readiness"] in ("missing", "partial", "ready")
    assert "webhook_route" in body
    text = res.text.lower()
    for forbidden in ("secret_key", "shop_id", "ciphertext", "nonce", "auth_tag"):
        assert forbidden not in text

    stranger = register_and_get_token(client)
    denied = client.get(
        "/api/admin/payments/yookassa/diagnostics",
        headers={"Authorization": stranger},
    )
    assert denied.status_code in (401, 403)


def test_webhook_uses_resolved_ip_allowlist(client, monkeypatch):
    """Peer не из allowlist → 403; при trust+proxy header с IP ЮKassa → дальше JSON path."""
    monkeypatch.setattr(settings, "TESTING", False)
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_SKIP_IP_CHECK", False)
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUST_PROXY", False)

    bad = client.post(
        "/webhooks/payments/yookassa",
        json={"event": "payment.succeeded", "object": {"id": "x"}},
    )
    assert bad.status_code == 403

    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUST_PROXY", True)
    monkeypatch.setattr(settings, "YOOKASSA_WEBHOOK_TRUSTED_PROXIES", "testclient")

    # Starlette TestClient peer is typically "testclient"
    # Spoof: untrusted mapping — if peer isn't in networks, still 403
    # "testclient" is not a valid IP → parse fails → not trusted → peer used → 403
    spoof = client.post(
        "/webhooks/payments/yookassa",
        json={"event": "payment.succeeded", "object": {"id": "x"}},
        headers={"X-Forwarded-For": "185.71.76.1"},
    )
    assert spoof.status_code == 403

    # Force resolve to allowlisted IP via monkeypatch of resolver
    monkeypatch.setattr(
        "backend.routers.checkout_pay.resolve_yookassa_webhook_client_ip",
        lambda _req: "185.71.76.1",
    )
    # Unknown payment → 200 ignored (no provider call if no attempt)
    ok = client.post(
        "/webhooks/payments/yookassa",
        json={"event": "payment.succeeded", "object": {"id": "pay_unknown"}},
    )
    assert ok.status_code == 200
    assert ok.json().get("ignored") is True
