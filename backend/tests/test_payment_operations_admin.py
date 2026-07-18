"""
Этап 6.11.3: админ-журнал платёжных операций (безопасный API).
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
    PaymentAttempt,
    PaymentAttemptStatus,
    PaymentWebhookEvent,
    PaymentWebhookProcessStatus,
)
from backend.models.plan import Plan
from backend.models.tariff import UserSubscription
from backend.models.user import User
from backend.tests.conftest import get_user_id, register_and_get_token


@pytest.fixture
def db(client):
    from backend.tests.conftest import TestingSessionLocal

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _auth(client, db, *, role: str | None = None):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    if role:
        user = db.query(User).filter(User.id == uid).one()
        user.role = role
        db.commit()
    return {"Authorization": token}, uid


def _utc(days_ago: int = 0) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days_ago)


def _seed_operation(db, user_id: int, *, key: str, status: str = "fulfilled"):
    intent = CheckoutIntent(
        user_id=user_id,
        product_type=CheckoutProductType.TARIFF.value,
        product_code="start",
        product_name="Старт",
        amount=Decimal("199.00"),
        currency="RUB",
        status=status,
        idempotency_key=key,
        payment_provider="yookassa",
        provider_payment_id=f"yk_{key}",
        created_at=_utc(1),
        paid_at=_utc(1) if status in ("paid", "fulfilled") else None,
        fulfilled_at=_utc(0) if status == "fulfilled" else None,
    )
    db.add(intent)
    db.flush()

    attempt = PaymentAttempt(
        checkout_intent_id=intent.id,
        user_id=user_id,
        provider="yookassa",
        provider_payment_id=f"yk_{key}",
        amount=intent.amount,
        currency="RUB",
        status=(
            PaymentAttemptStatus.SUCCEEDED.value
            if status in ("paid", "fulfilled")
            else PaymentAttemptStatus.PENDING.value
        ),
        idempotency_key=f"pay-{key}",
        confirmation_url="https://yoomoney.ru/checkout/test",
    )
    db.add(attempt)
    db.flush()

    event = PaymentWebhookEvent(
        provider="yookassa",
        provider_event_id=f"evt-{key}",
        event_type="payment.succeeded",
        payload={
            "secret_key": "MUST_NOT_LEAK",
            "Authorization": "Basic abc",
            "object": {"id": f"yk_{key}"},
        },
        payment_attempt_id=attempt.id,
        checkout_intent_id=intent.id,
        process_status=PaymentWebhookProcessStatus.PROCESSED.value,
        processed_at=_utc(0),
    )
    db.add(event)

    if status == "fulfilled":
        plan = db.query(Plan).filter(Plan.code == "start").first()
        if plan is None:
            plan = Plan(
                code="start",
                name="Старт",
                price_month=Decimal("199.00"),
                currency="RUB",
                is_active=True,
                limits={},
            )
            db.add(plan)
            db.flush()
        sub = UserSubscription(
            user_id=user_id,
            plan_id=plan.id,
            current_period_start=_utc(0),
            current_period_end=_utc(-30),
            payment_provider="yookassa",
            provider_subscription_id=f"yookassa:yk_{key}",
        )
        db.add(sub)
        db.flush()
        intent.fulfilled_subscription_id = sub.id

    db.commit()
    db.refresh(intent)
    return intent, attempt, event


FORBIDDEN_MARKERS = (
    "secret_key",
    "MUST_NOT_LEAK",
    "ciphertext",
    "credentials_ciphertext",
    "credentials_nonce",
    "credentials_auth_tag",
    "Authorization",
    "Basic abc",
    "traceback",
    "Traceback",
)


def _assert_no_secrets(payload) -> None:
    blob = json.dumps(payload, default=str)
    for marker in FORBIDDEN_MARKERS:
        assert marker not in blob, f"secret marker leaked: {marker}"
    assert "payload" not in payload.get("webhook_events", [{}])[0] if payload.get(
        "webhook_events"
    ) else True


def test_regular_user_forbidden(client, db):
    # Первый зарегистрированный пользователь — owner; создаём decoy.
    _auth(client, db)
    headers, uid = _auth(client, db)
    user = db.query(User).filter(User.id == uid).one()
    assert user.role == "user"
    res = client.get("/api/admin/payments/operations", headers=headers)
    assert res.status_code == 403


def test_list_filters_and_pagination(client, db):
    owner_headers, _ = _auth(client, db, role="owner")
    user_headers, user_id = _auth(client, db)
    other_headers, other_id = _auth(client, db)

    _seed_operation(db, user_id, key="ops-a1", status="fulfilled")
    _seed_operation(db, user_id, key="ops-a2", status="awaiting_payment")
    _seed_operation(db, other_id, key="ops-b1", status="cancelled")

    all_list = client.get(
        "/api/admin/payments/operations",
        headers=owner_headers,
        params={"limit": 10, "offset": 0},
    )
    assert all_list.status_code == 200, all_list.text
    body = all_list.json()
    assert body["total"] >= 3
    assert body["limit"] == 10
    assert body["offset"] == 0
    assert len(body["items"]) >= 3
    _assert_no_secrets(body)

    by_user = client.get(
        "/api/admin/payments/operations",
        headers=owner_headers,
        params={"user_id": user_id},
    )
    assert by_user.status_code == 200
    assert all(i["user_id"] == user_id for i in by_user.json()["items"])
    assert by_user.json()["total"] >= 2

    by_status = client.get(
        "/api/admin/payments/operations",
        headers=owner_headers,
        params={"status": "cancelled"},
    )
    assert by_status.status_code == 200
    assert all(i["status"] == "cancelled" for i in by_status.json()["items"])

    by_provider = client.get(
        "/api/admin/payments/operations",
        headers=owner_headers,
        params={"provider": "yookassa"},
    )
    assert by_provider.status_code == 200
    assert by_provider.json()["total"] >= 3

    intent_id = (
        db.query(CheckoutIntent)
        .filter(CheckoutIntent.idempotency_key == "ops-a1")
        .one()
        .id
    )
    by_intent = client.get(
        "/api/admin/payments/operations",
        headers=owner_headers,
        params={"checkout_intent_id": intent_id},
    )
    assert by_intent.status_code == 200
    assert by_intent.json()["total"] == 1
    assert by_intent.json()["items"][0]["checkout_intent_id"] == intent_id

    page1 = client.get(
        "/api/admin/payments/operations",
        headers=owner_headers,
        params={"limit": 1, "offset": 0},
    )
    page2 = client.get(
        "/api/admin/payments/operations",
        headers=owner_headers,
        params={"limit": 1, "offset": 1},
    )
    assert page1.status_code == 200 and page2.status_code == 200
    assert page1.json()["items"][0]["checkout_intent_id"] != page2.json()["items"][0][
        "checkout_intent_id"
    ]


def test_detail_links_intent_attempt_webhook_fulfillment(client, db):
    owner_headers, _ = _auth(client, db, role="owner")
    _, user_id = _auth(client, db)
    intent, attempt, event = _seed_operation(
        db, user_id, key="ops-detail-1", status="fulfilled"
    )

    res = client.get(
        f"/api/admin/payments/operations/{intent.id}",
        headers=owner_headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["checkout_intent_id"] == intent.id
    assert body["user_id"] == user_id
    assert body["status"] == "fulfilled"
    assert len(body["attempts"]) == 1
    assert body["attempts"][0]["id"] == attempt.id
    assert body["attempts"][0]["provider_payment_id"] == attempt.provider_payment_id
    assert len(body["webhook_events"]) == 1
    assert body["webhook_events"][0]["id"] == event.id
    assert body["webhook_events"][0]["process_status"] == "processed"
    assert "payload" not in body["webhook_events"][0]
    assert body["fulfillment"]["fulfilled"] is True
    assert body["fulfillment"]["fulfilled_subscription_id"] is not None
    assert body["fulfillment"]["subscription"] is not None
    assert body["fulfillment"]["subscription"]["id"] == intent.fulfilled_subscription_id
    _assert_no_secrets(body)


def test_detail_not_found_and_admin_role(client, db):
    admin_headers, _ = _auth(client, db, role="admin")
    res = client.get("/api/admin/payments/operations/999999", headers=admin_headers)
    assert res.status_code == 404
    assert res.json()["detail"]["code"] == "intent_not_found"


def test_period_filter(client, db):
    owner_headers, _ = _auth(client, db, role="owner")
    _, user_id = _auth(client, db)
    intent, _, _ = _seed_operation(db, user_id, key="ops-period-1")

    far_future = (_utc(-365)).isoformat()
    empty = client.get(
        "/api/admin/payments/operations",
        headers=owner_headers,
        params={"date_from": far_future, "checkout_intent_id": intent.id},
    )
    assert empty.status_code == 200
    assert empty.json()["total"] == 0

    past = (_utc(30)).isoformat()
    found = client.get(
        "/api/admin/payments/operations",
        headers=owner_headers,
        params={"date_from": past, "checkout_intent_id": intent.id},
    )
    assert found.status_code == 200
    assert found.json()["total"] == 1
