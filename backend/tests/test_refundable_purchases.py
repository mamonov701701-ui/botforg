"""Этап 6.14.4: GET /me/refundable-purchases."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
    PaymentAttempt,
    PaymentAttemptStatus,
)
from backend.models.refund import RefundRequest, RefundRequestStatus
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
)
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _utc() -> datetime:
    return datetime.now(timezone.utc)


def _auth(client) -> tuple[str, int]:
    auth = register_and_get_token(client)
    return auth, get_user_id(client, auth)


def _addon_pkg(db) -> AddonPackage:
    pkg = db.query(AddonPackage).filter(AddonPackage.code == "msg_1000").first()
    if pkg:
        return pkg
    pkg = AddonPackage(
        code="msg_1000",
        name_ru="+1 000 сообщений",
        type=AddonPackageType.MESSAGES,
        amount=1000,
        price=Decimal("190.00"),
        currency="RUB",
        duration_type="current_period",
        is_active=True,
        is_public=True,
        sort_order=1,
    )
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg


def _seed_purchase(
    db,
    user_id: int,
    *,
    key: str,
    amount: str = "190.00",
    intent_status: str = CheckoutIntentStatus.FULFILLED.value,
    attempt_status: str = PaymentAttemptStatus.SUCCEEDED.value,
    hours_ago: int = 1,
):
    paid_at = _utc() - timedelta(hours=hours_ago)
    pkg = _addon_pkg(db)
    addon = UserAddon(
        user_id=user_id,
        addon_package_id=pkg.id,
        amount=1000,
        period_start=paid_at,
        period_end=paid_at + timedelta(days=30),
        status=UserAddonStatus.ACTIVE.value,
        source=UserAddonSource.PURCHASE.value,
        provider_ref=f"yookassa:yk_{key}",
    )
    db.add(addon)
    db.flush()
    intent = CheckoutIntent(
        user_id=user_id,
        product_type=CheckoutProductType.ADDON.value,
        product_code=pkg.code,
        product_name=pkg.name_ru,
        amount=Decimal(amount),
        currency="RUB",
        status=intent_status,
        idempotency_key=f"ci-{key}",
        payment_provider="yookassa",
        provider_payment_id=f"yk_{key}",
        paid_at=paid_at if attempt_status == PaymentAttemptStatus.SUCCEEDED.value else None,
        fulfilled_at=paid_at
        if intent_status == CheckoutIntentStatus.FULFILLED.value
        else None,
        fulfilled_addon_id=addon.id
        if intent_status == CheckoutIntentStatus.FULFILLED.value
        else None,
    )
    db.add(intent)
    db.flush()
    attempt = PaymentAttempt(
        checkout_intent_id=intent.id,
        user_id=user_id,
        provider="yookassa",
        provider_payment_id=f"yk_{key}",
        amount=Decimal(amount),
        currency="RUB",
        status=attempt_status,
        idempotency_key=f"pay-{key}",
    )
    db.add(attempt)
    db.commit()
    db.refresh(intent)
    db.refresh(attempt)
    return intent, attempt


def _seed_refund(
    db,
    *,
    user_id: int,
    intent: CheckoutIntent,
    attempt: PaymentAttempt,
    status: str,
    key: str,
) -> RefundRequest:
    now = _utc()
    row = RefundRequest(
        user_id=user_id,
        checkout_intent_id=intent.id,
        payment_attempt_id=attempt.id,
        idempotency_key=key,
        status=status,
        reason_category="unused",
        user_comment=None,
        current_revision_number=1,
        version=1,
        submitted_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_list_refundable_purchases_happy_path(client, db):
    auth, uid = _auth(client)
    intent, attempt = _seed_purchase(db, uid, key="rp-ok", hours_ago=2)

    res = client.get(
        "/me/refundable-purchases",
        headers={"Authorization": auth},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 1
    assert body["limit"] == 20
    assert body["offset"] == 0
    assert len(body["items"]) == 1
    item = body["items"][0]
    assert item["checkout_intent_id"] == intent.id
    assert item["payment_attempt_id"] == attempt.id
    assert item["product_type"] == CheckoutProductType.ADDON.value
    assert item["product_code"] == "msg_1000"
    assert item["product_name"] == "+1 000 сообщений"
    assert item["amount"] == "190.00"
    assert item["currency"] == "RUB"
    assert item["paid_at"] is not None
    assert item["can_request_refund"] is True
    assert item["unavailable_reason"] is None
    assert item["current_refund_status"] is None
    assert set(item.keys()) == {
        "checkout_intent_id",
        "payment_attempt_id",
        "product_type",
        "product_code",
        "product_name",
        "amount",
        "currency",
        "paid_at",
        "current_refund_status",
        "current_refund_request_id",
        "can_request_refund",
        "unavailable_reason",
    }
    assert "confirmation_url" not in body
    assert "provider_payment_id" not in str(body)


def test_list_excludes_other_users_and_non_fulfilled(client, db):
    auth_a, uid_a = _auth(client)
    auth_b, uid_b = _auth(client)
    _seed_purchase(db, uid_a, key="rp-a", hours_ago=1)
    _seed_purchase(db, uid_b, key="rp-b", hours_ago=1)
    _seed_purchase(
        db,
        uid_a,
        key="rp-pending",
        intent_status=CheckoutIntentStatus.PENDING.value,
        attempt_status=PaymentAttemptStatus.PENDING.value,
    )
    _seed_purchase(
        db,
        uid_a,
        key="rp-paid-only",
        intent_status=CheckoutIntentStatus.PAID.value,
        attempt_status=PaymentAttemptStatus.SUCCEEDED.value,
    )

    res = client.get(
        "/me/refundable-purchases",
        headers={"Authorization": auth_a},
    )
    assert res.status_code == 200, res.text
    ids = {i["checkout_intent_id"] for i in res.json()["items"]}
    assert res.json()["total"] == 1
    # Only A's fulfilled purchase
    own = (
        db.query(CheckoutIntent)
        .filter(
            CheckoutIntent.user_id == uid_a,
            CheckoutIntent.status == CheckoutIntentStatus.FULFILLED.value,
        )
        .one()
    )
    assert ids == {own.id}


def test_list_marks_active_and_completed_refund(client, db):
    auth, uid = _auth(client)
    intent_open, attempt_open = _seed_purchase(db, uid, key="rp-open", hours_ago=3)
    intent_done, attempt_done = _seed_purchase(db, uid, key="rp-done", hours_ago=2)
    intent_free, attempt_free = _seed_purchase(db, uid, key="rp-free", hours_ago=1)

    _seed_refund(
        db,
        user_id=uid,
        intent=intent_open,
        attempt=attempt_open,
        status=RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
        key="rr-open",
    )
    _seed_refund(
        db,
        user_id=uid,
        intent=intent_done,
        attempt=attempt_done,
        status=RefundRequestStatus.COMPLETED.value,
        key="rr-done",
    )
    _seed_refund(
        db,
        user_id=uid,
        intent=intent_free,
        attempt=attempt_free,
        status=RefundRequestStatus.CANCELED.value,
        key="rr-canceled",
    )

    res = client.get(
        "/me/refundable-purchases",
        headers={"Authorization": auth},
    )
    assert res.status_code == 200, res.text
    by_id = {i["checkout_intent_id"]: i for i in res.json()["items"]}
    assert by_id[intent_open.id]["can_request_refund"] is False
    assert by_id[intent_open.id]["unavailable_reason"] == "active_refund_request"
    assert (
        by_id[intent_open.id]["current_refund_status"]
        == RefundRequestStatus.AWAITING_ADMIN_REVIEW.value
    )
    assert by_id[intent_done.id]["can_request_refund"] is False
    assert by_id[intent_done.id]["unavailable_reason"] == "refund_completed"
    assert by_id[intent_free.id]["can_request_refund"] is True
    assert by_id[intent_free.id]["unavailable_reason"] is None


def test_list_pagination_newest_first(client, db):
    auth, uid = _auth(client)
    older, _ = _seed_purchase(db, uid, key="rp-old", hours_ago=5, amount="100.00")
    newer, _ = _seed_purchase(db, uid, key="rp-new", hours_ago=1, amount="250.50")

    page1 = client.get(
        "/me/refundable-purchases?limit=1&offset=0",
        headers={"Authorization": auth},
    )
    assert page1.status_code == 200, page1.text
    body1 = page1.json()
    assert body1["total"] == 2
    assert body1["limit"] == 1
    assert body1["offset"] == 0
    assert len(body1["items"]) == 1
    assert body1["items"][0]["checkout_intent_id"] == newer.id
    assert body1["items"][0]["amount"] == "250.50"

    page2 = client.get(
        "/me/refundable-purchases?limit=1&offset=1",
        headers={"Authorization": auth},
    )
    assert page2.status_code == 200, page2.text
    assert page2.json()["items"][0]["checkout_intent_id"] == older.id


def test_list_requires_auth(client):
    res = client.get("/me/refundable-purchases")
    assert res.status_code in (401, 403)
