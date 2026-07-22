"""
Этап 8.3.1: GET /me/checkout-intents — user purchase history.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import inspect

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
    PaymentAttempt,
    PaymentAttemptStatus,
)
from backend.models.plan import Plan
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
    return datetime.now(timezone.utc).replace(tzinfo=None)


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


def _seed_intent(
    db,
    user_id: int,
    *,
    key: str,
    product_type: str = CheckoutProductType.ADDON.value,
    product_code: str = "msg_1000",
    product_name: str = "+1 000 сообщений",
    amount: str = "190.00",
    intent_status: str = CheckoutIntentStatus.PENDING.value,
    attempt_status: str | None = None,
    created_at: datetime | None = None,
    hours_ago: int | None = None,
    fulfilled_addon_id: int | None = None,
    fulfilled_subscription_id: int | None = None,
) -> CheckoutIntent:
    if created_at is None:
        base = _utc()
        if hours_ago is not None:
            created_at = base - timedelta(hours=hours_ago)
        else:
            created_at = base

    intent = CheckoutIntent(
        user_id=user_id,
        product_type=product_type,
        product_code=product_code,
        product_name=product_name,
        amount=Decimal(amount),
        currency="RUB",
        status=intent_status,
        idempotency_key=f"hist-{key}",
        payment_provider="yookassa" if attempt_status else None,
        provider_payment_id=f"yk_{key}" if attempt_status else None,
        created_at=created_at,
        updated_at=created_at,
        fulfilled_addon_id=fulfilled_addon_id,
        fulfilled_subscription_id=fulfilled_subscription_id,
    )
    if intent_status == CheckoutIntentStatus.FULFILLED.value:
        intent.paid_at = created_at
        intent.fulfilled_at = created_at
    elif intent_status == CheckoutIntentStatus.CANCELLED.value:
        intent.cancelled_at = created_at
    elif intent_status == CheckoutIntentStatus.FAILED.value:
        intent.failed_at = created_at
    elif intent_status == CheckoutIntentStatus.REFUNDED.value:
        intent.paid_at = created_at
        intent.fulfilled_at = created_at
        intent.refunded_at = created_at
    elif intent_status == CheckoutIntentStatus.PAID.value:
        intent.paid_at = created_at

    db.add(intent)
    db.flush()

    if attempt_status is not None:
        attempt = PaymentAttempt(
            checkout_intent_id=intent.id,
            user_id=user_id,
            provider="yookassa",
            provider_payment_id=f"yk_{key}",
            amount=Decimal(amount),
            currency="RUB",
            status=attempt_status,
            idempotency_key=f"pay-{key}",
            confirmation_url=f"https://example.test/pay/{key}",
            created_at=created_at,
            updated_at=created_at,
        )
        db.add(attempt)

    db.commit()
    db.refresh(intent)
    return intent


def _list(client, auth: str, **params):
    return client.get(
        "/me/checkout-intents",
        params=params or None,
        headers={"Authorization": auth},
    )


def test_user_sees_only_own_intents(client, db):
    auth_a, uid_a = _auth(client)
    auth_b, uid_b = _auth(client)
    _seed_intent(db, uid_a, key="a1", hours_ago=2)
    _seed_intent(db, uid_b, key="b1", hours_ago=1)

    res = _list(client, auth_a)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["id"] is not None
    ids = {item["id"] for item in body["items"]}
    own = {i.id for i in db.query(CheckoutIntent).filter_by(user_id=uid_a).all()}
    assert ids == own

    res_b = _list(client, auth_b)
    assert res_b.status_code == 200
    assert res_b.json()["total"] == 1
    assert res_b.json()["items"][0]["id"] not in ids


def test_other_user_cannot_see_foreign_intents(client, db):
    auth_a, uid_a = _auth(client)
    auth_b, _uid_b = _auth(client)
    intent = _seed_intent(db, uid_a, key="secret", hours_ago=1)

    res = _list(client, auth_b)
    assert res.status_code == 200
    assert all(item["id"] != intent.id for item in res.json()["items"])
    assert res.json()["total"] == 0


def test_newest_purchases_first_stable_order(client, db):
    auth, uid = _auth(client)
    t0 = _utc() - timedelta(hours=3)
    older = _seed_intent(db, uid, key="old", created_at=t0)
    middle = _seed_intent(
        db, uid, key="mid", created_at=t0 + timedelta(hours=1)
    )
    newer = _seed_intent(
        db, uid, key="new", created_at=t0 + timedelta(hours=2)
    )
    # Same created_at → id DESC tie-break
    twin_a = _seed_intent(
        db, uid, key="twin-a", created_at=t0 + timedelta(hours=4)
    )
    twin_b = _seed_intent(
        db, uid, key="twin-b", created_at=t0 + timedelta(hours=4)
    )

    res = _list(client, auth)
    assert res.status_code == 200
    ids = [item["id"] for item in res.json()["items"]]
    assert ids[:2] == sorted([twin_a.id, twin_b.id], reverse=True)
    assert ids[2:] == [newer.id, middle.id, older.id]


def test_pagination_limit_offset_and_total(client, db):
    auth, uid = _auth(client)
    base = _utc() - timedelta(hours=10)
    created = []
    for i in range(5):
        created.append(
            _seed_intent(
                db,
                uid,
                key=f"p{i}",
                created_at=base + timedelta(hours=i),
            )
        )

    page1 = _list(client, auth, limit=2, offset=0)
    assert page1.status_code == 200
    b1 = page1.json()
    assert b1["total"] == 5
    assert b1["limit"] == 2
    assert b1["offset"] == 0
    assert len(b1["items"]) == 2
    assert [x["id"] for x in b1["items"]] == [created[4].id, created[3].id]

    page2 = _list(client, auth, limit=2, offset=2)
    b2 = page2.json()
    assert b2["total"] == 5
    assert b2["limit"] == 2
    assert b2["offset"] == 2
    assert [x["id"] for x in b2["items"]] == [created[2].id, created[1].id]


def test_tariff_and_addon_present(client, db):
    auth, uid = _auth(client)
    plan = db.query(Plan).filter(Plan.code == "business").one()
    _seed_intent(
        db,
        uid,
        key="tariff1",
        product_type=CheckoutProductType.TARIFF.value,
        product_code=plan.code,
        product_name=plan.name_ru or "Business",
        amount=str(plan.price_month),
        hours_ago=2,
    )
    _seed_intent(
        db,
        uid,
        key="addon1",
        product_type=CheckoutProductType.ADDON.value,
        hours_ago=1,
    )

    res = _list(client, auth)
    assert res.status_code == 200
    types = {item["product_type"] for item in res.json()["items"]}
    assert types == {"tariff", "addon"}
    assert res.json()["total"] == 2


def test_pending_fulfilled_canceled_failed_included(client, db):
    auth, uid = _auth(client)
    pending = _seed_intent(
        db,
        uid,
        key="pend",
        intent_status=CheckoutIntentStatus.PENDING.value,
        hours_ago=4,
    )
    fulfilled = _seed_intent(
        db,
        uid,
        key="ful",
        intent_status=CheckoutIntentStatus.FULFILLED.value,
        attempt_status=PaymentAttemptStatus.SUCCEEDED.value,
        hours_ago=3,
    )
    canceled = _seed_intent(
        db,
        uid,
        key="can",
        intent_status=CheckoutIntentStatus.CANCELLED.value,
        attempt_status=PaymentAttemptStatus.CANCELLED.value,
        hours_ago=2,
    )
    failed = _seed_intent(
        db,
        uid,
        key="fail",
        intent_status=CheckoutIntentStatus.FAILED.value,
        attempt_status=PaymentAttemptStatus.FAILED.value,
        hours_ago=1,
    )

    res = _list(client, auth)
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 4
    by_id = {item["id"]: item for item in body["items"]}
    assert by_id[pending.id]["intent_status"] == "pending"
    assert by_id[pending.id]["purchase_status"] == "pending"
    assert by_id[fulfilled.id]["intent_status"] == "fulfilled"
    assert by_id[fulfilled.id]["purchase_status"] == "succeeded"
    assert by_id[canceled.id]["intent_status"] == "cancelled"
    assert by_id[canceled.id]["purchase_status"] == "cancelled"
    assert by_id[failed.id]["intent_status"] == "failed"
    assert by_id[failed.id]["purchase_status"] == "failed"


def test_refund_eligibility_does_not_exclude_purchase(client, db):
    auth, uid = _auth(client)
    pkg = _addon_pkg(db)
    addon = UserAddon(
        user_id=uid,
        addon_package_id=pkg.id,
        amount=1000,
        period_start=_utc(),
        period_end=_utc() + timedelta(days=30),
        status=UserAddonStatus.ACTIVE.value,
        source=UserAddonSource.PURCHASE.value,
        provider_ref="yookassa:yk_refelig",
    )
    db.add(addon)
    db.flush()

    intent = _seed_intent(
        db,
        uid,
        key="refelig",
        intent_status=CheckoutIntentStatus.FULFILLED.value,
        attempt_status=PaymentAttemptStatus.SUCCEEDED.value,
        fulfilled_addon_id=addon.id,
        hours_ago=1,
    )
    attempt = (
        db.query(PaymentAttempt)
        .filter(PaymentAttempt.checkout_intent_id == intent.id)
        .one()
    )
    refund = RefundRequest(
        user_id=uid,
        checkout_intent_id=intent.id,
        payment_attempt_id=attempt.id,
        idempotency_key="rr-hist-1",
        status=RefundRequestStatus.COMPLETED.value,
        reason_category="other",
        current_revision_number=1,
        version=1,
        submitted_at=_utc(),
    )
    db.add(refund)
    db.commit()

    hist = _list(client, auth)
    assert hist.status_code == 200
    assert hist.json()["total"] == 1
    assert hist.json()["items"][0]["id"] == intent.id

    # Refundable list may mark as unavailable, but history still shows it.
    refundable = client.get(
        "/me/refundable-purchases",
        headers={"Authorization": auth},
    )
    assert refundable.status_code == 200
    items = refundable.json()["items"]
    assert any(i["checkout_intent_id"] == intent.id for i in items)
    match = next(i for i in items if i["checkout_intent_id"] == intent.id)
    assert match["can_request_refund"] is False


def test_no_secret_provider_fields_in_list(client, db):
    auth, uid = _auth(client)
    _seed_intent(
        db,
        uid,
        key="sec",
        intent_status=CheckoutIntentStatus.AWAITING_PAYMENT.value,
        attempt_status=PaymentAttemptStatus.PENDING.value,
        hours_ago=1,
    )
    res = _list(client, auth)
    assert res.status_code == 200
    item = res.json()["items"][0]
    forbidden = {
        "confirmation_url",
        "provider_payment_id",
        "idempotency_key",
        "payload",
        "credentials",
        "secret",
        "ciphertext",
        "shop_id",
        "metadata",
    }
    assert forbidden.isdisjoint(item.keys())
    assert "payment_provider" in item
    assert item["latest_attempt_status"] == PaymentAttemptStatus.PENDING.value


def test_invalid_limit_offset_validation(client, db):
    auth, _uid = _auth(client)

    assert _list(client, auth, limit=0).status_code == 422
    assert _list(client, auth, limit=101).status_code == 422
    assert _list(client, auth, offset=-1).status_code == 422


def test_optional_filters_product_type_and_status(client, db):
    auth, uid = _auth(client)
    plan = db.query(Plan).filter(Plan.code == "business").one()
    _seed_intent(
        db,
        uid,
        key="ft",
        product_type=CheckoutProductType.TARIFF.value,
        product_code=plan.code,
        product_name=plan.name_ru or "Business",
        amount=str(plan.price_month),
        intent_status=CheckoutIntentStatus.PENDING.value,
        hours_ago=2,
    )
    _seed_intent(
        db,
        uid,
        key="fa",
        product_type=CheckoutProductType.ADDON.value,
        intent_status=CheckoutIntentStatus.FULFILLED.value,
        attempt_status=PaymentAttemptStatus.SUCCEEDED.value,
        hours_ago=1,
    )

    only_addon = _list(client, auth, product_type="addon")
    assert only_addon.status_code == 200
    assert only_addon.json()["total"] == 1
    assert only_addon.json()["items"][0]["product_type"] == "addon"

    only_pending = _list(client, auth, status="pending")
    assert only_pending.status_code == 200
    assert only_pending.json()["total"] == 1
    assert only_pending.json()["items"][0]["intent_status"] == "pending"

    bad_status = _list(client, auth, status="not_a_status")
    assert bad_status.status_code == 422


def test_fulfillment_result_fields(client, db):
    auth, uid = _auth(client)
    pkg = _addon_pkg(db)
    addon = UserAddon(
        user_id=uid,
        addon_package_id=pkg.id,
        amount=1000,
        period_start=_utc(),
        period_end=_utc() + timedelta(days=30),
        status=UserAddonStatus.ACTIVE.value,
        source=UserAddonSource.PURCHASE.value,
        provider_ref="yookassa:yk_fulres",
    )
    db.add(addon)
    db.flush()
    intent = _seed_intent(
        db,
        uid,
        key="fulres",
        intent_status=CheckoutIntentStatus.FULFILLED.value,
        attempt_status=PaymentAttemptStatus.SUCCEEDED.value,
        fulfilled_addon_id=addon.id,
        hours_ago=1,
    )
    res = _list(client, auth)
    item = res.json()["items"][0]
    assert item["id"] == intent.id
    assert item["fulfilled_addon_id"] == addon.id
    assert item["fulfillment_result_type"] == "addon"
    assert item["fulfilled_subscription_id"] is None


def test_purchase_history_index_exists(client, db):
    """Migration checkout_purchase_history_033 creates composite index once."""
    insp = inspect(db.bind)
    indexes = insp.get_indexes("checkout_intents")
    names = {idx["name"] for idx in indexes}
    assert "ix_checkout_intents_user_created_id" in names
    match = next(
        i for i in indexes if i["name"] == "ix_checkout_intents_user_created_id"
    )
    cols = list(match["column_names"])
    assert cols == ["user_id", "created_at", "id"]
    # Exactly one index with this name
    assert sum(1 for i in indexes if i["name"] == "ix_checkout_intents_user_created_id") == 1


def test_unauthenticated_rejected(client):
    res = client.get("/me/checkout-intents")
    assert res.status_code in (401, 403)
