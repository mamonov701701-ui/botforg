"""
Этап 6.11.2B: concurrency / IntegrityError recovery + orphan provider payment.
"""
from __future__ import annotations

import base64
import os
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.exc import IntegrityError

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
    PaymentAttempt,
    PaymentAttemptStatus,
    PaymentWebhookEvent,
    PaymentWebhookProcessStatus,
)
from backend.models.user import User
from backend.payments.dto import CreatePaymentResult, NormalizedPaymentStatus
from backend.services.payment_fulfillment import (
    create_payment_attempt,
    fulfill_paid_intent,
)
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
    mock = _mock_httpx({"items": []})
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock):
        created = client.post(
            "/api/admin/payment-provider-connections",
            headers=owner_headers,
            json={
                "provider_code": "yookassa",
                "connection_name": "YK Concurrency",
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


def _pending_intent(db, user_id: int, key: str = "intent-c1") -> CheckoutIntent:
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


def test_create_payment_attempt_integrity_error_returns_existing(client, db):
    """Concurrent insert on unique (intent, idempotency_key) → recover, no raise."""
    _, user_id = _auth_headers(client, db)
    intent = _pending_intent(db, user_id, key="cpa-ie-1")
    key = "pay-key-race01"

    real_commit = db.commit
    injected = {"done": False}

    def commit_with_race():
        if not injected["done"]:
            injected["done"] = True
            other = TestingSessionLocal()
            try:
                other.add(
                    PaymentAttempt(
                        checkout_intent_id=intent.id,
                        user_id=user_id,
                        provider="yookassa",
                        provider_payment_id="yk_race_win",
                        amount=intent.amount,
                        currency="RUB",
                        status=PaymentAttemptStatus.PENDING.value,
                        idempotency_key=key,
                        confirmation_url="https://yoomoney.ru/checkout/win",
                    )
                )
                other.commit()
            finally:
                other.close()
        return real_commit()

    db.commit = commit_with_race  # type: ignore[method-assign]
    try:
        recovered = create_payment_attempt(
            db,
            checkout_intent_id=intent.id,
            user_id=user_id,
            idempotency_key=key,
            provider="yookassa",
            provider_payment_id="yk_race_lose",
            confirmation_url="https://yoomoney.ru/checkout/lose",
            commit=True,
        )
    finally:
        db.commit = real_commit  # type: ignore[method-assign]

    assert recovered.provider_payment_id == "yk_race_win"
    assert recovered.idempotency_key == key
    assert (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.checkout_intent_id == intent.id)
        .count()
        == 1
    )


def test_pay_integrity_error_no_http_500(client, db, monkeypatch):
    """Concurrent /pay IntegrityError → 200 + existing attempt, no second row."""
    owner_headers, _ = _auth_headers(client, db, role="owner")
    user_headers, user_id = _auth_headers(client, db)
    _ensure_yookassa_default(client, db, owner_headers, monkeypatch)
    intent = _pending_intent(db, user_id, key="pay-ie-1")
    key = "pay-key-ie0001"

    from backend.services import payment_fulfillment as pf

    real_cpa = pf.create_payment_attempt

    def cpa_race(db_sess, **kwargs):
        other = TestingSessionLocal()
        try:
            if (
                other.query(PaymentAttempt)
                .filter(
                    PaymentAttempt.checkout_intent_id == kwargs["checkout_intent_id"],
                    PaymentAttempt.idempotency_key == kwargs["idempotency_key"],
                )
                .first()
                is None
            ):
                other.add(
                    PaymentAttempt(
                        checkout_intent_id=kwargs["checkout_intent_id"],
                        user_id=kwargs["user_id"],
                        provider=kwargs.get("provider") or "yookassa",
                        provider_payment_id="yk_pay_ie_win",
                        amount=Decimal("199.00"),
                        currency="RUB",
                        status=PaymentAttemptStatus.PENDING.value,
                        idempotency_key=kwargs["idempotency_key"],
                        confirmation_url="https://yoomoney.ru/checkout/ie-win",
                    )
                )
                other.commit()
        finally:
            other.close()

        # Race window: early existing-check misses; commit hits unique.
        real_commit = db_sess.commit
        seen = {"n": 0}
        original_query = db_sess.query

        def query_proxy(model):
            q = original_query(model)
            if model is not PaymentAttempt:
                return q
            real_filter = q.filter

            def filter_wrap(*a, **k):
                fq = real_filter(*a, **k)
                real_first = fq.first

                def first_wrap():
                    seen["n"] += 1
                    # First PaymentAttempt.first() is existing-by-key check.
                    if seen["n"] == 1:
                        return None
                    return real_first()

                fq.first = first_wrap  # type: ignore[method-assign]
                return fq

            q.filter = filter_wrap  # type: ignore[method-assign]
            return q

        def boom_commit():
            raise IntegrityError("INSERT payment_attempts", {}, Exception("UNIQUE"))

        db_sess.query = query_proxy  # type: ignore[method-assign]
        db_sess.commit = boom_commit  # type: ignore[method-assign]
        try:
            return real_cpa(db_sess, **kwargs)
        finally:
            db_sess.query = original_query  # type: ignore[method-assign]
            db_sess.commit = real_commit  # type: ignore[method-assign]

    mock = _mock_httpx(
        {
            "id": "yk_pay_ie_new",
            "status": "pending",
            "confirmation": {"confirmation_url": "https://yoomoney.ru/checkout/ie-new"},
        }
    )
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock):
        with patch(
            "backend.services.checkout_pay.create_payment_attempt",
            side_effect=cpa_race,
        ):
            res = client.post(
                f"/me/checkout-intents/{intent.id}/pay",
                headers=user_headers,
                json={"idempotency_key": key},
            )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["provider_payment_id"] == "yk_pay_ie_win"
    assert (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.checkout_intent_id == intent.id)
        .count()
        == 1
    )


def test_concurrent_duplicate_webhook_no_500(client, db, monkeypatch):
    """Unique provider_event_id race → already processed, not HTTP 500."""
    owner_headers, _ = _auth_headers(client, db, role="owner")
    user_headers, user_id = _auth_headers(client, db)
    _ensure_yookassa_default(client, db, owner_headers, monkeypatch)
    intent = _pending_intent(db, user_id, key="wh-race-1")

    mock = _mock_httpx(
        {
            "id": "yk_wh_race",
            "status": "pending",
            "confirmation": {"confirmation_url": "https://yoomoney.ru/checkout/wh"},
        }
    )
    with patch("backend.payments.providers.yookassa.httpx.Client", return_value=mock):
        pay = client.post(
            f"/me/checkout-intents/{intent.id}/pay",
            headers=user_headers,
            json={"idempotency_key": "pay-key-whrace"},
        )
    assert pay.status_code == 200, pay.text
    attempt = (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.checkout_intent_id == intent.id)
        .one()
    )

    event_id = "evt-race-dup-1"
    other = TestingSessionLocal()
    try:
        other.add(
            PaymentWebhookEvent(
                provider="yookassa",
                provider_event_id=event_id,
                event_type="payment.succeeded",
                payload={"id": "yk_wh_race"},
                checkout_intent_id=intent.id,
                payment_attempt_id=attempt.id,
                process_status=PaymentWebhookProcessStatus.PROCESSED.value,
            )
        )
        intent_row = (
            other.query(CheckoutIntent).filter(CheckoutIntent.id == intent.id).one()
        )
        intent_row.status = CheckoutIntentStatus.FULFILLED.value
        att = other.query(PaymentAttempt).filter(PaymentAttempt.id == attempt.id).one()
        att.status = PaymentAttemptStatus.SUCCEEDED.value
        other.commit()
    finally:
        other.close()

    db.expire_all()

    # Concurrent loser: existing-event lookup misses once, flush hits unique.
    real_query = db.query
    real_flush = db.flush
    seen = {"n": 0}

    def query_hide_first_event(model):
        q = real_query(model)
        if model is not PaymentWebhookEvent:
            return q
        real_filter = q.filter

        def filter_wrap(*a, **k):
            fq = real_filter(*a, **k)
            real_first = fq.first

            def first_wrap():
                seen["n"] += 1
                if seen["n"] == 1:
                    return None
                return real_first()

            fq.first = first_wrap  # type: ignore[method-assign]
            return fq

        q.filter = filter_wrap  # type: ignore[method-assign]
        return q

    def flush_conflict(*a, **k):
        raise IntegrityError(
            "INSERT payment_webhook_events", {}, Exception("UNIQUE")
        )

    db.query = query_hide_first_event  # type: ignore[method-assign]
    db.flush = flush_conflict  # type: ignore[method-assign]
    try:
        raced = fulfill_paid_intent(
            db,
            checkout_intent_id=intent.id,
            user_id=user_id,
            provider="yookassa",
            provider_payment_id="yk_wh_race",
            provider_event_id=event_id,
            event_type="payment.succeeded",
            amount=Decimal("199.00"),
            currency="RUB",
            payload={"id": "yk_wh_race"},
            payment_attempt_id=attempt.id,
        )
    finally:
        db.query = real_query  # type: ignore[method-assign]
        db.flush = real_flush  # type: ignore[method-assign]

    assert raced.event is not None
    assert raced.event.process_status == PaymentWebhookProcessStatus.PROCESSED.value
    assert raced.already_fulfilled is True

    mock.request.return_value = type(
        "R",
        (),
        {
            "status_code": 200,
            "content": b"ok",
            "json": lambda self: {
                "id": "yk_wh_race",
                "status": "succeeded",
                "amount": {"value": "199.00", "currency": "RUB"},
            },
        },
    )()
    hook = {
        "event": "payment.succeeded",
        "object": {
            "id": "yk_wh_race",
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
    assert http_res.status_code == 200, http_res.text
    assert http_res.json().get("ok") is True


def test_pay_retry_after_orphan_provider_payment(client, db, monkeypatch):
    """Provider payment created, attempt save failed → same key reuses idempotency."""
    owner_headers, _ = _auth_headers(client, db, role="owner")
    user_headers, user_id = _auth_headers(client, db)
    _ensure_yookassa_default(client, db, owner_headers, monkeypatch)
    intent = _pending_intent(db, user_id, key="orphan-1")
    key = "pay-key-orphan1"

    create_calls: list[str] = []

    def fake_create(self, request):
        create_calls.append(request.idempotency_key)
        return CreatePaymentResult(
            provider="yookassa",
            provider_payment_id="yk_orphan_same",
            confirmation_url="https://yoomoney.ru/checkout/orphan",
            status=NormalizedPaymentStatus.PENDING,
            raw={"id": "yk_orphan_same", "status": "pending"},
        )

    from backend.services import checkout_pay as cp_mod

    real_cpa = cp_mod.create_payment_attempt
    fail_once = {"n": 0}

    def flaky_cpa(*args, **kwargs):
        fail_once["n"] += 1
        if fail_once["n"] == 1:
            raise RuntimeError("simulated attempt persist failure")
        return real_cpa(*args, **kwargs)

    with patch(
        "backend.payments.providers.yookassa.YooKassaPaymentProvider.create_payment",
        fake_create,
    ):
        with patch(
            "backend.services.checkout_pay.create_payment_attempt",
            side_effect=flaky_cpa,
        ):
            with pytest.raises(RuntimeError, match="simulated attempt persist failure"):
                client.post(
                    f"/me/checkout-intents/{intent.id}/pay",
                    headers=user_headers,
                    json={"idempotency_key": key},
                )
        assert (
            db.query(PaymentAttempt)
            .filter(PaymentAttempt.checkout_intent_id == intent.id)
            .count()
            == 0
        )

        pay2 = client.post(
            f"/me/checkout-intents/{intent.id}/pay",
            headers=user_headers,
            json={"idempotency_key": key},
        )

    assert pay2.status_code == 200, pay2.text
    body = pay2.json()
    assert body["provider_payment_id"] == "yk_orphan_same"
    assert create_calls == [key, key]
    assert (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.checkout_intent_id == intent.id)
        .count()
        == 1
    )


def test_pay_incomplete_same_key_attaches_provider_payment(client, db, monkeypatch):
    """Incomplete local attempt (no provider id) recovers via provider idempotency."""
    owner_headers, _ = _auth_headers(client, db, role="owner")
    user_headers, user_id = _auth_headers(client, db)
    _ensure_yookassa_default(client, db, owner_headers, monkeypatch)
    intent = _pending_intent(db, user_id, key="incomp-1")
    key = "pay-key-incomp1"

    db.add(
        PaymentAttempt(
            checkout_intent_id=intent.id,
            user_id=user_id,
            provider="yookassa",
            provider_payment_id=None,
            amount=intent.amount,
            currency="RUB",
            status=PaymentAttemptStatus.PENDING.value,
            idempotency_key=key,
        )
    )
    intent.status = CheckoutIntentStatus.AWAITING_PAYMENT.value
    db.commit()

    create_calls: list[str] = []

    def fake_create(self, request):
        create_calls.append(request.idempotency_key)
        return CreatePaymentResult(
            provider="yookassa",
            provider_payment_id="yk_incomp_1",
            confirmation_url="https://yoomoney.ru/checkout/incomp",
            status=NormalizedPaymentStatus.PENDING,
            raw={"id": "yk_incomp_1"},
        )

    with patch(
        "backend.payments.providers.yookassa.YooKassaPaymentProvider.create_payment",
        fake_create,
    ):
        res = client.post(
            f"/me/checkout-intents/{intent.id}/pay",
            headers=user_headers,
            json={"idempotency_key": key},
        )

    assert res.status_code == 200, res.text
    assert res.json()["provider_payment_id"] == "yk_incomp_1"
    assert create_calls == [key]
    assert (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.checkout_intent_id == intent.id)
        .count()
        == 1
    )
