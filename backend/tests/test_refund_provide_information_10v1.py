"""Этап 6.14.10В-1: user provide-information на needs_information."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from backend.auth.rate_limit import rate_limit_store
from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
    PaymentAttempt,
    PaymentAttemptStatus,
)
from backend.models.notification import NotificationOutbox
from backend.models.refund import (
    RefundAuditAction,
    RefundAuditEvent,
    RefundRequest,
    RefundRequestStatus,
)
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
)
from backend.models.user import User
from backend.services.refund_notification_producer import RefundNotificationEnqueueError
from backend.services.refund_revisions import mark_needs_information
from backend.services.refund_submit import create_refund_request
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _clear_rate_limits():
    rate_limit_store.clear()
    yield
    rate_limit_store.clear()


def _utc() -> datetime:
    return datetime.now(timezone.utc)


def _auth(client, db, *, role: str | None = None):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    if role:
        user = db.query(User).filter(User.id == uid).one()
        user.role = role
        db.commit()
    return {"Authorization": token}, uid


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


def _seed_paid(db, user_id: int, *, key: str) -> CheckoutIntent:
    pkg = _addon_pkg(db)
    paid_at = _utc() - timedelta(hours=1)
    addon = UserAddon(
        user_id=user_id,
        addon_package_id=pkg.id,
        amount=1000,
        period_start=paid_at,
        period_end=paid_at + timedelta(days=30),
        status=UserAddonStatus.ACTIVE.value,
        source=UserAddonSource.PURCHASE.value,
        provider_ref=f"fake:pay-{key}",
    )
    db.add(addon)
    db.flush()
    intent = CheckoutIntent(
        user_id=user_id,
        product_type=CheckoutProductType.ADDON.value,
        product_code=pkg.code,
        product_name=pkg.name_ru,
        amount=pkg.price,
        currency="RUB",
        status=CheckoutIntentStatus.FULFILLED.value,
        idempotency_key=f"ci-{key}",
        payment_provider="fake",
        provider_payment_id=f"pay-{key}",
        paid_at=paid_at,
        fulfilled_at=paid_at,
        fulfilled_addon_id=addon.id,
    )
    db.add(intent)
    db.flush()
    attempt = PaymentAttempt(
        checkout_intent_id=intent.id,
        user_id=user_id,
        provider="fake",
        provider_payment_id=f"pay-{key}",
        amount=pkg.price,
        currency="RUB",
        status=PaymentAttemptStatus.SUCCEEDED.value,
        idempotency_key=f"pa-{key}",
    )
    db.add(attempt)
    db.commit()
    db.refresh(intent)
    return intent


def _put_needs_info(db, req: RefundRequest, *, admin_uid: int, reason: str = "Уточните детали покупки.") -> RefundRequest:
    mark_needs_information(
        db,
        req.id,
        expected_version=int(req.version),
        actor_user_id=admin_uid,
        reason=reason,
    )
    db.refresh(req)
    return req


def test_provide_information_success(client, db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.refund_notification_producer.settings.REFUND_ADMIN_NOTIFY_EMAIL",
        "ops@example.com",
    )
    headers, uid = _auth(client, db)
    _, admin_uid = _auth(client, db, role="admin")
    intent = _seed_paid(db, uid, key="pi-ok")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="pi-ok-key",
        user_comment="Исходный комментарий при создании",
    )
    original_comment = req.user_comment
    req = _put_needs_info(db, req, admin_uid=admin_uid)

    res = client.post(
        f"/me/refund-requests/{req.id}/provide-information",
        headers=headers,
        json={
            "message": "Покупка была 12 мая, чек сохранился в почте.",
            "expected_version": int(req.version),
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == RefundRequestStatus.AWAITING_ADMIN_REVIEW.value
    assert body["user_comment"] == original_comment
    assert body["version"] == int(req.version) + 1

    reply_hist = [
        h
        for h in body["status_history"]
        if h["title"] == "Дополнительная информация отправлена"
    ]
    assert reply_hist
    assert "возвращена на рассмотрение" in reply_hist[0]["description"].lower()
    assert "12 мая" in reply_hist[0]["description"]

    audit = (
        db.query(RefundAuditEvent)
        .filter(
            RefundAuditEvent.refund_request_id == req.id,
            RefundAuditEvent.action
            == RefundAuditAction.USER_INFORMATION_PROVIDED.value,
        )
        .one()
    )
    assert audit.actor_user_id == uid
    assert audit.previous_status == RefundRequestStatus.NEEDS_INFORMATION.value
    assert audit.new_status == RefundRequestStatus.AWAITING_ADMIN_REVIEW.value
    assert "12 мая" in (audit.reason or "")
    # no extra status_changed for this user-reply transition
    status_changed_for_reply = (
        db.query(RefundAuditEvent)
        .filter(
            RefundAuditEvent.refund_request_id == req.id,
            RefundAuditEvent.action == RefundAuditAction.STATUS_CHANGED.value,
            RefundAuditEvent.previous_status
            == RefundRequestStatus.NEEDS_INFORMATION.value,
            RefundAuditEvent.new_status
            == RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
        )
        .count()
    )
    assert status_changed_for_reply == 0

    outbox = (
        db.query(NotificationOutbox)
        .filter(
            NotificationOutbox.aggregate_id == str(req.id),
            NotificationOutbox.notification_type == "refund_admin_user_reply",
        )
        .all()
    )
    assert len(outbox) == 1
    assert outbox[0].recipient_email == "ops@example.com"
    assert "пользователь ответил" in outbox[0].payload_json["title"].lower()


def test_provide_information_admin_timeline(client, db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.refund_notification_producer.settings.REFUND_ADMIN_NOTIFY_EMAIL",
        "ops@example.com",
    )
    headers, uid = _auth(client, db)
    admin_h, admin_uid = _auth(client, db, role="admin")
    intent = _seed_paid(db, uid, key="pi-adm")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="pi-adm-key",
    )
    req = _put_needs_info(db, req, admin_uid=admin_uid)
    res = client.post(
        f"/me/refund-requests/{req.id}/provide-information",
        headers=headers,
        json={
            "message": "Дополнил сведения по заказу.",
            "expected_version": int(req.version),
        },
    )
    assert res.status_code == 200
    admin = client.get(f"/api/admin/refunds/{req.id}", headers=admin_h)
    assert admin.status_code == 200
    timeline = admin.json()["audit_timeline"]
    hit = [
        t
        for t in timeline
        if t.get("action") == RefundAuditAction.USER_INFORMATION_PROVIDED.value
    ]
    assert hit
    assert "предоставил дополнительную информацию" in hit[0]["title"].lower()
    assert "дополнил сведения" in (hit[0].get("reason") or "").lower()
    assert hit[0]["previous_status"] == RefundRequestStatus.NEEDS_INFORMATION.value
    assert hit[0]["new_status"] == RefundRequestStatus.AWAITING_ADMIN_REVIEW.value
    dump = str(admin.json()).lower()
    assert "event_metadata" not in dump or "raw" not in dump


def test_provide_information_foreign_404(client, db):
    h1, u1 = _auth(client, db)
    h2, _ = _auth(client, db)
    _, admin_uid = _auth(client, db, role="admin")
    intent = _seed_paid(db, u1, key="pi-f")
    req = create_refund_request(
        db,
        user_id=u1,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="pi-f-key",
    )
    req = _put_needs_info(db, req, admin_uid=admin_uid)
    res = client.post(
        f"/me/refund-requests/{req.id}/provide-information",
        headers=h2,
        json={"message": "Чужой ответ", "expected_version": int(req.version)},
    )
    assert res.status_code == 404


def test_provide_information_wrong_status_409(client, db):
    headers, uid = _auth(client, db)
    intent = _seed_paid(db, uid, key="pi-ws")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="pi-ws-key",
    )
    res = client.post(
        f"/me/refund-requests/{req.id}/provide-information",
        headers=headers,
        json={"message": "Ещё не запрашивали", "expected_version": int(req.version)},
    )
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "invalid_status_for_reply"


def test_provide_information_repeat_409_then_new_cycle(client, db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.refund_notification_producer.settings.REFUND_ADMIN_NOTIFY_EMAIL",
        "ops@example.com",
    )
    headers, uid = _auth(client, db)
    _, admin_uid = _auth(client, db, role="admin")
    intent = _seed_paid(db, uid, key="pi-rep")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="pi-rep-key",
    )
    req = _put_needs_info(db, req, admin_uid=admin_uid)
    first = client.post(
        f"/me/refund-requests/{req.id}/provide-information",
        headers=headers,
        json={"message": "Первый ответ пользователя.", "expected_version": int(req.version)},
    )
    assert first.status_code == 200
    db.refresh(req)
    second = client.post(
        f"/me/refund-requests/{req.id}/provide-information",
        headers=headers,
        json={"message": "Второй ответ.", "expected_version": int(req.version)},
    )
    assert second.status_code == 409

    req = _put_needs_info(db, req, admin_uid=admin_uid, reason="Нужна ещё одна деталь.")
    third = client.post(
        f"/me/refund-requests/{req.id}/provide-information",
        headers=headers,
        json={"message": "Ответ во втором цикле.", "expected_version": int(req.version)},
    )
    assert third.status_code == 200
    assert (
        db.query(RefundAuditEvent)
        .filter(
            RefundAuditEvent.refund_request_id == req.id,
            RefundAuditEvent.action
            == RefundAuditAction.USER_INFORMATION_PROVIDED.value,
        )
        .count()
        == 2
    )


def test_provide_information_validation_422(client, db):
    headers, uid = _auth(client, db)
    _, admin_uid = _auth(client, db, role="admin")
    intent = _seed_paid(db, uid, key="pi-val")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="pi-val-key",
    )
    req = _put_needs_info(db, req, admin_uid=admin_uid)
    blank = client.post(
        f"/me/refund-requests/{req.id}/provide-information",
        headers=headers,
        json={"message": "   ", "expected_version": int(req.version)},
    )
    assert blank.status_code == 422
    too_long = client.post(
        f"/me/refund-requests/{req.id}/provide-information",
        headers=headers,
        json={"message": "а" * 2001, "expected_version": int(req.version)},
    )
    assert too_long.status_code == 422


def test_provide_information_version_conflict(client, db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.refund_notification_producer.settings.REFUND_ADMIN_NOTIFY_EMAIL",
        "ops@example.com",
    )
    headers, uid = _auth(client, db)
    _, admin_uid = _auth(client, db, role="admin")
    intent = _seed_paid(db, uid, key="pi-ver")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="pi-ver-key",
    )
    req = _put_needs_info(db, req, admin_uid=admin_uid)
    res = client.post(
        f"/me/refund-requests/{req.id}/provide-information",
        headers=headers,
        json={"message": "Ответ с неверной версией.", "expected_version": 1},
    )
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "version_conflict"


def test_double_submit_one_audit_one_outbox(client, db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.refund_notification_producer.settings.REFUND_ADMIN_NOTIFY_EMAIL",
        "ops@example.com",
    )
    headers, uid = _auth(client, db)
    _, admin_uid = _auth(client, db, role="admin")
    intent = _seed_paid(db, uid, key="pi-dbl")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="pi-dbl-key",
    )
    req = _put_needs_info(db, req, admin_uid=admin_uid)
    ver = int(req.version)
    r1 = client.post(
        f"/me/refund-requests/{req.id}/provide-information",
        headers=headers,
        json={"message": "Одинаковый двойной submit.", "expected_version": ver},
    )
    r2 = client.post(
        f"/me/refund-requests/{req.id}/provide-information",
        headers=headers,
        json={"message": "Одинаковый двойной submit.", "expected_version": ver},
    )
    assert r1.status_code == 200
    assert r2.status_code == 409
    assert (
        db.query(RefundAuditEvent)
        .filter(
            RefundAuditEvent.refund_request_id == req.id,
            RefundAuditEvent.action
            == RefundAuditAction.USER_INFORMATION_PROVIDED.value,
        )
        .count()
        == 1
    )
    assert (
        db.query(NotificationOutbox)
        .filter(
            NotificationOutbox.aggregate_id == str(req.id),
            NotificationOutbox.notification_type == "refund_admin_user_reply",
        )
        .count()
        == 1
    )


def test_no_admin_recipient_skips_outbox(client, db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.refund_notification_producer.settings.REFUND_ADMIN_NOTIFY_EMAIL",
        "",
    )
    headers, uid = _auth(client, db)
    _, admin_uid = _auth(client, db, role="admin")
    intent = _seed_paid(db, uid, key="pi-skip")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="pi-skip-key",
    )
    req = _put_needs_info(db, req, admin_uid=admin_uid)
    before = db.query(NotificationOutbox).count()
    res = client.post(
        f"/me/refund-requests/{req.id}/provide-information",
        headers=headers,
        json={"message": "Ответ без admin email.", "expected_version": int(req.version)},
    )
    assert res.status_code == 200
    assert res.json()["status"] == RefundRequestStatus.AWAITING_ADMIN_REVIEW.value
    assert (
        db.query(NotificationOutbox)
        .filter(NotificationOutbox.notification_type == "refund_admin_user_reply")
        .count()
        == 0
    )
    assert db.query(NotificationOutbox).count() >= before  # user needs_info outbox may exist


def test_enqueue_error_rolls_back(client, db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.refund_notification_producer.settings.REFUND_ADMIN_NOTIFY_EMAIL",
        "ops@example.com",
    )
    headers, uid = _auth(client, db)
    _, admin_uid = _auth(client, db, role="admin")
    intent = _seed_paid(db, uid, key="pi-rb")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="pi-rb-key",
    )
    req = _put_needs_info(db, req, admin_uid=admin_uid)
    before_ver = int(req.version)
    before_status = req.status

    def boom(*_a, **_k):
        raise RefundNotificationEnqueueError("forced", code="enqueue_db")

    monkeypatch.setattr(
        "backend.services.refund_notification_producer.enqueue_refund_notification_from_audit",
        boom,
    )
    res = client.post(
        f"/me/refund-requests/{req.id}/provide-information",
        headers=headers,
        json={"message": "Должен откатиться.", "expected_version": before_ver},
    )
    assert res.status_code == 500
    db.expire_all()
    req = db.get(RefundRequest, req.id)
    assert req.status == before_status
    assert int(req.version) == before_ver
    assert (
        db.query(RefundAuditEvent)
        .filter(
            RefundAuditEvent.refund_request_id == req.id,
            RefundAuditEvent.action
            == RefundAuditAction.USER_INFORMATION_PROVIDED.value,
        )
        .count()
        == 0
    )


def test_rate_limit_provide_information(client, db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.refund_notification_producer.settings.REFUND_ADMIN_NOTIFY_EMAIL",
        "ops@example.com",
    )
    headers, uid = _auth(client, db)
    _, admin_uid = _auth(client, db, role="admin")
    # Prepare several needs_information requests to burn rate limit on endpoint
    statuses = []
    for i in range(6):
        intent = _seed_paid(db, uid, key=f"pi-rl-{i}")
        req = create_refund_request(
            db,
            user_id=uid,
            checkout_intent_id=intent.id,
            reason_category="unused",
            idempotency_key=f"pi-rl-key-{i}",
        )
        # Only first needs info; others still hit endpoint and get 409 but count for rate limit
        if i == 0:
            req = _put_needs_info(db, req, admin_uid=admin_uid)
            ver = int(req.version)
            msg = "Ответ для rate limit."
        else:
            ver = int(req.version)
            msg = "Неверный статус но считает попытку."
        res = client.post(
            f"/me/refund-requests/{req.id}/provide-information",
            headers=headers,
            json={"message": msg, "expected_version": ver},
        )
        statuses.append(res.status_code)
    assert 429 in statuses


def test_list_does_not_load_timeline(client, db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.refund_notification_producer.settings.REFUND_ADMIN_NOTIFY_EMAIL",
        "ops@example.com",
    )
    headers, uid = _auth(client, db)
    _, admin_uid = _auth(client, db, role="admin")
    intent = _seed_paid(db, uid, key="pi-list")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="pi-list-key",
    )
    req = _put_needs_info(db, req, admin_uid=admin_uid)
    client.post(
        f"/me/refund-requests/{req.id}/provide-information",
        headers=headers,
        json={"message": "Ответ для списка.", "expected_version": int(req.version)},
    )
    listing = client.get("/me/refund-requests", headers=headers)
    assert listing.status_code == 200
    rows = listing.json()
    assert isinstance(rows, list)
    row = next(r for r in rows if r["id"] == req.id)
    assert row.get("status_history") == []
