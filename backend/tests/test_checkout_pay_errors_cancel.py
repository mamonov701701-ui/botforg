"""
Этап 6.11.2C: safe provider errors + cancel unpaid checkout lifecycle.
"""
from __future__ import annotations

import base64
import os
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
    PaymentAttempt,
    PaymentAttemptStatus,
)
from backend.models.tariff import UserSubscription
from backend.models.user import User
from backend.payments.base import PaymentProviderError
from backend.payments.dto import CancelPaymentResult, NormalizedPaymentStatus
from backend.services.checkout_pay import map_payment_provider_error
from backend.services.payment_fulfillment import fulfill_paid_intent
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


def _auth_headers(client, db, *, role: str | None = None):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    if role:
        user = db.query(User).filter(User.id == uid).one()
        user.role = role
        db.commit()
    return {"Authorization": token}, uid


def _master_key(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "TESTING", True)
    monkeypatch.setattr(settings, "ALLOW_FAKE_PAYMENT_PROVIDER", True)
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER_TEST_MODE", True)
    key = base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip("=")
    monkeypatch.setattr(settings, "PAYMENT_CREDENTIALS_MASTER_KEY", key)


def _mock_httpx(json_body: dict, status_code: int = 200):
    class Resp:
        def __init__(self):
            self.status_code = status_code
            self.content = b"ok" if status_code < 400 else b"err"

        def json(self):
            return json_body

    client = MagicMock()
    client.__enter__.return_value = client
    client.__exit__.return_value = False
    client.request.return_value = Resp()
    return client


def _ensure_yookassa_default(client, db, owner_headers, monkeypatch):
    _master_key(monkeypatch)
    from backend.payments.registry import clear_provider_cache

    clear_provider_cache()
    mock = _mock_httpx({"items": []})
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock):
        created = client.post(
            "/api/admin/payment-provider-connections",
            headers=owner_headers,
            json={
                "provider_code": "yookassa",
                "connection_name": "YK Errors Cancel",
                "mode": "test",
                "credentials": {"shop_id": "123", "secret_key": "test_secret_key_xx"},
            },
        )
        assert created.status_code == 201, created.text
        cid = created.json()["id"]
        assert (
            client.post(
                f"/api/admin/payment-provider-connections/{cid}/verify",
                headers=owner_headers,
            ).status_code
            == 200
        )
        assert (
            client.patch(
                f"/api/admin/payment-provider-connections/{cid}",
                headers=owner_headers,
                json={"enabled": True},
            ).status_code
            == 200
        )
        assert (
            client.post(
                f"/api/admin/payment-provider-connections/{cid}/set-default",
                headers=owner_headers,
            ).status_code
            == 200
        )
    return cid


def _pending_intent(db, user_id: int, key: str = "intent-ec1") -> CheckoutIntent:
    intent = CheckoutIntent(
        user_id=user_id,
        product_type=CheckoutProductType.TARIFF.value,
        product_code="start",
        product_name="Старт",
        amount=Decimal("199.00"),
        currency="RUB",
        status=CheckoutIntentStatus.PENDING.value,
        idempotency_key=key,
    )
    db.add(intent)
    db.commit()
    db.refresh(intent)
    return intent


@pytest.mark.parametrize(
    "code,http_status,public_code",
    [
        ("provider_timeout", 504, "provider_timeout"),
        ("provider_network_error", 502, "provider_unavailable"),
        ("provider_http_error", 502, "provider_error"),
        ("invalid_credentials", 409, "provider_misconfigured"),
    ],
)
def test_map_payment_provider_error_safe(code, http_status, public_code):
    mapped = map_payment_provider_error(
        PaymentProviderError("RAW secret=sk_live_xxx body=...", code=code)
    )
    assert mapped.http_status == http_status
    assert mapped.code == public_code
    assert "secret" not in mapped.message.lower()
    assert "sk_live" not in mapped.message
    assert "RAW" not in mapped.message


def test_pay_provider_timeout_safe_response(client, db, monkeypatch):
    owner_headers, _ = _auth_headers(client, db, role="owner")
    user_headers, user_id = _auth_headers(client, db)
    _ensure_yookassa_default(client, db, owner_headers, monkeypatch)
    intent = _pending_intent(db, user_id, key="pay-to-1")

    def boom(self, request):
        raise PaymentProviderError("internal timeout detail", code="provider_timeout")

    with patch(
        "backend.payments.providers.yookassa.YooKassaPaymentProvider.create_payment",
        boom,
    ):
        res = client.post(
            f"/me/checkout-intents/{intent.id}/pay",
            headers=user_headers,
            json={"idempotency_key": "pay-key-timeout1"},
        )
    assert res.status_code == 504
    detail = res.json()["detail"]
    assert detail["code"] == "provider_timeout"
    assert "secret" not in str(res.json()).lower()
    assert "internal timeout" not in str(res.json())


def test_pay_no_default_connection_safe(client, db, monkeypatch):
    _master_key(monkeypatch)
    user_headers, user_id = _auth_headers(client, db)
    intent = _pending_intent(db, user_id, key="pay-nd-1")
    res = client.post(
        f"/me/checkout-intents/{intent.id}/pay",
        headers=user_headers,
        json={"idempotency_key": "pay-key-nodflt1"},
    )
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "no_default_connection"


def test_cancel_pending_intent_without_attempt(client, db, monkeypatch):
    _master_key(monkeypatch)
    user_headers, user_id = _auth_headers(client, db)
    other_headers, _ = _auth_headers(client, db)
    intent = _pending_intent(db, user_id, key="cancel-local-1")

    forbidden = client.post(
        f"/me/checkout-intents/{intent.id}/cancel",
        headers=other_headers,
    )
    assert forbidden.status_code == 404

    res = client.post(
        f"/me/checkout-intents/{intent.id}/cancel",
        headers=user_headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["intent_status"] == "cancelled"
    assert body["already_cancelled"] is False
    db.refresh(intent)
    assert intent.status == CheckoutIntentStatus.CANCELLED.value
    assert intent.cancelled_at is not None


def test_cancel_awaiting_payment_calls_provider(client, db, monkeypatch):
    owner_headers, _ = _auth_headers(client, db, role="owner")
    user_headers, user_id = _auth_headers(client, db)
    _ensure_yookassa_default(client, db, owner_headers, monkeypatch)
    intent = _pending_intent(db, user_id, key="cancel-prov-1")

    mock = _mock_httpx(
        {
            "id": "yk_cancel_1",
            "status": "pending",
            "confirmation": {"confirmation_url": "https://yoomoney.ru/checkout/c"},
        }
    )
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock):
        pay = client.post(
            f"/me/checkout-intents/{intent.id}/pay",
            headers=user_headers,
            json={"idempotency_key": "pay-key-cancel1"},
        )
    assert pay.status_code == 200, pay.text

    cancel_calls: list[str] = []

    def fake_cancel(self, provider_payment_id: str):
        cancel_calls.append(provider_payment_id)
        return CancelPaymentResult(
            provider="yookassa",
            provider_payment_id=provider_payment_id,
            status=NormalizedPaymentStatus.CANCELLED,
            raw={"status": "canceled"},
        )

    with patch(
        "backend.payments.providers.yookassa.YooKassaPaymentProvider.cancel_payment",
        fake_cancel,
    ):
        res = client.post(
            f"/me/checkout-intents/{intent.id}/cancel",
            headers=user_headers,
        )
    assert res.status_code == 200, res.text
    assert cancel_calls == ["yk_cancel_1"]
    db.refresh(intent)
    assert intent.status == CheckoutIntentStatus.CANCELLED.value
    attempt = (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.checkout_intent_id == intent.id)
        .one()
    )
    assert attempt.status == PaymentAttemptStatus.CANCELLED.value

    status = client.get(
        f"/me/checkout-intents/{intent.id}/payment",
        headers=user_headers,
    )
    assert status.status_code == 200
    view = status.json()
    assert view["normalized_status"] == "cancelled"
    assert view["is_final"] is True
    assert view["can_retry"] is False
    assert "отмен" in view["message"].lower()


def test_cancel_timeout_does_not_mark_cancelled(client, db, monkeypatch):
    owner_headers, _ = _auth_headers(client, db, role="owner")
    user_headers, user_id = _auth_headers(client, db)
    _ensure_yookassa_default(client, db, owner_headers, monkeypatch)
    intent = _pending_intent(db, user_id, key="cancel-to-1")

    mock = _mock_httpx(
        {
            "id": "yk_cancel_to",
            "status": "pending",
            "confirmation": {"confirmation_url": "https://yoomoney.ru/checkout/t"},
        }
    )
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock):
        assert (
            client.post(
                f"/me/checkout-intents/{intent.id}/pay",
                headers=user_headers,
                json={"idempotency_key": "pay-key-cancelto"},
            ).status_code
            == 200
        )

    def timeout_cancel(self, provider_payment_id: str):
        raise PaymentProviderError("timed out", code="provider_timeout")

    with patch(
        "backend.payments.providers.yookassa.YooKassaPaymentProvider.cancel_payment",
        timeout_cancel,
    ):
        res = client.post(
            f"/me/checkout-intents/{intent.id}/cancel",
            headers=user_headers,
        )
    assert res.status_code == 504
    assert res.json()["detail"]["code"] == "provider_timeout"
    db.refresh(intent)
    assert intent.status == CheckoutIntentStatus.AWAITING_PAYMENT.value
    attempt = (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.checkout_intent_id == intent.id)
        .one()
    )
    assert attempt.status == PaymentAttemptStatus.PENDING.value


def test_cancel_paid_and_fulfilled_forbidden(client, db, monkeypatch):
    _master_key(monkeypatch)
    user_headers, user_id = _auth_headers(client, db)
    paid = _pending_intent(db, user_id, key="cancel-paid-1")
    paid.status = CheckoutIntentStatus.PAID.value
    db.commit()
    res_paid = client.post(
        f"/me/checkout-intents/{paid.id}/cancel",
        headers=user_headers,
    )
    assert res_paid.status_code == 409
    assert res_paid.json()["detail"]["code"] == "intent_already_paid"

    ful = _pending_intent(db, user_id, key="cancel-ful-1")
    ful.status = CheckoutIntentStatus.FULFILLED.value
    db.commit()
    res_ful = client.post(
        f"/me/checkout-intents/{ful.id}/cancel",
        headers=user_headers,
    )
    assert res_ful.status_code == 409
    assert res_ful.json()["detail"]["code"] == "intent_already_paid"


def test_late_succeeded_after_cancel_no_entitlement(client, db, monkeypatch):
    owner_headers, _ = _auth_headers(client, db, role="owner")
    user_headers, user_id = _auth_headers(client, db)
    _ensure_yookassa_default(client, db, owner_headers, monkeypatch)
    intent = _pending_intent(db, user_id, key="late-succ-1")

    mock = _mock_httpx(
        {
            "id": "yk_late_1",
            "status": "pending",
            "confirmation": {"confirmation_url": "https://yoomoney.ru/checkout/l"},
        }
    )
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock):
        assert (
            client.post(
                f"/me/checkout-intents/{intent.id}/pay",
                headers=user_headers,
                json={"idempotency_key": "pay-key-late001"},
            ).status_code
            == 200
        )

    with patch(
        "backend.payments.providers.yookassa.YooKassaPaymentProvider.cancel_payment",
        lambda self, pid: CancelPaymentResult(
            provider="yookassa",
            provider_payment_id=pid,
            status=NormalizedPaymentStatus.CANCELLED,
        ),
    ):
        assert (
            client.post(
                f"/me/checkout-intents/{intent.id}/cancel",
                headers=user_headers,
            ).status_code
            == 200
        )

    db.refresh(intent)
    assert intent.status == CheckoutIntentStatus.CANCELLED.value

    before_subs = (
        db.query(UserSubscription).filter(UserSubscription.user_id == user_id).count()
    )
    mock.request.return_value = type(
        "R",
        (),
        {
            "status_code": 200,
            "content": b"ok",
            "json": lambda self: {
                "id": "yk_late_1",
                "status": "succeeded",
                "amount": {"value": "199.00", "currency": "RUB"},
            },
        },
    )()
    hook = {
        "event": "payment.succeeded",
        "object": {
            "id": "yk_late_1",
            "status": "succeeded",
            "amount": {"value": "199.00", "currency": "RUB"},
            "metadata": {
                "checkout_intent_id": str(intent.id),
                "user_id": str(user_id),
            },
        },
    }
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock):
        http_res = client.post("/webhooks/payments/yookassa", json=hook)
    assert http_res.status_code == 200
    assert http_res.json().get("ignored") is True
    db.refresh(intent)
    assert intent.status == CheckoutIntentStatus.CANCELLED.value
    after_subs = (
        db.query(UserSubscription).filter(UserSubscription.user_id == user_id).count()
    )
    assert after_subs == before_subs

    # Direct fulfill also blocked.
    from backend.services.payment_fulfillment import FulfillmentError

    with pytest.raises(FulfillmentError) as exc_info:
        fulfill_paid_intent(
            db,
            checkout_intent_id=intent.id,
            user_id=user_id,
            provider="yookassa",
            provider_payment_id="yk_late_1",
            provider_event_id="evt-late-after-cancel",
            event_type="payment.succeeded",
            amount=Decimal("199.00"),
            currency="RUB",
        )
    assert exc_info.value.code == "intent_not_fulfillable"


def test_payment_status_failed_attempt_message(client, db, monkeypatch):
    _master_key(monkeypatch)
    user_headers, user_id = _auth_headers(client, db)
    intent = _pending_intent(db, user_id, key="status-fail-1")
    intent.status = CheckoutIntentStatus.AWAITING_PAYMENT.value
    db.add(
        PaymentAttempt(
            checkout_intent_id=intent.id,
            user_id=user_id,
            provider="yookassa",
            provider_payment_id="yk_fail_view",
            amount=intent.amount,
            currency="RUB",
            status=PaymentAttemptStatus.FAILED.value,
            idempotency_key="pay-key-failview",
        )
    )
    db.commit()

    status = client.get(
        f"/me/checkout-intents/{intent.id}/payment",
        headers=user_headers,
    )
    assert status.status_code == 200
    body = status.json()
    assert body["normalized_status"] == "failed"
    assert body["is_final"] is True
    assert body["can_retry"] is True
    assert "платёжн" in body["message"].lower() or "оплат" in body["message"].lower()
    assert "secret" not in str(body).lower()
