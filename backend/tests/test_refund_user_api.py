"""Этап 6.14.3.3: пользовательский refund API."""
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
from backend.models.refund import (
    RefundAuditAction,
    RefundAuditEvent,
    RefundRequest,
    RefundRequestStatus,
)
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    UsageCounter,
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


def _seed_owned_paid(
    db,
    user_id: int,
    *,
    key: str,
    amount: str = "190.00",
):
    paid_at = _utc() - timedelta(hours=1)
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
        status=CheckoutIntentStatus.FULFILLED.value,
        idempotency_key=f"ci-{key}",
        payment_provider="yookassa",
        provider_payment_id=f"yk_{key}",
        paid_at=paid_at,
        fulfilled_at=paid_at,
        fulfilled_addon_id=addon.id,
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
        status=PaymentAttemptStatus.SUCCEEDED.value,
        idempotency_key=f"pay-{key}",
    )
    db.add(attempt)
    db.commit()
    db.refresh(intent)
    db.refresh(attempt)
    db.refresh(addon)
    return intent, attempt, addon


def _create(client, auth, *, checkout_intent_id: int, idempotency_key: str, **extra):
    payload = {
        "checkout_intent_id": checkout_intent_id,
        "reason_category": "unused",
        "idempotency_key": idempotency_key,
        "user_comment": "please refund",
    }
    payload.update(extra)
    return client.post(
        "/me/refund-requests",
        json=payload,
        headers={"Authorization": auth},
    )


def test_create_refund_request_api(client, db):
    auth, uid = _auth(client)
    intent, attempt, _ = _seed_owned_paid(db, uid, key="api-create")

    res = _create(client, auth, checkout_intent_id=intent.id, idempotency_key="idem-api-1")
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["id"] > 0
    assert body["checkout_intent_id"] == intent.id
    assert body["payment_attempt_id"] == attempt.id
    assert body["reason_category"] == "unused"
    assert body["user_comment"] == "please refund"
    assert body["current_revision_number"] == 1
    assert body["recommended_refund_amount"] == "190.00"
    assert body["status"] == RefundRequestStatus.AWAITING_ADMIN_REVIEW.value

    row = db.query(RefundRequest).filter(RefundRequest.id == body["id"]).one()
    assert row.user_id == uid


def test_create_idempotency_replay(client, db):
    auth, uid = _auth(client)
    intent, _, _ = _seed_owned_paid(db, uid, key="api-replay")

    r1 = _create(client, auth, checkout_intent_id=intent.id, idempotency_key="idem-replay")
    assert r1.status_code == 201, r1.text
    r2 = _create(client, auth, checkout_intent_id=intent.id, idempotency_key="idem-replay")
    assert r2.status_code == 201, r2.text
    assert r1.json()["id"] == r2.json()["id"]
    assert (
        db.query(RefundRequest)
        .filter(RefundRequest.user_id == uid, RefundRequest.idempotency_key == "idem-replay")
        .count()
        == 1
    )


def test_create_idempotency_conflict(client, db):
    auth, uid = _auth(client)
    intent_a, _, _ = _seed_owned_paid(db, uid, key="api-conf-a")
    intent_b, _, _ = _seed_owned_paid(db, uid, key="api-conf-b")

    r1 = _create(
        client,
        auth,
        checkout_intent_id=intent_a.id,
        idempotency_key="idem-conflict",
    )
    assert r1.status_code == 201, r1.text

    r2 = _create(
        client,
        auth,
        checkout_intent_id=intent_b.id,
        idempotency_key="idem-conflict",
        reason_category="other",
    )
    assert r2.status_code == 409, r2.text
    detail = r2.json()["detail"]
    assert detail["code"] == "idempotency_conflict"
    assert "message" in detail


def test_list_only_own_requests(client, db):
    auth_a, uid_a = _auth(client)
    auth_b, uid_b = _auth(client)
    intent_a, _, _ = _seed_owned_paid(db, uid_a, key="api-list-a")
    intent_b, _, _ = _seed_owned_paid(db, uid_b, key="api-list-b")

    created_a = _create(
        client, auth_a, checkout_intent_id=intent_a.id, idempotency_key="idem-list-a"
    )
    created_b = _create(
        client, auth_b, checkout_intent_id=intent_b.id, idempotency_key="idem-list-b"
    )
    assert created_a.status_code == 201
    assert created_b.status_code == 201
    id_a = created_a.json()["id"]
    id_b = created_b.json()["id"]

    list_a = client.get("/me/refund-requests", headers={"Authorization": auth_a})
    assert list_a.status_code == 200, list_a.text
    ids_a = {row["id"] for row in list_a.json()}
    assert id_a in ids_a
    assert id_b not in ids_a


def test_get_own_request(client, db):
    auth, uid = _auth(client)
    intent, _, _ = _seed_owned_paid(db, uid, key="api-get-own")
    created = _create(
        client, auth, checkout_intent_id=intent.id, idempotency_key="idem-get-own"
    )
    assert created.status_code == 201
    rid = created.json()["id"]

    res = client.get(f"/me/refund-requests/{rid}", headers={"Authorization": auth})
    assert res.status_code == 200, res.text
    assert res.json()["id"] == rid
    assert res.json()["checkout_intent_id"] == intent.id


def test_get_foreign_request_unavailable(client, db):
    auth_a, uid_a = _auth(client)
    auth_b, _ = _auth(client)
    intent, _, _ = _seed_owned_paid(db, uid_a, key="api-get-foreign")
    created = _create(
        client, auth_a, checkout_intent_id=intent.id, idempotency_key="idem-get-foreign"
    )
    assert created.status_code == 201
    rid = created.json()["id"]

    res = client.get(f"/me/refund-requests/{rid}", headers={"Authorization": auth_b})
    assert res.status_code == 404, res.text
    detail = res.json()["detail"]
    assert detail["code"] == "request_not_found"
    assert "message" in detail


def test_manual_review_recommended_amount_null(client, db):
    auth, uid = _auth(client)
    paid_at = _utc() - timedelta(hours=5)
    pkg = _addon_pkg(db)
    addon = UserAddon(
        user_id=uid,
        addon_package_id=pkg.id,
        amount=1000,
        period_start=paid_at,
        period_end=paid_at + timedelta(days=30),
        status=UserAddonStatus.ACTIVE.value,
        source=UserAddonSource.PURCHASE.value,
        provider_ref="yookassa:yk_api-manual",
    )
    db.add(addon)
    db.flush()
    intent = CheckoutIntent(
        user_id=uid,
        product_type=CheckoutProductType.ADDON.value,
        product_code=pkg.code,
        product_name=pkg.name_ru,
        amount=Decimal("190.00"),
        currency="RUB",
        status=CheckoutIntentStatus.FULFILLED.value,
        idempotency_key="ci-api-manual",
        payment_provider="yookassa",
        provider_payment_id="yk_api-manual",
        paid_at=paid_at,
        fulfilled_at=paid_at,
        fulfilled_addon_id=addon.id,
    )
    db.add(intent)
    db.flush()
    attempt = PaymentAttempt(
        checkout_intent_id=intent.id,
        user_id=uid,
        provider="yookassa",
        provider_payment_id="yk_api-manual",
        amount=Decimal("190.00"),
        currency="RUB",
        status=PaymentAttemptStatus.SUCCEEDED.value,
        idempotency_key="pay-api-manual",
    )
    db.add(attempt)
    db.add(
        UsageCounter(
            user_id=uid,
            period_start=addon.period_start,
            period_end=addon.period_end,
            messages_used=3,
            active_bots_used=0,
            team_members_used=0,
            created_at=paid_at + timedelta(hours=1),
            updated_at=paid_at + timedelta(hours=1),
        )
    )
    db.commit()
    db.refresh(intent)

    res = _create(
        client, auth, checkout_intent_id=intent.id, idempotency_key="idem-manual"
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["status"] == RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value
    assert body["recommended_refund_amount"] is None
    assert body["proposed_amount_undefined"] is True
    assert body["recommended_refund_amount"] != "0.00"
    assert body["recommended_refund_amount"] != 0


def test_cancel_allowed(client, db):
    auth, uid = _auth(client)
    intent, _, _ = _seed_owned_paid(db, uid, key="api-cancel-ok")
    created = _create(
        client, auth, checkout_intent_id=intent.id, idempotency_key="idem-cancel-ok"
    )
    assert created.status_code == 201
    body = created.json()
    rid = body["id"]
    version = body["version"]

    res = client.post(
        f"/me/refund-requests/{rid}/cancel",
        json={"expected_version": version, "reason": "changed mind"},
        headers={"Authorization": auth},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == RefundRequestStatus.CANCELED.value
    assert res.json()["id"] == rid

    db.expire_all()
    row = db.query(RefundRequest).filter(RefundRequest.id == rid).one()
    assert row.status == RefundRequestStatus.CANCELED.value
    assert row.user_id == uid


def test_cancel_not_allowed(client, db):
    auth, uid = _auth(client)
    intent, _, _ = _seed_owned_paid(db, uid, key="api-cancel-bad")
    created = _create(
        client, auth, checkout_intent_id=intent.id, idempotency_key="idem-cancel-bad"
    )
    assert created.status_code == 201
    body = created.json()
    rid = body["id"]
    version = body["version"]

    ok = client.post(
        f"/me/refund-requests/{rid}/cancel",
        json={"expected_version": version},
        headers={"Authorization": auth},
    )
    assert ok.status_code == 200, ok.text
    canceled_version = ok.json()["version"]

    again = client.post(
        f"/me/refund-requests/{rid}/cancel",
        json={"expected_version": canceled_version},
        headers={"Authorization": auth},
    )
    assert again.status_code == 409, again.text
    detail = again.json()["detail"]
    assert detail["code"] == "request_terminal"
    assert "message" in detail


def test_cancel_writes_audit(client, db):
    auth, uid = _auth(client)
    intent, _, _ = _seed_owned_paid(db, uid, key="api-cancel-audit")
    created = _create(
        client, auth, checkout_intent_id=intent.id, idempotency_key="idem-cancel-audit"
    )
    assert created.status_code == 201
    body = created.json()
    rid = body["id"]

    res = client.post(
        f"/me/refund-requests/{rid}/cancel",
        json={"expected_version": body["version"], "reason": "audit check"},
        headers={"Authorization": auth},
    )
    assert res.status_code == 200, res.text

    db.expire_all()
    actions = {
        e.action
        for e in db.query(RefundAuditEvent)
        .filter(RefundAuditEvent.refund_request_id == rid)
        .all()
    }
    assert RefundAuditAction.STATUS_CHANGED.value in actions
    status_events = (
        db.query(RefundAuditEvent)
        .filter(
            RefundAuditEvent.refund_request_id == rid,
            RefundAuditEvent.action == RefundAuditAction.STATUS_CHANGED.value,
        )
        .all()
    )
    assert any(e.new_status == RefundRequestStatus.CANCELED.value for e in status_events)
    assert any(e.actor_user_id == uid for e in status_events)
