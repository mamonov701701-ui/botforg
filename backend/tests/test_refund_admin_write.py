"""Этап 6.14.3.5: admin write refund API."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
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
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
)
from backend.models.user import User
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
    db.commit()
    db.refresh(intent)
    db.refresh(attempt)
    db.refresh(addon)
    return intent, attempt, addon


def _create_open(client, db, *, key: str, role_admin: bool = True):
    admin_headers, admin_uid = _auth(client, db, role="admin" if role_admin else None)
    user_headers, uid = _auth(client, db)
    intent, attempt, addon = _seed_paid(db, uid, key=key)
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key=f"idem-{key}",
    )
    db.refresh(req)
    return {
        "admin_headers": admin_headers,
        "admin_uid": admin_uid,
        "user_headers": user_headers,
        "uid": uid,
        "intent": intent,
        "attempt": attempt,
        "addon": addon,
        "req": req,
    }


def _current_revision(db, req: RefundRequest) -> RefundRevision:
    return (
        db.query(RefundRevision)
        .filter(
            RefundRevision.refund_request_id == req.id,
            RefundRevision.revision_number == req.current_revision_number,
        )
        .one()
    )


def test_regular_user_admin_actions_forbidden(client, db):
    _auth(client, db)
    headers, uid = _auth(client, db)
    user = db.query(User).filter(User.id == uid).one()
    assert user.role == "user"
    intent, _, _ = _seed_paid(db, uid, key="aw-forbid")
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="idem-aw-forbid",
    )
    for path, payload in (
        (f"/api/admin/refunds/{req.id}/recalculate", {"expected_version": req.version}),
        (
            f"/api/admin/refunds/{req.id}/revisions",
            {
                "expected_version": req.version,
                "based_on_revision_id": 1,
                "proposed_refund_amount": "10.00",
                "adjustment_reason_category": "x",
                "adjustment_comment": "y",
            },
        ),
        (
            f"/api/admin/refunds/{req.id}/needs-information",
            {"expected_version": req.version, "reason": "need docs"},
        ),
        (
            f"/api/admin/refunds/{req.id}/reject",
            {"expected_version": req.version, "reason": "no"},
        ),
        (f"/api/admin/refunds/{req.id}/confirm", {"expected_version": req.version}),
        (
            f"/api/admin/refunds/{req.id}/approve",
            {"expected_version": req.version, "revision_id": 1},
        ),
    ):
        res = client.post(path, json=payload, headers=headers)
        assert res.status_code == 403, path


def test_recalculate_creates_new_immutable_revision(client, db):
    ctx = _create_open(client, db, key="aw-recalc")
    req = ctx["req"]
    old = _current_revision(db, req)
    old_id = old.id
    old_number = old.revision_number
    old_proposed = Decimal(str(old.proposed_refund_amount))
    old_snap = dict(old.calculation_snapshot or {})

    res = client.post(
        f"/api/admin/refunds/{req.id}/recalculate",
        json={"expected_version": req.version},
        headers=ctx["admin_headers"],
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["request"]["current_revision_number"] == old_number + 1
    assert len(body["revisions"]) >= 2

    db.expire_all()
    unchanged = db.query(RefundRevision).filter(RefundRevision.id == old_id).one()
    assert unchanged.revision_number == old_number
    assert Decimal(str(unchanged.proposed_refund_amount)) == old_proposed
    assert unchanged.calculation_snapshot == old_snap

    new = _current_revision(db, db.get(RefundRequest, req.id))
    assert new.id != old_id
    assert new.revision_number == old_number + 1


def test_admin_edit_requires_reason_and_comment(client, db):
    ctx = _create_open(client, db, key="aw-edit-req")
    req = ctx["req"]
    rev = _current_revision(db, req)

    missing = client.post(
        f"/api/admin/refunds/{req.id}/revisions",
        json={
            "expected_version": req.version,
            "based_on_revision_id": rev.id,
            "proposed_refund_amount": "50.00",
            "adjustment_reason_category": "",
            "adjustment_comment": "comment",
        },
        headers=ctx["admin_headers"],
    )
    assert missing.status_code == 422

    missing2 = client.post(
        f"/api/admin/refunds/{req.id}/revisions",
        json={
            "expected_version": req.version,
            "based_on_revision_id": rev.id,
            "proposed_refund_amount": "50.00",
            "adjustment_reason_category": "policy",
            "adjustment_comment": "",
        },
        headers=ctx["admin_headers"],
    )
    assert missing2.status_code == 422


def test_admin_edit_does_not_mutate_old_revision(client, db):
    ctx = _create_open(client, db, key="aw-edit-immut")
    req = ctx["req"]
    old = _current_revision(db, req)
    old_id = old.id
    old_amount = Decimal(str(old.proposed_refund_amount))
    old_comment = old.adjustment_comment

    res = client.post(
        f"/api/admin/refunds/{req.id}/revisions",
        json={
            "expected_version": req.version,
            "based_on_revision_id": old.id,
            "proposed_refund_amount": "50.00",
            "adjustment_reason_category": "policy",
            "adjustment_comment": "adjusted by admin",
        },
        headers=ctx["admin_headers"],
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["request"]["status"] == RefundRequestStatus.ADMIN_EDITED.value
    assert body["current_revision"]["proposed_refund_amount"] == "50.00"
    assert body["current_revision"]["id"] != old_id

    db.expire_all()
    unchanged = db.query(RefundRevision).filter(RefundRevision.id == old_id).one()
    assert Decimal(str(unchanged.proposed_refund_amount)) == old_amount
    assert unchanged.adjustment_comment == old_comment


def test_stale_version_forbidden(client, db):
    ctx = _create_open(client, db, key="aw-ver")
    req = ctx["req"]
    res = client.post(
        f"/api/admin/refunds/{req.id}/recalculate",
        json={"expected_version": req.version - 1 if req.version > 1 else 0},
        headers=ctx["admin_headers"],
    )
    # expected_version ge=1 → 0 is 422; wrong version is 409
    if req.version == 1:
        res = client.post(
            f"/api/admin/refunds/{req.id}/recalculate",
            json={"expected_version": 999},
            headers=ctx["admin_headers"],
        )
    assert res.status_code == 409, res.text
    assert res.json()["detail"]["code"] == "version_conflict"


def test_needs_information_status_and_audit(client, db):
    ctx = _create_open(client, db, key="aw-need")
    req = ctx["req"]
    res = client.post(
        f"/api/admin/refunds/{req.id}/needs-information",
        json={"expected_version": req.version, "reason": "need invoice"},
        headers=ctx["admin_headers"],
    )
    assert res.status_code == 200, res.text
    assert res.json()["request"]["status"] == RefundRequestStatus.NEEDS_INFORMATION.value

    db.expire_all()
    events = (
        db.query(RefundAuditEvent)
        .filter(RefundAuditEvent.refund_request_id == req.id)
        .all()
    )
    assert any(
        e.action == RefundAuditAction.STATUS_CHANGED.value
        and e.new_status == RefundRequestStatus.NEEDS_INFORMATION.value
        and e.reason == "need invoice"
        for e in events
    )


def test_reject_requires_reason(client, db):
    ctx = _create_open(client, db, key="aw-rej")
    req = ctx["req"]
    empty = client.post(
        f"/api/admin/refunds/{req.id}/reject",
        json={"expected_version": req.version, "reason": ""},
        headers=ctx["admin_headers"],
    )
    assert empty.status_code == 422

    ok = client.post(
        f"/api/admin/refunds/{req.id}/reject",
        json={"expected_version": req.version, "reason": "abuse"},
        headers=ctx["admin_headers"],
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["request"]["status"] == RefundRequestStatus.REJECTED.value


def test_approve_only_current_revision(client, db):
    ctx = _create_open(client, db, key="aw-appr-cur")
    req = ctx["req"]
    first = _current_revision(db, req)

    # Create second revision via recalculate so first is stale by number.
    recalc = client.post(
        f"/api/admin/refunds/{req.id}/recalculate",
        json={"expected_version": req.version},
        headers=ctx["admin_headers"],
    )
    assert recalc.status_code == 200, recalc.text
    db.expire_all()
    req = db.query(RefundRequest).filter(RefundRequest.id == req.id).one()
    current = _current_revision(db, req)
    assert current.id != first.id

    stale_appr = client.post(
        f"/api/admin/refunds/{req.id}/approve",
        json={"expected_version": req.version, "revision_id": first.id},
        headers=ctx["admin_headers"],
    )
    assert stale_appr.status_code == 409, stale_appr.text
    assert stale_appr.json()["detail"]["code"] == "stale_revision"

    ok = client.post(
        f"/api/admin/refunds/{req.id}/approve",
        json={"expected_version": req.version, "revision_id": current.id},
        headers=ctx["admin_headers"],
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["request"]["status"] == RefundRequestStatus.APPROVED.value
    assert body["request"]["approved_revision_id"] == current.id
    assert body["approved_revision"]["id"] == current.id


def test_foreign_or_stale_revision_not_approved(client, db):
    ctx_a = _create_open(client, db, key="aw-frgn-a")
    ctx_b = _create_open(client, db, key="aw-frgn-b")
    req_a = ctx_a["req"]
    rev_b = _current_revision(db, ctx_b["req"])

    foreign = client.post(
        f"/api/admin/refunds/{req_a.id}/approve",
        json={"expected_version": req_a.version, "revision_id": rev_b.id},
        headers=ctx_a["admin_headers"],
    )
    assert foreign.status_code == 409, foreign.text
    assert foreign.json()["detail"]["code"] in {"revision_ownership", "stale_revision"}


def test_repeat_approve_is_safe(client, db):
    ctx = _create_open(client, db, key="aw-reappr")
    req = ctx["req"]
    rev = _current_revision(db, req)

    first = client.post(
        f"/api/admin/refunds/{req.id}/approve",
        json={"expected_version": req.version, "revision_id": rev.id},
        headers=ctx["admin_headers"],
    )
    assert first.status_code == 200, first.text
    approved_id = first.json()["request"]["approved_revision_id"]
    version_after = first.json()["request"]["version"]

    second = client.post(
        f"/api/admin/refunds/{req.id}/approve",
        json={"expected_version": version_after, "revision_id": rev.id},
        headers=ctx["admin_headers"],
    )
    assert second.status_code == 409, second.text
    assert second.json()["detail"]["code"] == "approved_terminal"

    db.expire_all()
    row = db.query(RefundRequest).filter(RefundRequest.id == req.id).one()
    assert row.status == RefundRequestStatus.APPROVED.value
    assert row.approved_revision_id == approved_id
    assert row.version == version_after


def test_provider_and_entitlement_not_invoked(client, db):
    ctx = _create_open(client, db, key="aw-no-prov")
    req = ctx["req"]
    rev = _current_revision(db, req)
    addon_before = db.query(UserAddon).filter(UserAddon.id == ctx["addon"].id).one()
    addon_status_before = addon_before.status
    addon_amount_before = addon_before.amount

    provider_calls: list[str] = []

    def _track_provider(*_a, **_k):
        provider_calls.append("provider")
        raise AssertionError("provider refund must not be called")

    entitlement_calls: list[str] = []

    def _track_entitlement(*_a, **_k):
        entitlement_calls.append("entitlement")
        raise AssertionError("entitlement mutate must not be called")

    with patch(
        "backend.services.refund_revisions.create_admin_revision",
        wraps=__import__(
            "backend.services.refund_revisions", fromlist=["create_admin_revision"]
        ).create_admin_revision,
    ):
        # Ensure no accidental provider/entitlement side modules are invoked.
        with patch.dict(
            "sys.modules",
            {
                "yookassa": MagicMock(Refund=_track_provider),
            },
        ):
            res = client.post(
                f"/api/admin/refunds/{req.id}/approve",
                json={"expected_version": req.version, "revision_id": rev.id},
                headers=ctx["admin_headers"],
            )

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["request"]["status"] == RefundRequestStatus.APPROVED.value
    assert body["request"]["status"] != RefundRequestStatus.REFUND_PROCESSING.value
    assert body["request"]["status"] != RefundRequestStatus.REFUNDED.value
    assert body["request"]["status"] != RefundRequestStatus.ENTITLEMENT_PROCESSING.value
    assert provider_calls == []
    assert entitlement_calls == []

    db.expire_all()
    addon_after = db.query(UserAddon).filter(UserAddon.id == ctx["addon"].id).one()
    assert addon_after.status == addon_status_before
    assert addon_after.amount == addon_amount_before
    row = db.query(RefundRequest).filter(RefundRequest.id == req.id).one()
    assert row.status == RefundRequestStatus.APPROVED.value


def test_reject_with_orphan_approved_revision_id(client, db):
    """awaiting_admin_review + stale approved_revision_id must still reject cleanly."""
    ctx = _create_open(client, db, key="aw-orphan-appr")
    req = ctx["req"]
    rev = _current_revision(db, req)
    req.approved_revision_id = rev.id
    db.commit()
    db.refresh(req)
    assert req.status == RefundRequestStatus.AWAITING_ADMIN_REVIEW.value
    assert req.approved_revision_id == rev.id

    res = client.post(
        f"/api/admin/refunds/{req.id}/reject",
        json={"expected_version": req.version, "reason": "sandbox prep free slot"},
        headers=ctx["admin_headers"],
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["request"]["status"] == RefundRequestStatus.REJECTED.value
    assert body["request"]["approved_revision_id"] is None
    assert "traceback" not in res.text.lower()
    assert "RefundNotificationEnqueueError" not in res.text

    db.expire_all()
    row = db.get(RefundRequest, req.id)
    assert row.status == RefundRequestStatus.REJECTED.value
    assert row.approved_revision_id is None
    events = (
        db.query(RefundAuditEvent)
        .filter(RefundAuditEvent.refund_request_id == req.id)
        .order_by(RefundAuditEvent.id.desc())
        .all()
    )
    assert events[0].action == RefundAuditAction.STATUS_CHANGED.value
    assert events[0].new_status == RefundRequestStatus.REJECTED.value


def test_reject_enqueue_failure_returns_controlled_error(client, db, monkeypatch):
    from backend.services.refund_notification_producer import (
        RefundNotificationEnqueueError,
    )

    ctx = _create_open(client, db, key="aw-rej-enq")
    req = ctx["req"]
    before_ver = req.version

    def _boom(*_a, **_k):
        raise RefundNotificationEnqueueError("forced", code="enqueue_db")

    monkeypatch.setattr(
        "backend.services.refund_notification_producer.enqueue_refund_notification_from_audit",
        _boom,
    )
    res = client.post(
        f"/api/admin/refunds/{req.id}/reject",
        json={"expected_version": before_ver, "reason": "should roll back"},
        headers=ctx["admin_headers"],
    )
    assert res.status_code == 503, res.text
    detail = res.json()["detail"]
    assert detail["code"] == "enqueue_db"
    assert "forced" not in str(detail).lower()
    assert "traceback" not in res.text.lower()

    db.expire_all()
    row = db.get(RefundRequest, req.id)
    assert row.status != RefundRequestStatus.REJECTED.value
    assert row.version == before_ver
