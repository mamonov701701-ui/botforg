"""Этап 6.14.10A: безопасная status_history пользователя и admin presentation."""
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
    RefundAuditActorType,
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
from backend.services.refund_audit_presentation import (
    USER_STATUS_HISTORY_LIMIT,
    PresentationContext,
    build_public_status_history,
    present_public_event,
)
from backend.services.refund_revisions import mark_needs_information, reject_request
from backend.services.refund_submit import create_refund_request
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


def _seed_paid(db, user_id: int, *, key: str):
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
    db.refresh(attempt)
    return intent, attempt


def _dump(obj) -> str:
    import json

    return json.dumps(obj, default=str)


def test_user_detail_status_history_safe_and_ordered(client, db):
    headers, uid = _auth(client, db)
    intent, _ = _seed_paid(db, uid, key="hist-1")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="hist-1-key",
    )
    # Inject unsafe audit metadata as if from provider path.
    bad = RefundAuditEvent(
        refund_request_id=req.id,
        actor_type=RefundAuditActorType.SYSTEM.value,
        action=RefundAuditAction.STATUS_CHANGED.value,
        previous_status=RefundRequestStatus.APPROVED.value,
        new_status=RefundRequestStatus.REFUND_FAILED.value,
        reason="provider_internal_exception",
        event_metadata={
            "outcome": "failed",
            "error_code": "YK_SECRET",
            "provider_refund_id": "refund_ABCDEF123456",
            "raw_provider_payload": {"MUST_NOT_LEAK": True},
        },
    )
    db.add(bad)
    db.commit()

    res = client.get(f"/me/refund-requests/{req.id}", headers=headers)
    assert res.status_code == 200
    body = res.json()
    hist = body["status_history"]
    assert isinstance(hist, list)
    assert hist, "history must not be empty"
    assert hist[0]["title"] == "Заявка на возврат создана"
    assert "рассмотрение" in hist[0]["description"].lower()
    # Sorted ASC by time/id
    ids = [h["id"] for h in hist]
    assert ids == sorted(ids)
    dump = _dump(body)
    assert "YK_SECRET" not in dump
    assert "MUST_NOT_LEAK" not in dump
    assert "provider_refund_id" not in dump
    assert "raw_provider_payload" not in dump
    assert "event_metadata" not in dump
    assert "status_changed" not in dump
    assert "actor_user_id" not in dump
    # Failed provider → public wording without tech reason
    fail_items = [h for h in hist if h["title"] == "Возврат не выполнен"]
    assert fail_items
    assert "provider_internal" not in fail_items[0]["description"]


def test_user_cannot_read_foreign_timeline(client, db):
    h1, u1 = _auth(client, db)
    intent, _ = _seed_paid(db, u1, key="own")
    req = create_refund_request(
        db,
        user_id=u1,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="own-key",
    )
    h2, _ = _auth(client, db)
    res = client.get(f"/me/refund-requests/{req.id}", headers=h2)
    assert res.status_code == 404


def test_needs_information_and_reject_public_reason(client, db):
    headers, uid = _auth(client, db)
    admin_h, admin_uid = _auth(client, db, role="admin")
    intent, _ = _seed_paid(db, uid, key="ni-1")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="ni-key",
    )
    mark_needs_information(
        db,
        req.id,
        expected_version=int(req.version),
        actor_user_id=admin_uid,
        reason="Пожалуйста, уточните дату покупки.",
    )
    db.refresh(req)
    res = client.get(f"/me/refund-requests/{req.id}", headers=headers)
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == RefundRequestStatus.NEEDS_INFORMATION.value
    assert body["public_decision_message"] == "Пожалуйста, уточните дату покупки."
    info = [h for h in body["status_history"] if h["category"] == "information"]
    assert info
    assert "уточните дату" in info[-1]["description"].lower()

    # Reject with safe reason
    req2_intent, _ = _seed_paid(db, uid, key="rj-1")
    req2 = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=req2_intent.id,
        reason_category="unused",
        idempotency_key="rj-key",
    )
    reject_request(
        db,
        req2.id,
        expected_version=int(req2.version),
        actor_user_id=admin_uid,
        reason="Возврат невозможен по условиям оферты.",
    )
    res2 = client.get(f"/me/refund-requests/{req2.id}", headers=headers)
    body2 = res2.json()
    assert body2["public_decision_message"] == "Возврат невозможен по условиям оферты."
    assert any(h["title"] == "В возврате отказано" for h in body2["status_history"])


def test_internal_reason_not_shown_as_public(client, db):
    headers, uid = _auth(client, db)
    intent, _ = _seed_paid(db, uid, key="tech-r")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="tech-r-key",
    )
    ev = RefundAuditEvent(
        refund_request_id=req.id,
        actor_type=RefundAuditActorType.ADMIN.value,
        action=RefundAuditAction.STATUS_CHANGED.value,
        previous_status=RefundRequestStatus.AWAITING_ADMIN_REVIEW.value,
        new_status=RefundRequestStatus.NEEDS_INFORMATION.value,
        reason="provider_refund_fingerprint_xyz",
    )
    db.add(ev)
    db.commit()
    # Force status for extract helper path
    req.status = RefundRequestStatus.NEEDS_INFORMATION.value
    db.commit()

    res = client.get(f"/me/refund-requests/{req.id}", headers=headers)
    body = res.json()
    assert body["public_decision_message"] is None
    info = [h for h in body["status_history"] if "дополнительная" in h["title"].lower()]
    assert info
    assert "fingerprint" not in info[-1]["description"].lower()
    assert "предоставить дополнительную" in info[-1]["description"].lower()


def test_unknown_action_skipped_without_code_leak():
    class E:
        id = 99
        action = "totally_unknown_internal_action"
        previous_status = None
        new_status = None
        reason = "secret"
        event_metadata = {"error_code": "X"}
        created_at = _utc()

    item = present_public_event(E(), ctx=PresentationContext())
    assert item is None
    built = build_public_status_history([E()], ctx=PresentationContext())
    assert built == []


def test_history_limit_keeps_last_n():
    base = _utc()

    class E:
        def __init__(self, i: int):
            self.id = i
            self.action = RefundAuditAction.CREATED.value
            self.previous_status = None
            self.new_status = RefundRequestStatus.SUBMITTED.value
            self.reason = None
            self.event_metadata = None
            self.created_at = base + timedelta(seconds=i)

    events = [E(i) for i in range(1, USER_STATUS_HISTORY_LIMIT + 50)]
    out = build_public_status_history(events, ctx=PresentationContext())
    assert len(out) == USER_STATUS_HISTORY_LIMIT
    assert out[0].id == 50
    assert out[-1].id == USER_STATUS_HISTORY_LIMIT + 49


def test_list_endpoint_has_empty_history(client, db):
    headers, uid = _auth(client, db)
    intent, _ = _seed_paid(db, uid, key="list-h")
    create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="list-h-key",
    )
    res = client.get("/me/refund-requests", headers=headers)
    assert res.status_code == 200
    rows = res.json()
    assert rows
    assert rows[0]["status_history"] == []


def test_admin_timeline_whitelist_and_title(client, db):
    _, uid = _auth(client, db)
    admin_h, _ = _auth(client, db, role="admin")
    intent, _ = _seed_paid(db, uid, key="adm-tl")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="adm-tl-key",
    )
    db.add(
        RefundAuditEvent(
            refund_request_id=req.id,
            actor_type=RefundAuditActorType.SYSTEM.value,
            action=RefundAuditAction.STATUS_CHANGED.value,
            previous_status=RefundRequestStatus.REFUND_PROCESSING.value,
            new_status=RefundRequestStatus.REFUNDED.value,
            reason=None,
            event_metadata={
                "outcome": "succeeded",
                "provider_refund_id": "refund_ABCDEF1234567890",
                "error_code": "OK_CODE",
                "raw_provider_payload": {"secret": "MUST_NOT_LEAK"},
                "cancellation_details": "hidden",
            },
        )
    )
    db.commit()

    res = client.get(f"/api/admin/refunds/{req.id}", headers=admin_h)
    assert res.status_code == 200
    timeline = res.json()["audit_timeline"]
    assert timeline
    created = next(t for t in timeline if t["action"] == "created")
    assert created.get("title") == "Заявка создана"
    succeeded = [t for t in timeline if t.get("new_status") == "refunded"]
    assert succeeded
    details = succeeded[-1].get("details") or succeeded[-1].get("event_metadata") or {}
    assert details.get("outcome") == "succeeded"
    assert details.get("error_code") == "OK_CODE"
    assert "…" in str(details.get("provider_refund_id"))
    dump = _dump(timeline)
    assert "MUST_NOT_LEAK" not in dump
    assert "cancellation_details" not in dump
    assert "raw_provider_payload" not in dump


def test_duplicate_webhook_does_not_duplicate_public_history(client, db):
    """Idempotent webhook already covered; presentation must not invent extras."""
    headers, uid = _auth(client, db)
    intent, _ = _seed_paid(db, uid, key="dup-h")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="dup-h-key",
    )
    before = client.get(f"/me/refund-requests/{req.id}", headers=headers).json()[
        "status_history"
    ]
    # No new audit → same history length
    after = client.get(f"/me/refund-requests/{req.id}", headers=headers).json()[
        "status_history"
    ]
    assert len(before) == len(after)
    assert [x["id"] for x in before] == [x["id"] for x in after]
