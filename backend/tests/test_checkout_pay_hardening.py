"""
Этап 6.11.2A: hardening lifecycle /pay + webhook metadata + payment status view.
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
from backend.models.user import User
from backend.settings import settings
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


@pytest.fixture
def db(client):
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
            self.content = b"ok"

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
    verify_body = {"items": []}
    mock = _mock_httpx(verify_body)
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock):
        created = client.post(
            "/api/admin/payment-provider-connections",
            headers=owner_headers,
            json={
                "provider_code": "yookassa",
                "connection_name": "YK Hardening",
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


def _pending_intent(db, user_id: int, key: str = "intent-h1") -> CheckoutIntent:
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


def test_pay_different_idempotency_keys_reuse_same_attempt(client, db, monkeypatch):
    owner_headers, _ = _auth_headers(client, db, role="owner")
    user_headers, user_id = _auth_headers(client, db)
    _ensure_yookassa_default(client, db, owner_headers, monkeypatch)
    intent = _pending_intent(db, user_id)

    create_body = {
        "id": "yk_pay_one",
        "status": "pending",
        "confirmation": {"confirmation_url": "https://yoomoney.ru/checkout/a"},
    }
    mock = _mock_httpx(create_body)
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock):
        pay1 = client.post(
            f"/me/checkout-intents/{intent.id}/pay",
            headers=user_headers,
            json={"idempotency_key": "pay-key-aaa1"},
        )
        assert pay1.status_code == 200, pay1.text
        calls_after_first = mock.request.call_count
        pay2 = client.post(
            f"/me/checkout-intents/{intent.id}/pay",
            headers=user_headers,
            json={"idempotency_key": "pay-key-bbb2"},
        )
    assert pay2.status_code == 200, pay2.text
    body1, body2 = pay1.json(), pay2.json()
    assert body2["already_started"] is True
    assert body2["attempt_id"] == body1["attempt_id"]
    assert body2["provider_payment_id"] == body1["provider_payment_id"] == "yk_pay_one"
    # No second provider create_payment
    assert mock.request.call_count == calls_after_first
    attempts = (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.checkout_intent_id == intent.id)
        .count()
    )
    assert attempts == 1


def test_pay_forbidden_for_paid_and_fulfilled(client, db, monkeypatch):
    owner_headers, _ = _auth_headers(client, db, role="owner")
    user_headers, user_id = _auth_headers(client, db)
    _ensure_yookassa_default(client, db, owner_headers, monkeypatch)

    paid = _pending_intent(db, user_id, key="paid-1")
    paid.status = CheckoutIntentStatus.PAID.value
    db.commit()
    res_paid = client.post(
        f"/me/checkout-intents/{paid.id}/pay",
        headers=user_headers,
        json={"idempotency_key": "pay-key-paid1"},
    )
    assert res_paid.status_code == 409
    assert res_paid.json()["detail"]["code"] == "intent_already_paid"

    fulfilled = _pending_intent(db, user_id, key="ful-1")
    fulfilled.status = CheckoutIntentStatus.FULFILLED.value
    db.commit()
    res_ful = client.post(
        f"/me/checkout-intents/{fulfilled.id}/pay",
        headers=user_headers,
        json={"idempotency_key": "pay-key-ful01"},
    )
    assert res_ful.status_code == 409
    assert res_ful.json()["detail"]["code"] == "intent_already_fulfilled"


def test_webhook_metadata_mismatch_no_fulfill(client, db, monkeypatch):
    owner_headers, _ = _auth_headers(client, db, role="owner")
    user_headers, user_id = _auth_headers(client, db)
    _ensure_yookassa_default(client, db, owner_headers, monkeypatch)
    intent = _pending_intent(db, user_id, key="meta-1")

    mock = _mock_httpx(
        {
            "id": "yk_meta_1",
            "status": "pending",
            "confirmation": {"confirmation_url": "https://yoomoney.ru/checkout/m"},
        }
    )
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock):
        pay = client.post(
            f"/me/checkout-intents/{intent.id}/pay",
            headers=user_headers,
            json={"idempotency_key": "pay-key-meta1"},
        )
    assert pay.status_code == 200

    mock.request.return_value = type(
        "R",
        (),
        {
            "status_code": 200,
            "content": b"ok",
            "json": lambda self: {
                "id": "yk_meta_1",
                "status": "succeeded",
                "amount": {"value": "199.00", "currency": "RUB"},
            },
        },
    )()
    bad_hook = {
        "event": "payment.succeeded",
        "object": {
            "id": "yk_meta_1",
            "status": "succeeded",
            "amount": {"value": "199.00", "currency": "RUB"},
            "metadata": {
                "checkout_intent_id": str(intent.id + 999),
                "user_id": str(user_id),
            },
        },
    }
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock):
        hook = client.post("/webhooks/payments/yookassa", json=bad_hook)
    assert hook.status_code == 200
    assert hook.json()["ignored"] is True
    assert "metadata" in hook.json()["reason"]
    db.refresh(intent)
    assert intent.status != CheckoutIntentStatus.FULFILLED.value


def test_webhook_does_not_downgrade_succeeded_attempt(client, db, monkeypatch):
    owner_headers, _ = _auth_headers(client, db, role="owner")
    user_headers, user_id = _auth_headers(client, db)
    _ensure_yookassa_default(client, db, owner_headers, monkeypatch)
    intent = _pending_intent(db, user_id, key="nodown-1")

    mock = _mock_httpx(
        {
            "id": "yk_nd_1",
            "status": "pending",
            "confirmation": {"confirmation_url": "https://yoomoney.ru/checkout/n"},
        }
    )
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock):
        assert (
            client.post(
                f"/me/checkout-intents/{intent.id}/pay",
                headers=user_headers,
                json={"idempotency_key": "pay-key-nd001"},
            ).status_code
            == 200
        )

    attempt = (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.checkout_intent_id == intent.id)
        .one()
    )
    attempt.status = PaymentAttemptStatus.SUCCEEDED.value
    intent.status = CheckoutIntentStatus.FULFILLED.value
    db.commit()

    mock.request.return_value = type(
        "R",
        (),
        {
            "status_code": 200,
            "content": b"ok",
            "json": lambda self: {
                "id": "yk_nd_1",
                "status": "canceled",
                "amount": {"value": "199.00", "currency": "RUB"},
            },
        },
    )()
    hook = {
        "event": "payment.canceled",
        "object": {
            "id": "yk_nd_1",
            "status": "canceled",
            "amount": {"value": "199.00", "currency": "RUB"},
            "metadata": {
                "checkout_intent_id": str(intent.id),
                "user_id": str(user_id),
            },
        },
    }
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock):
        res = client.post("/webhooks/payments/yookassa", json=hook)
    assert res.status_code == 200
    assert res.json().get("ignored") is True
    db.refresh(attempt)
    db.refresh(intent)
    assert attempt.status == PaymentAttemptStatus.SUCCEEDED.value
    assert intent.status == CheckoutIntentStatus.FULFILLED.value


def test_payment_status_owner_schema_and_no_secrets(client, db, monkeypatch):
    owner_headers, _ = _auth_headers(client, db, role="owner")
    user_headers, user_id = _auth_headers(client, db)
    other_headers, _ = _auth_headers(client, db)
    _ensure_yookassa_default(client, db, owner_headers, monkeypatch)
    intent = _pending_intent(db, user_id, key="status-1")

    mock = _mock_httpx(
        {
            "id": "yk_st_1",
            "status": "pending",
            "confirmation": {"confirmation_url": "https://yoomoney.ru/checkout/s"},
        }
    )
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock):
        pay = client.post(
            f"/me/checkout-intents/{intent.id}/pay",
            headers=user_headers,
            json={"idempotency_key": "pay-key-st001"},
        )
    assert pay.status_code == 200

    status = client.get(
        f"/me/checkout-intents/{intent.id}/payment",
        headers=user_headers,
    )
    assert status.status_code == 200
    body = status.json()
    for key in (
        "normalized_status",
        "is_final",
        "can_retry",
        "message",
        "intent_status",
        "attempt_status",
        "confirmation_url",
    ):
        assert key in body
    assert body["normalized_status"] == "pending"
    assert body["is_final"] is False
    assert body["can_retry"] is False
    blob = str(body)
    assert "secret_key" not in blob
    assert "test_secret" not in blob
    assert "ciphertext" not in blob
    assert "raw" not in body
    assert "payload" not in body

    forbidden = client.get(
        f"/me/checkout-intents/{intent.id}/payment",
        headers=other_headers,
    )
    assert forbidden.status_code == 404


def test_pay_blocks_stale_tariff_intent_when_already_effective(client, db, monkeypatch):
    """Intent created earlier; effective plan later matches product_code → 409, no provider pay."""
    from datetime import datetime, timedelta, timezone

    from backend.models.plan import Plan
    from backend.models.tariff import SubscriptionStatus, UserSubscription

    owner_headers, _ = _auth_headers(client, db, role="owner")
    user_headers, user_id = _auth_headers(client, db)
    _ensure_yookassa_default(client, db, owner_headers, monkeypatch)

    intent = CheckoutIntent(
        user_id=user_id,
        product_type=CheckoutProductType.TARIFF.value,
        product_code="business",
        product_name="Бизнес",
        amount=Decimal("990.00"),
        currency="RUB",
        status=CheckoutIntentStatus.PENDING.value,
        idempotency_key="stale-biz-pay",
    )
    db.add(intent)
    db.commit()
    db.refresh(intent)

    plan = db.query(Plan).filter(Plan.code == "business").one()
    start = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(
        UserSubscription(
            user_id=user_id,
            plan_id=plan.id,
            status=SubscriptionStatus.ACTIVE,
            current_period_start=start,
            current_period_end=start + timedelta(days=30),
        )
    )
    db.commit()

    mock = _mock_httpx(
        {
            "id": "yk_should_not_create",
            "status": "pending",
            "confirmation": {"confirmation_url": "https://yoomoney.ru/checkout/x"},
        }
    )
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock):
        res = client.post(
            f"/me/checkout-intents/{intent.id}/pay",
            headers=user_headers,
            json={"idempotency_key": "pay-stale-biz"},
        )
    assert res.status_code == 409, res.text
    detail = res.json().get("detail") or res.json()
    assert detail.get("code") == "current_tariff_already_active"
    assert mock.request.call_count == 0
    assert (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.checkout_intent_id == intent.id)
        .count()
        == 0
    )


def test_pay_blocks_stale_addon_intent_when_addon_purchase_revoked(client, db, monkeypatch):
    """Addon intent created while allowed; later effective plan denies → 403, no provider."""
    from datetime import datetime, timedelta, timezone

    from backend.models.plan import Plan
    from backend.models.tariff import SubscriptionStatus, UserSubscription

    owner_headers, _ = _auth_headers(client, db, role="owner")
    user_headers, user_id = _auth_headers(client, db)
    _ensure_yookassa_default(client, db, owner_headers, monkeypatch)

    intent = CheckoutIntent(
        user_id=user_id,
        product_type=CheckoutProductType.ADDON.value,
        product_code="msg_1000",
        product_name="Пакет",
        amount=Decimal("190.00"),
        currency="RUB",
        status=CheckoutIntentStatus.PENDING.value,
        idempotency_key="stale-addon-pay",
    )
    db.add(intent)
    db.commit()
    db.refresh(intent)

    # Effective start (no addon_purchase).
    start_plan = db.query(Plan).filter(Plan.code == "start").one()
    start = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(
        UserSubscription(
            user_id=user_id,
            plan_id=start_plan.id,
            status=SubscriptionStatus.ACTIVE,
            current_period_start=start,
            current_period_end=start + timedelta(days=30),
        )
    )
    db.commit()

    mock = _mock_httpx(
        {
            "id": "yk_should_not_create_addon",
            "status": "pending",
            "confirmation": {"confirmation_url": "https://yoomoney.ru/checkout/x"},
        }
    )
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock):
        res = client.post(
            f"/me/checkout-intents/{intent.id}/pay",
            headers=user_headers,
            json={"idempotency_key": "pay-stale-addon"},
        )
    assert res.status_code == 403, res.text
    detail = res.json().get("detail") or res.json()
    assert detail.get("code") == "addon_not_available_for_current_tariff"
    assert mock.request.call_count == 0
    assert (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.checkout_intent_id == intent.id)
        .count()
        == 0
    )
