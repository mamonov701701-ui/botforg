"""Этап 6.14.3.4: admin read-only refund API."""
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
)
from backend.models.refund import (
    RefundAuditAction,
    RefundAuditEvent,
    RefundRequest,
    RefundRequestStatus,
    RefundRevision,
)
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    UsageCounter,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
)
from backend.models.user import User
from backend.services.refund_submit import create_refund_request
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


FORBIDDEN_MARKERS = (
    "MUST_NOT_LEAK",
    "ciphertext",
    "credentials_ciphertext",
    "credentials_nonce",
    "credentials_auth_tag",
    "auth_tag",
    "raw_provider_payload",
    "secret_key",
)


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


def _seed_paid(
    db,
    user_id: int,
    *,
    key: str,
    with_usage: bool = False,
):
    paid_at = _utc() - timedelta(hours=5 if with_usage else 1)
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
        amount=Decimal("190.00"),
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
        amount=Decimal("190.00"),
        currency="RUB",
        status=PaymentAttemptStatus.SUCCEEDED.value,
        idempotency_key=f"pay-{key}",
    )
    db.add(attempt)
    if with_usage:
        db.add(
            UsageCounter(
                user_id=user_id,
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
    db.refresh(attempt)
    return intent, attempt


def _inject_secret_into_revision(db, request_id: int) -> None:
    rev = (
        db.query(RefundRevision)
        .filter(RefundRevision.refund_request_id == request_id)
        .order_by(RefundRevision.revision_number.desc())
        .first()
    )
    assert rev is not None
    snap = dict(rev.calculation_snapshot or {})
    snap["credentials_ciphertext"] = "MUST_NOT_LEAK"
    snap["credentials_nonce"] = "MUST_NOT_LEAK"
    snap["credentials_auth_tag"] = "MUST_NOT_LEAK"
    snap["raw_provider_payload"] = {"secret_key": "MUST_NOT_LEAK"}
    snap["unknown_leaky_field"] = "MUST_NOT_LEAK"
    snap["safe_marker"] = "MUST_NOT_LEAK"
    db.query(RefundRevision).filter(RefundRevision.id == rev.id).update(
        {
            "calculation_snapshot": snap,
            "usage_snapshot": {
                **(rev.usage_snapshot or {}),
                "ciphertext": "MUST_NOT_LEAK",
                "messages_used_total": int(
                    (rev.usage_snapshot or {}).get("messages_used_total") or 0
                ),
                "unknown_usage_secret": "MUST_NOT_LEAK",
            },
        },
        synchronize_session=False,
    )
    db.add(
        RefundAuditEvent(
            refund_request_id=request_id,
            refund_revision_id=rev.id,
            actor_user_id=None,
            actor_type="system",
            action=RefundAuditAction.VALIDATION_REJECTED.value,
            previous_status=None,
            new_status=None,
            changed_fields={"payload": {"secret_key": "MUST_NOT_LEAK"}},
            reason="fixture",
            event_metadata={
                "credentials": "MUST_NOT_LEAK",
                "note": "safe",
            },
            created_at=_utc(),
        )
    )
    db.commit()


def _assert_no_secrets(payload) -> None:
    blob = json.dumps(payload, default=str)
    for marker in FORBIDDEN_MARKERS:
        assert marker not in blob, f"secret marker leaked: {marker}"


def test_regular_user_forbidden(client, db):
    _auth(client, db)
    headers, uid = _auth(client, db)
    user = db.query(User).filter(User.id == uid).one()
    assert user.role == "user"
    res = client.get("/api/admin/refunds", headers=headers)
    assert res.status_code == 403


def test_list_and_pagination(client, db):
    admin_headers, _ = _auth(client, db, role="admin")
    user_headers, uid = _auth(client, db)

    intent1, _ = _seed_paid(db, uid, key="adm-list-1")
    intent2, _ = _seed_paid(db, uid, key="adm-list-2")
    r1 = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent1.id,
        reason_category="unused",
        idempotency_key="adm-list-1",
    )
    r2 = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent2.id,
        reason_category="unused",
        idempotency_key="adm-list-2",
    )

    page1 = client.get(
        "/api/admin/refunds",
        headers=admin_headers,
        params={"limit": 1, "offset": 0, "user_id": uid},
    )
    assert page1.status_code == 200, page1.text
    body1 = page1.json()
    assert body1["total"] >= 2
    assert body1["limit"] == 1
    assert body1["offset"] == 0
    assert len(body1["items"]) == 1
    assert body1["items"][0]["id"] == max(r1.id, r2.id)

    page2 = client.get(
        "/api/admin/refunds",
        headers=admin_headers,
        params={"limit": 1, "offset": 1, "user_id": uid},
    )
    assert page2.status_code == 200
    body2 = page2.json()
    assert len(body2["items"]) == 1
    assert body2["items"][0]["id"] == min(r1.id, r2.id)
    assert body1["items"][0]["id"] != body2["items"][0]["id"]


def test_list_filters(client, db):
    admin_headers, _ = _auth(client, db, role="owner")
    _, uid_a = _auth(client, db)
    _, uid_b = _auth(client, db)

    intent_a, _ = _seed_paid(db, uid_a, key="adm-f-a")
    intent_b, _ = _seed_paid(db, uid_b, key="adm-f-b", with_usage=True)
    create_refund_request(
        db,
        user_id=uid_a,
        checkout_intent_id=intent_a.id,
        reason_category="unused",
        idempotency_key="adm-f-a",
    )
    req_b = create_refund_request(
        db,
        user_id=uid_b,
        checkout_intent_id=intent_b.id,
        reason_category="defect",
        idempotency_key="adm-f-b",
    )
    assert req_b.status == RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value

    by_user = client.get(
        "/api/admin/refunds",
        headers=admin_headers,
        params={"user_id": uid_a},
    )
    assert by_user.status_code == 200
    assert all(i["user_id"] == uid_a for i in by_user.json()["items"])

    by_reason = client.get(
        "/api/admin/refunds",
        headers=admin_headers,
        params={"reason_category": "defect"},
    )
    assert by_reason.status_code == 200
    assert all(i["reason_category"] == "defect" for i in by_reason.json()["items"])
    assert any(i["id"] == req_b.id for i in by_reason.json()["items"])

    by_status = client.get(
        "/api/admin/refunds",
        headers=admin_headers,
        params={"status": RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value},
    )
    assert by_status.status_code == 200
    assert all(
        i["status"] == RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value
        for i in by_status.json()["items"]
    )

    by_manual = client.get(
        "/api/admin/refunds",
        headers=admin_headers,
        params={"manual_review": True},
    )
    assert by_manual.status_code == 200
    assert all(i["manual_review_required"] is True for i in by_manual.json()["items"])
    assert any(i["id"] == req_b.id for i in by_manual.json()["items"])


def test_detail_card(client, db):
    admin_headers, _ = _auth(client, db, role="admin")
    _, uid = _auth(client, db)
    intent, attempt = _seed_paid(db, uid, key="adm-card")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="adm-card",
        user_comment="need refund",
    )

    res = client.get(f"/api/admin/refunds/{req.id}", headers=admin_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["request"]["id"] == req.id
    assert body["request"]["user_comment"] == "need refund"
    assert body["user"]["id"] == uid
    assert body["user"]["email"]
    assert "hashed_password" not in body["user"]
    assert "password_hash" not in body["user"]
    assert body["checkout_intent"]["id"] == intent.id
    assert body["payment_attempt"]["id"] == attempt.id
    assert body["product"]["product_code"] == intent.product_code
    assert body["product"]["amount"] == "190.00"
    assert body["product"]["currency"] == "RUB"
    assert body["usage_snapshot"] is not None
    assert body["financial_snapshot"] is not None
    assert body["current_revision"] is not None
    assert body["current_revision"]["revision_number"] == 1


def test_detail_revisions_and_audit(client, db):
    admin_headers, _ = _auth(client, db, role="admin")
    _, uid = _auth(client, db)
    intent, _ = _seed_paid(db, uid, key="adm-rev")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="adm-rev",
    )

    res = client.get(f"/api/admin/refunds/{req.id}", headers=admin_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert len(body["revisions"]) >= 1
    assert body["revisions"][0]["id"] == body["current_revision"]["id"]
    actions = {e["action"] for e in body["audit_timeline"]}
    assert RefundAuditAction.CREATED.value in actions
    assert RefundAuditAction.REVISION_CREATED.value in actions


def test_manual_review_amount_null(client, db):
    admin_headers, _ = _auth(client, db, role="admin")
    _, uid = _auth(client, db)
    intent, _ = _seed_paid(db, uid, key="adm-manual", with_usage=True)
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="adm-manual",
    )
    assert req.status == RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value

    listed = client.get(
        "/api/admin/refunds",
        headers=admin_headers,
        params={"user_id": uid},
    )
    assert listed.status_code == 200
    item = next(i for i in listed.json()["items"] if i["id"] == req.id)
    assert item["recommended_refund_amount"] is None
    assert item["proposed_amount_undefined"] is True

    detail = client.get(f"/api/admin/refunds/{req.id}", headers=admin_headers)
    assert detail.status_code == 200
    body = detail.json()
    assert body["request"]["recommended_refund_amount"] is None
    assert body["current_revision"]["proposed_refund_amount"] is None
    assert body["current_revision"]["proposed_amount_undefined"] is True


def test_no_secret_or_raw_fields(client, db):
    admin_headers, _ = _auth(client, db, role="admin")
    _, uid = _auth(client, db)
    intent, _ = _seed_paid(db, uid, key="adm-sec")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="adm-sec",
    )
    _inject_secret_into_revision(db, req.id)

    listed = client.get("/api/admin/refunds", headers=admin_headers, params={"user_id": uid})
    assert listed.status_code == 200
    _assert_no_secrets(listed.json())

    detail = client.get(f"/api/admin/refunds/{req.id}", headers=admin_headers)
    assert detail.status_code == 200
    body = detail.json()
    _assert_no_secrets(body)
    calc = body["current_revision"]["calculation_snapshot"] or {}
    usage = body["usage_snapshot"] or {}
    assert "safe_marker" not in calc
    assert "unknown_leaky_field" not in calc
    assert "credentials_ciphertext" not in calc
    assert "raw_provider_payload" not in calc
    assert "ciphertext" not in usage
    assert "unknown_usage_secret" not in usage
    assert "messages_used_total" in usage
    for event in body["audit_timeline"]:
        meta = event.get("event_metadata") or {}
        assert "credentials" not in meta
        changed = event.get("changed_fields") or {}
        assert "payload" not in changed
    fixture_events = [
        e
        for e in body["audit_timeline"]
        if e.get("action") == RefundAuditAction.VALIDATION_REJECTED.value
    ]
    assert fixture_events
    assert (fixture_events[0].get("event_metadata") or {}).get("note") == "safe"


def test_manual_review_filter_after_admin_edit(client, db):
    admin_headers, admin_uid = _auth(client, db, role="admin")
    _, uid = _auth(client, db)
    intent, _ = _seed_paid(db, uid, key="adm-edit-manual", with_usage=True)
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="adm-edit-manual",
    )
    assert req.status == RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value
    db.refresh(req)
    current = (
        db.query(RefundRevision)
        .filter(
            RefundRevision.refund_request_id == req.id,
            RefundRevision.revision_number == req.current_revision_number,
        )
        .one()
    )

    from backend.services.refund_revisions import create_admin_revision

    create_admin_revision(
        db,
        req.id,
        based_on_revision_id=current.id,
        admin_user_id=admin_uid,
        expected_version=req.version,
        proposed_refund_amount=Decimal("50.00"),
        adjustment_reason_category="goodwill",
        adjustment_comment="manual pool usage reviewed",
    )
    db.expire_all()
    req = db.query(RefundRequest).filter(RefundRequest.id == req.id).one()
    assert req.status == RefundRequestStatus.ADMIN_EDITED.value
    assert req.status != RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value

    by_status_only = client.get(
        "/api/admin/refunds",
        headers=admin_headers,
        params={"status": RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value},
    )
    assert by_status_only.status_code == 200
    assert all(i["id"] != req.id for i in by_status_only.json()["items"])

    by_manual = client.get(
        "/api/admin/refunds",
        headers=admin_headers,
        params={"manual_review": True, "user_id": uid},
    )
    assert by_manual.status_code == 200, by_manual.text
    items = by_manual.json()["items"]
    match = next((i for i in items if i["id"] == req.id), None)
    assert match is not None
    assert match["status"] == RefundRequestStatus.ADMIN_EDITED.value
    assert match["manual_review_required"] is True
    assert match["recommended_refund_amount"] == "50.00"

    detail = client.get(f"/api/admin/refunds/{req.id}", headers=admin_headers)
    assert detail.status_code == 200
    body = detail.json()
    assert body["request"]["status"] == RefundRequestStatus.ADMIN_EDITED.value
    assert body["request"]["manual_review_required"] is True
    assert body["request"]["recommended_refund_amount"] == "50.00"
    assert body["current_revision"]["proposed_refund_amount"] == "50.00"
    assert body["current_revision"]["proposed_amount_undefined"] is False


def test_read_endpoints_do_not_mutate(client, db):
    admin_headers, _ = _auth(client, db, role="admin")
    _, uid = _auth(client, db)
    intent, _ = _seed_paid(db, uid, key="adm-ro")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="adm-ro",
    )
    db.refresh(req)
    before = {
        "status": req.status,
        "version": req.version,
        "updated_at": req.updated_at,
        "current_revision_number": req.current_revision_number,
        "approved_revision_id": req.approved_revision_id,
        "audit_count": db.query(RefundAuditEvent)
        .filter(RefundAuditEvent.refund_request_id == req.id)
        .count(),
        "revision_count": db.query(RefundRevision)
        .filter(RefundRevision.refund_request_id == req.id)
        .count(),
    }

    assert (
        client.get("/api/admin/refunds", headers=admin_headers, params={"user_id": uid}).status_code
        == 200
    )
    assert client.get(f"/api/admin/refunds/{req.id}", headers=admin_headers).status_code == 200

    db.expire_all()
    after = db.query(RefundRequest).filter(RefundRequest.id == req.id).one()
    assert after.status == before["status"]
    assert after.version == before["version"]
    assert after.updated_at == before["updated_at"]
    assert after.current_revision_number == before["current_revision_number"]
    assert after.approved_revision_id == before["approved_revision_id"]
    assert (
        db.query(RefundAuditEvent)
        .filter(RefundAuditEvent.refund_request_id == req.id)
        .count()
        == before["audit_count"]
    )
    assert (
        db.query(RefundRevision)
        .filter(RefundRevision.refund_request_id == req.id)
        .count()
        == before["revision_count"]
    )
