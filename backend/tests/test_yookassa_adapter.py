"""YooKassa adapter + checkout pay / webhook (Этап 6.10B)."""
from __future__ import annotations

import base64
import json
import os
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from backend.models.user import User
from backend.payments.base import PaymentProviderError
from backend.payments.dto import CreatePaymentRequest, NormalizedPaymentStatus
from backend.payments.providers.yookassa import (
    YooKassaPaymentProvider,
    is_yookassa_webhook_ip,
)
from backend.payments.registry import clear_provider_cache, get_payment_provider
from backend.settings import settings


@pytest.fixture
def db(client):
    from backend.tests.conftest import TestingSessionLocal

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _provider() -> YooKassaPaymentProvider:
    return YooKassaPaymentProvider(shop_id="123456", secret_key="test_secret_key_value")


def test_webhook_ip_allowlist():
    assert is_yookassa_webhook_ip("185.71.76.1")
    assert is_yookassa_webhook_ip("77.75.156.11")
    assert not is_yookassa_webhook_ip("8.8.8.8")
    assert not is_yookassa_webhook_ip(None)


def test_yookassa_rejects_non_official_api_base():
    with pytest.raises(PaymentProviderError) as exc:
        YooKassaPaymentProvider(
            shop_id="1",
            secret_key="abcdefgh",
            api_base="https://evil.example/v3",
        )
    assert exc.value.code == "invalid_api_base"


def test_verify_credentials_success(monkeypatch):
    p = _provider()

    class Resp:
        status_code = 200
        content = b'{"items":[]}'

        def json(self):
            return {"items": []}

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.request.return_value = Resp()
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock_client):
        ok, msg = p.verify_credentials()
    assert ok is True
    assert "приняты" in msg.lower() or "ЮKassa" in msg


def test_verify_credentials_invalid():
    p = _provider()

    class Resp:
        status_code = 401
        content = b"{}"

        def json(self):
            return {}

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.request.return_value = Resp()
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock_client):
        ok, msg = p.verify_credentials()
    assert ok is False


def test_create_payment_maps_confirmation(monkeypatch):
    p = _provider()

    class Resp:
        status_code = 200
        content = b"ok"

        def json(self):
            return {
                "id": "pay_1",
                "status": "pending",
                "confirmation": {"confirmation_url": "https://yoomoney.ru/checkout/payments/v2/contract?orderId=1"},
            }

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.request.return_value = Resp()
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock_client):
        result = p.create_payment(
            CreatePaymentRequest(
                amount=Decimal("199.00"),
                currency="RUB",
                description="test",
                idempotency_key="idem-1",
                return_url="https://example.com/ok",
            )
        )
    assert result.provider_payment_id == "pay_1"
    assert result.confirmation_url
    assert result.status == NormalizedPaymentStatus.PENDING
    # amount must come from request snapshot path — body checked via call
    call_kwargs = mock_client.request.call_args
    body = call_kwargs.kwargs.get("json") or call_kwargs[1].get("json")
    assert body["amount"]["value"] == "199.00"
    assert body["amount"]["currency"] == "RUB"


def test_webhook_parses_and_refetches(monkeypatch):
    p = _provider()
    payload = {
        "event": "payment.succeeded",
        "object": {
            "id": "pay_ok",
            "status": "succeeded",
            "amount": {"value": "10.00", "currency": "RUB"},
            "metadata": {"checkout_intent_id": "5"},
        },
    }
    body = json.dumps(payload).encode()

    class Resp:
        status_code = 200
        content = b"ok"

        def json(self):
            return {
                "id": "pay_ok",
                "status": "succeeded",
                "amount": {"value": "10.00", "currency": "RUB"},
            }

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.request.return_value = Resp()
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock_client):
        event = p.verify_and_parse_webhook(headers={}, body=body, payload=payload)
    assert event.provider_payment_id == "pay_ok"
    assert event.status == NormalizedPaymentStatus.SUCCEEDED
    assert event.amount == Decimal("10.00")


def test_registry_builds_yookassa_with_credentials(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "YOOKASSA_SHOP_ID", None)
    monkeypatch.setattr(settings, "YOOKASSA_SECRET_KEY", None)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDERS_AVAILABLE", "yookassa")
    clear_provider_cache()
    provider = get_payment_provider(
        "yookassa",
        credentials={"shop_id": "42", "secret_key": "live_secret_key"},
    )
    assert provider.name == "yookassa"
    assert provider.is_fake is False


def test_pay_and_webhook_flow(client, db, monkeypatch):
    from backend.models.checkout import CheckoutIntent, CheckoutIntentStatus, CheckoutProductType
    from backend.tests.conftest import get_user_id, register_and_get_token

    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "ALLOW_FAKE_PAYMENT_PROVIDER", True)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER_TEST_MODE", True)
    key = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
    monkeypatch.setattr(settings, "PAYMENT_CREDENTIALS_MASTER_KEY", key)

    owner_auth = register_and_get_token(client)
    owner_id = get_user_id(client, owner_auth)
    owner = db.query(User).filter(User.id == owner_id).one()
    owner.role = "owner"
    db.commit()
    owner_headers = {"Authorization": owner_auth}

    user_auth = register_and_get_token(client)
    user_id = get_user_id(client, user_auth)
    headers = {"Authorization": user_auth}

    class VerifyResp:
        status_code = 200
        content = b'{"items":[]}'

        def json(self):
            return {"items": []}

    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.request.return_value = VerifyResp()

    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock_client):
        created = client.post(
            "/api/admin/payment-provider-connections",
            headers=owner_headers,
            json={
                "provider_code": "yookassa",
                "connection_name": "YK Main",
                "mode": "test",
                "credentials": {"shop_id": "123", "secret_key": "test_secret_key_xx"},
            },
        )
        assert created.status_code == 201, created.text
        cid = created.json()["id"]
        verified = client.post(
            f"/api/admin/payment-provider-connections/{cid}/verify",
            headers=owner_headers,
        )
        assert verified.status_code == 200
        assert verified.json()["verified"] is True
        enabled = client.patch(
            f"/api/admin/payment-provider-connections/{cid}",
            headers=owner_headers,
            json={"enabled": True},
        )
        assert enabled.status_code == 200
        default = client.post(
            f"/api/admin/payment-provider-connections/{cid}/set-default",
            headers=owner_headers,
        )
        assert default.status_code == 200

    intent = CheckoutIntent(
        user_id=user_id,
        product_type=CheckoutProductType.TARIFF.value,
        product_code="start",
        product_name="Старт",
        amount=Decimal("199.00"),
        currency="RUB",
        status=CheckoutIntentStatus.PENDING.value,
        idempotency_key="pay-intent-1",
    )
    db.add(intent)
    db.commit()
    db.refresh(intent)

    class CreateResp:
        status_code = 200
        content = b"ok"

        def json(self):
            return {
                "id": "yk_pay_99",
                "status": "pending",
                "confirmation": {"confirmation_url": "https://yoomoney.ru/checkout/test"},
            }

    mock_client.request.return_value = CreateResp()
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock_client):
        pay = client.post(
            f"/me/checkout-intents/{intent.id}/pay",
            headers=headers,
            json={"idempotency_key": "pay-key-1", "return_url": "https://example.com/ok"},
        )
    assert pay.status_code == 200, pay.text
    body = pay.json()
    assert body["confirmation_url"]
    assert body["provider_payment_id"] == "yk_pay_99"

    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock_client):
        pay2 = client.post(
            f"/me/checkout-intents/{intent.id}/pay",
            headers=headers,
            json={"idempotency_key": "pay-key-1", "return_url": "https://example.com/ok"},
        )
    assert pay2.status_code == 200
    assert pay2.json()["already_started"] is True

    other_auth = register_and_get_token(client)
    forbidden = client.post(
        f"/me/checkout-intents/{intent.id}/pay",
        headers={"Authorization": other_auth},
        json={"idempotency_key": "other-key"},
    )
    assert forbidden.status_code in (403, 404)

    class StatusResp:
        status_code = 200
        content = b"ok"

        def json(self):
            return {
                "id": "yk_pay_99",
                "status": "succeeded",
                "amount": {"value": "199.00", "currency": "RUB"},
            }

    mock_client.request.return_value = StatusResp()
    hook_payload = {
        "event": "payment.succeeded",
        "object": {
            "id": "yk_pay_99",
            "status": "succeeded",
            "amount": {"value": "199.00", "currency": "RUB"},
            "metadata": {
                "checkout_intent_id": str(intent.id),
                "user_id": str(user_id),
            },
        },
    }
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock_client):
        hook = client.post("/webhooks/payments/yookassa", json=hook_payload)
    assert hook.status_code == 200
    assert hook.json().get("ok") is True

    db.refresh(intent)
    assert intent.status in ("paid", "fulfilled")

    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock_client):
        hook2 = client.post("/webhooks/payments/yookassa", json=hook_payload)
    assert hook2.status_code == 200
