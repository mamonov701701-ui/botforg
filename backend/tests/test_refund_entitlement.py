"""Этап 6.14.8: refund entitlement apply after money-confirmed refund."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import patch

import pytest

from backend.models.checkout import (
    CheckoutIntent,
    CheckoutIntentStatus,
    CheckoutProductType,
    PaymentAttempt,
    PaymentAttemptStatus,
)
from backend.models.plan import Plan
from backend.models.refund import (
    RefundAuditAction,
    RefundAuditEvent,
    RefundEntitlementAction,
    RefundLedgerEntry,
    RefundLedgerEntryType,
    RefundRequest,
    RefundRequestStatus,
    RefundRevision,
)
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    GiftGrantStatus,
    GiftType,
    SubscriptionStatus,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
    UserSubscription,
)
from backend.models.user import User
from backend.payments.registry import clear_provider_cache
from backend.services.refund_entitlement import apply_refund_entitlement
from backend.services.refund_submit import create_refund_request
from backend.services.tariff_entitlements import activate_subscription, grant_gift
from backend.settings import settings
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _clear_provider_cache():
    clear_provider_cache()
    yield
    clear_provider_cache()


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


def _plan(db) -> Plan:
    plan = db.query(Plan).filter(Plan.code == "pro").first()
    if plan:
        return plan
    plan = Plan(
        code="pro",
        name="Pro",
        name_ru="Pro",
        price_month=Decimal("990.00"),
        currency="RUB",
        is_active=True,
        is_public=True,
        sort_order=2,
        limits={
            "monthly_messages": 5000,
            "max_active_bots": 5,
            "max_team_members": 3,
        },
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


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


def _mark_money_done(
    db,
    *,
    req: RefundRequest,
    rev: RefundRevision,
    attempt: PaymentAttempt,
    status: str = RefundRequestStatus.REFUNDED.value,
):
    entry = RefundLedgerEntry(
        refund_request_id=req.id,
        refund_revision_id=rev.id,
        checkout_intent_id=req.checkout_intent_id,
        payment_attempt_id=attempt.id,
        entry_type=RefundLedgerEntryType.SUCCEEDED.value,
        amount=rev.final_refund_amount or rev.proposed_refund_amount or Decimal("190.00"),
        currency="RUB",
        idempotency_key=f"bf-rf-{req.id}-r{rev.id}",
        provider_refund_id=f"rf_{req.id}",
        provider_status="succeeded",
    )
    db.add(entry)
    req.status = status
    req.completed_at = _utc()
    db.add(req)
    db.commit()
    db.refresh(req)
    return entry


def _create_approved_addon(client, db, *, key: str, amount: Decimal | None = None):
    admin_headers, admin_uid = _auth(client, db, role="admin")
    _uh, uid = _auth(client, db)
    paid_at = _utc() - timedelta(hours=1)
    pkg = _addon_pkg(db)
    addon = UserAddon(
        user_id=uid,
        addon_package_id=pkg.id,
        amount=1000,
        period_start=paid_at,
        period_end=paid_at + timedelta(days=30),
        status=UserAddonStatus.ACTIVE.value,
        source=UserAddonSource.PURCHASE.value,
        provider_ref=f"fake:pay_{key}",
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
        idempotency_key=f"ci-{key}",
        payment_provider="fake",
        provider_payment_id=f"pay_{key}",
        paid_at=paid_at,
        fulfilled_at=paid_at,
        fulfilled_addon_id=addon.id,
    )
    db.add(intent)
    db.flush()
    attempt = PaymentAttempt(
        checkout_intent_id=intent.id,
        user_id=uid,
        provider="fake",
        provider_payment_id=f"pay_{key}",
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

    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key=f"idem-{key}",
    )
    db.refresh(req)
    rev = (
        db.query(RefundRevision)
        .filter(RefundRevision.refund_request_id == req.id)
        .order_by(RefundRevision.revision_number.desc())
        .first()
    )
    assert rev is not None
    if amount is not None:
        rev.proposed_refund_amount = amount
        rev.final_refund_amount = amount
        db.commit()
        db.refresh(rev)

    resp = client.post(
        f"/api/admin/refunds/{req.id}/approve",
        json={"expected_version": req.version, "revision_id": rev.id},
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    db.refresh(req)
    db.refresh(rev)
    return {
        "admin_headers": admin_headers,
        "admin_uid": admin_uid,
        "uid": uid,
        "intent": intent,
        "attempt": attempt,
        "addon": addon,
        "req": req,
        "rev": rev,
    }


def _create_approved_tariff(client, db, *, key: str):
    admin_headers, admin_uid = _auth(client, db, role="admin")
    _uh, uid = _auth(client, db)
    plan = _plan(db)
    paid_at = _utc() - timedelta(hours=1)
    period_end = paid_at + timedelta(days=30)
    sub = activate_subscription(
        db,
        user_id=uid,
        plan_id=plan.id,
        period_start=paid_at,
        period_end=period_end,
        provider_subscription_id=f"fake:pay_{key}",
        replace_active=True,
        commit=True,
    )
    # Second active sub that must NOT be touched
    other = activate_subscription(
        db,
        user_id=uid,
        plan_id=plan.id,
        period_start=paid_at + timedelta(days=31),
        period_end=paid_at + timedelta(days=60),
        provider_subscription_id=f"fake:other_{key}",
        replace_active=False,
        commit=True,
    )
    intent = CheckoutIntent(
        user_id=uid,
        product_type=CheckoutProductType.TARIFF.value,
        product_code=plan.code,
        product_name=plan.name_ru or plan.name,
        amount=Decimal("990.00"),
        currency="RUB",
        status=CheckoutIntentStatus.FULFILLED.value,
        idempotency_key=f"ci-t-{key}",
        payment_provider="fake",
        provider_payment_id=f"pay_{key}",
        paid_at=paid_at,
        fulfilled_at=paid_at,
        fulfilled_subscription_id=sub.id,
    )
    db.add(intent)
    db.flush()
    attempt = PaymentAttempt(
        checkout_intent_id=intent.id,
        user_id=uid,
        provider="fake",
        provider_payment_id=f"pay_{key}",
        amount=Decimal("990.00"),
        currency="RUB",
        status=PaymentAttemptStatus.SUCCEEDED.value,
        idempotency_key=f"pay-t-{key}",
    )
    db.add(attempt)
    db.commit()
    db.refresh(intent)
    db.refresh(attempt)

    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key=f"idem-t-{key}",
    )
    db.refresh(req)
    rev = (
        db.query(RefundRevision)
        .filter(RefundRevision.refund_request_id == req.id)
        .order_by(RefundRevision.revision_number.desc())
        .first()
    )
    assert rev is not None
    rev.entitlement_action = RefundEntitlementAction.CANCEL_IMMEDIATE.value
    rev.proposed_refund_amount = Decimal("990.00")
    rev.final_refund_amount = Decimal("990.00")
    db.commit()
    db.refresh(rev)

    resp = client.post(
        f"/api/admin/refunds/{req.id}/approve",
        json={"expected_version": req.version, "revision_id": rev.id},
        headers=admin_headers,
    )
    assert resp.status_code == 200, resp.text
    db.refresh(req)
    db.refresh(rev)
    return {
        "admin_headers": admin_headers,
        "admin_uid": admin_uid,
        "uid": uid,
        "intent": intent,
        "attempt": attempt,
        "sub": sub,
        "other_sub": other,
        "req": req,
        "rev": rev,
        "plan": plan,
    }


def _enable_fake(monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_FAKE_PAYMENT_PROVIDER", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER_TEST_MODE", True)
    clear_provider_cache()


def test_cancel_subscription_immediate(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_tariff(client, db, key="sub-imm")
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    res = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/apply-entitlement",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["outcome"] == "applied"
    assert body["applied_action"] == RefundEntitlementAction.CANCEL_IMMEDIATE.value
    assert body["target_type"] == "subscription"
    assert body["target_id"] == ctx["sub"].id
    db.refresh(ctx["sub"])
    db.refresh(ctx["other_sub"])
    db.refresh(ctx["req"])
    assert ctx["sub"].status == SubscriptionStatus.CANCELLED.value
    assert ctx["other_sub"].status == SubscriptionStatus.ACTIVE.value
    assert ctx["req"].status == RefundRequestStatus.COMPLETED.value


def test_cancel_subscription_at(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_tariff(client, db, key="sub-at")
    future = _utc() + timedelta(days=7)
    ctx["rev"].entitlement_action = RefundEntitlementAction.CANCEL_AT.value
    ctx["rev"].entitlement_effective_at = future
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    res = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/apply-entitlement",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert res.status_code == 200, res.text
    assert res.json()["outcome"] == "applied"
    db.refresh(ctx["sub"])
    assert ctx["sub"].status == SubscriptionStatus.ACTIVE.value
    assert ctx["sub"].auto_renew is False
    end = ctx["sub"].current_period_end
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    assert abs((end - future).total_seconds()) < 2


def test_already_cancelled_subscription_idempotent(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_tariff(client, db, key="sub-done")
    ctx["sub"].status = SubscriptionStatus.CANCELLED.value
    ctx["sub"].cancelled_at = _utc()
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    res = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/apply-entitlement",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert res.status_code == 200
    assert res.json()["outcome"] == "already_applied"
    db.refresh(ctx["req"])
    assert ctx["req"].status == RefundRequestStatus.COMPLETED.value


def test_does_not_cancel_other_subscription(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_tariff(client, db, key="sub-other")
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    apply_refund_entitlement(
        db,
        ctx["req"].id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["admin_uid"],
    )
    db.refresh(ctx["other_sub"])
    assert ctx["other_sub"].status == SubscriptionStatus.ACTIVE.value


def test_cancel_addon_without_usage(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_addon(client, db, key="add-ok")
    ctx["rev"].entitlement_action = RefundEntitlementAction.CANCEL_ADDON.value
    ctx["rev"].addon_revoke_units = 1000
    ctx["rev"].usage_snapshot = {"detectable_pool_usage_after_purchase": False}
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    res = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/apply-entitlement",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert res.status_code == 200, res.text
    assert res.json()["outcome"] == "applied"
    db.refresh(ctx["addon"])
    assert ctx["addon"].status == UserAddonStatus.CANCELLED.value


def test_reduce_addon_safe(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_addon(client, db, key="add-red")
    ctx["rev"].entitlement_action = RefundEntitlementAction.REDUCE_AMOUNT.value
    ctx["rev"].addon_revoke_units = 400
    ctx["rev"].addon_total_units = 1000
    ctx["rev"].usage_snapshot = {"detectable_pool_usage_after_purchase": False}
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    res = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/apply-entitlement",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert res.status_code == 200, res.text
    assert res.json()["outcome"] == "applied"
    db.refresh(ctx["addon"])
    assert ctx["addon"].amount == 600
    assert ctx["addon"].status == UserAddonStatus.ACTIVE.value


def test_reduce_rejects_negative(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_addon(client, db, key="add-neg")
    ctx["rev"].entitlement_action = RefundEntitlementAction.REDUCE_AMOUNT.value
    ctx["rev"].addon_revoke_units = -1
    ctx["rev"].usage_snapshot = {"detectable_pool_usage_after_purchase": False}
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    # Schema ge=0 on admin edit; set via DB for service path
    result = apply_refund_entitlement(
        db,
        ctx["req"].id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["admin_uid"],
    )
    assert result.outcome == "failed"
    assert result.error_code == "negative_revoke_units"
    db.refresh(ctx["addon"])
    assert ctx["addon"].amount == 1000
    db.refresh(ctx["req"])
    assert ctx["req"].status == RefundRequestStatus.ENTITLEMENT_FAILED.value


def test_reduce_rejects_below_usage(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_addon(client, db, key="add-usage")
    ctx["rev"].entitlement_action = RefundEntitlementAction.REDUCE_AMOUNT.value
    ctx["rev"].addon_revoke_units = 1000
    ctx["rev"].addon_total_units = 1000
    ctx["rev"].usage_snapshot = {"detectable_pool_usage_after_purchase": False}
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])

    class _Limits:
        messages_limit = 1000
        messages_used = 700
        active_bots_limit = None
        active_bots_used = 0
        team_members_limit = None
        team_members_used = 0

    with patch(
        "backend.services.refund_entitlement.get_user_tariff_limits",
        return_value=_Limits(),
    ):
        result = apply_refund_entitlement(
            db,
            ctx["req"].id,
            expected_version=ctx["req"].version,
            actor_user_id=ctx["admin_uid"],
        )
    assert result.outcome == "failed"
    assert result.error_code == "limit_below_usage"
    db.refresh(ctx["addon"])
    assert ctx["addon"].amount == 1000


def test_pool_usage_unattributed_blocks_cancel(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_addon(client, db, key="add-pool")
    ctx["rev"].entitlement_action = RefundEntitlementAction.CANCEL_ADDON.value
    ctx["rev"].usage_snapshot = {"detectable_pool_usage_after_purchase": True}
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    result = apply_refund_entitlement(
        db,
        ctx["req"].id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["admin_uid"],
    )
    assert result.outcome == "failed"
    assert result.error_code == "pool_usage_unattributed"
    db.refresh(ctx["addon"])
    assert ctx["addon"].status == UserAddonStatus.ACTIVE.value
    audits = (
        db.query(RefundAuditEvent)
        .filter(
            RefundAuditEvent.refund_request_id == ctx["req"].id,
            RefundAuditEvent.action
            == RefundAuditAction.ENTITLEMENT_MANUAL_REQUIRED.value,
        )
        .count()
    )
    assert audits == 1


def test_gifts_unchanged(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_addon(client, db, key="add-gift")
    gift = grant_gift(
        db,
        target_user_id=ctx["uid"],
        gift_type=GiftType.MESSAGES,
        starts_at=_utc() - timedelta(hours=1),
        ends_at=_utc() + timedelta(days=10),
        granted_by_user_id=ctx["admin_uid"],
        amount=50,
        reason="test",
        commit=True,
    )
    ctx["rev"].entitlement_action = RefundEntitlementAction.CANCEL_ADDON.value
    ctx["rev"].usage_snapshot = {"detectable_pool_usage_after_purchase": False}
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    apply_refund_entitlement(
        db,
        ctx["req"].id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["admin_uid"],
    )
    db.refresh(gift)
    assert gift.status == GiftGrantStatus.ACTIVE


def test_action_none_completes(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_addon(client, db, key="add-none")
    ctx["rev"].entitlement_action = RefundEntitlementAction.NONE.value
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    res = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/apply-entitlement",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert res.status_code == 200
    assert res.json()["outcome"] == "not_required"
    db.refresh(ctx["addon"])
    assert ctx["addon"].status == UserAddonStatus.ACTIVE.value
    db.refresh(ctx["req"])
    assert ctx["req"].status == RefundRequestStatus.COMPLETED.value


def test_repeat_command_idempotent(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_addon(client, db, key="add-rep")
    ctx["rev"].entitlement_action = RefundEntitlementAction.CANCEL_ADDON.value
    ctx["rev"].usage_snapshot = {"detectable_pool_usage_after_purchase": False}
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    r1 = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/apply-entitlement",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert r1.status_code == 200
    db.refresh(ctx["req"])
    r2 = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/apply-entitlement",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert r2.status_code == 200
    assert r2.json()["already_applied"] is True
    db.refresh(ctx["addon"])
    assert ctx["addon"].status == UserAddonStatus.CANCELLED.value


def test_retry_after_entitlement_failed(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_addon(client, db, key="add-retry")
    ctx["rev"].entitlement_action = RefundEntitlementAction.CANCEL_ADDON.value
    ctx["rev"].usage_snapshot = {"detectable_pool_usage_after_purchase": True}
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    first = apply_refund_entitlement(
        db,
        ctx["req"].id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["admin_uid"],
    )
    assert first.outcome == "failed"
    db.refresh(ctx["req"])
    assert ctx["req"].status == RefundRequestStatus.ENTITLEMENT_FAILED.value
    # Fix revision and retry
    ctx["rev"].usage_snapshot = {"detectable_pool_usage_after_purchase": False}
    db.commit()
    db.refresh(ctx["req"])
    second = apply_refund_entitlement(
        db,
        ctx["req"].id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["admin_uid"],
    )
    assert second.outcome == "applied"
    db.refresh(ctx["req"])
    assert ctx["req"].status == RefundRequestStatus.COMPLETED.value


def test_optimistic_locking(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_addon(client, db, key="add-lock")
    ctx["rev"].entitlement_action = RefundEntitlementAction.NONE.value
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    res = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/apply-entitlement",
        json={"expected_version": ctx["req"].version + 99},
        headers=ctx["admin_headers"],
    )
    assert res.status_code == 409
    assert res.json()["detail"]["code"] == "version_conflict"


def test_ledger_unchanged_and_no_provider(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_addon(client, db, key="add-led")
    ctx["rev"].entitlement_action = RefundEntitlementAction.CANCEL_ADDON.value
    ctx["rev"].usage_snapshot = {"detectable_pool_usage_after_purchase": False}
    db.commit()
    entry = _mark_money_done(
        db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"]
    )
    before = (
        db.query(RefundLedgerEntry)
        .filter(RefundLedgerEntry.refund_request_id == ctx["req"].id)
        .count()
    )
    db.refresh(ctx["req"])
    with patch(
        "backend.payments.providers.fake.FakePaymentProvider.refund_payment"
    ) as refund_mock:
        apply_refund_entitlement(
            db,
            ctx["req"].id,
            expected_version=ctx["req"].version,
            actor_user_id=ctx["admin_uid"],
        )
        refund_mock.assert_not_called()
    after = (
        db.query(RefundLedgerEntry)
        .filter(RefundLedgerEntry.refund_request_id == ctx["req"].id)
        .count()
    )
    assert after == before
    db.refresh(entry)
    assert entry.entry_type == RefundLedgerEntryType.SUCCEEDED.value
    assert entry.amount == Decimal("190.00")


def test_revoke_exceeds_grant(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_addon(client, db, key="add-ex")
    ctx["rev"].entitlement_action = RefundEntitlementAction.REDUCE_AMOUNT.value
    ctx["rev"].addon_revoke_units = 2000
    ctx["rev"].addon_total_units = 1000
    ctx["rev"].usage_snapshot = {"detectable_pool_usage_after_purchase": False}
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    result = apply_refund_entitlement(
        db,
        ctx["req"].id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["admin_uid"],
    )
    assert result.outcome == "failed"
    assert result.error_code == "revoke_exceeds_grant"


def test_cancel_at_already_applied_matching_date(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_tariff(client, db, key="sub-at-match")
    future = _utc() + timedelta(days=7)
    ctx["rev"].entitlement_action = RefundEntitlementAction.CANCEL_AT.value
    ctx["rev"].entitlement_effective_at = future
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    # Pre-apply the approved end date on the target subscription only.
    ctx["sub"].current_period_end = future
    ctx["sub"].auto_renew = False
    db.commit()
    res = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/apply-entitlement",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["outcome"] == "already_applied"
    db.refresh(ctx["sub"])
    db.refresh(ctx["req"])
    assert ctx["sub"].status == SubscriptionStatus.ACTIVE.value
    assert ctx["req"].status == RefundRequestStatus.COMPLETED.value


def test_cancel_at_different_date_not_already_applied(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_tariff(client, db, key="sub-at-diff")
    approved = _utc() + timedelta(days=10)
    other_end = _utc() + timedelta(days=3)
    ctx["rev"].entitlement_action = RefundEntitlementAction.CANCEL_AT.value
    ctx["rev"].entitlement_effective_at = approved
    db.commit()
    # Target already truncated to a different (earlier) date.
    ctx["sub"].current_period_end = other_end
    ctx["sub"].auto_renew = False
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    result = apply_refund_entitlement(
        db,
        ctx["req"].id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["admin_uid"],
    )
    assert result.outcome == "failed"
    assert result.error_code == "incompatible_entitlement_state"
    db.refresh(ctx["sub"])
    db.refresh(ctx["req"])
    assert ctx["req"].status == RefundRequestStatus.ENTITLEMENT_FAILED.value
    end = ctx["sub"].current_period_end
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    assert abs((end - other_end).total_seconds()) < 2


def test_expire_at_already_applied_matching_date(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_tariff(client, db, key="sub-exp-match")
    future = _utc() + timedelta(days=5)
    ctx["rev"].entitlement_action = RefundEntitlementAction.EXPIRE_AT.value
    ctx["rev"].entitlement_effective_at = future
    db.commit()
    ctx["sub"].current_period_end = future
    ctx["sub"].auto_renew = False
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    res = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/apply-entitlement",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert res.status_code == 200, res.text
    assert res.json()["outcome"] == "already_applied"
    db.refresh(ctx["req"])
    assert ctx["req"].status == RefundRequestStatus.COMPLETED.value


def test_expire_at_different_date_not_already_applied(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_tariff(client, db, key="sub-exp-diff")
    approved = _utc() + timedelta(days=12)
    ctx["rev"].entitlement_action = RefundEntitlementAction.EXPIRE_AT.value
    ctx["rev"].entitlement_effective_at = approved
    db.commit()
    # Already CANCELLED for another reason while approved date is still future.
    ctx["sub"].status = SubscriptionStatus.CANCELLED.value
    ctx["sub"].cancelled_at = _utc()
    ctx["sub"].current_period_end = _utc() + timedelta(days=2)
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    result = apply_refund_entitlement(
        db,
        ctx["req"].id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["admin_uid"],
    )
    assert result.outcome == "failed"
    assert result.error_code == "incompatible_entitlement_state"
    db.refresh(ctx["req"])
    assert ctx["req"].status == RefundRequestStatus.ENTITLEMENT_FAILED.value


def test_partial_refund_cancel_at_no_immediate_cancel(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_tariff(client, db, key="sub-part-at")
    future = _utc() + timedelta(days=14)
    ctx["rev"].entitlement_action = RefundEntitlementAction.CANCEL_AT.value
    ctx["rev"].entitlement_effective_at = future
    ctx["rev"].final_refund_amount = Decimal("300.00")
    db.commit()
    _mark_money_done(
        db,
        req=ctx["req"],
        rev=ctx["rev"],
        attempt=ctx["attempt"],
        status=RefundRequestStatus.PARTIALLY_REFUNDED.value,
    )
    db.refresh(ctx["req"])
    res = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/apply-entitlement",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert res.status_code == 200, res.text
    assert res.json()["outcome"] == "applied"
    db.refresh(ctx["sub"])
    assert ctx["sub"].status == SubscriptionStatus.ACTIVE.value
    assert ctx["sub"].auto_renew is False
    end = ctx["sub"].current_period_end
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    assert abs((end - future).total_seconds()) < 2


def test_other_active_addon_unchanged(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_addon(client, db, key="add-iso")
    pkg = _addon_pkg(db)
    other = UserAddon(
        user_id=ctx["uid"],
        addon_package_id=pkg.id,
        amount=500,
        period_start=_utc() - timedelta(hours=1),
        period_end=_utc() + timedelta(days=30),
        status=UserAddonStatus.ACTIVE.value,
        source=UserAddonSource.PURCHASE.value,
        provider_ref="fake:other_addon_iso",
    )
    db.add(other)
    db.commit()
    db.refresh(other)
    other_id = other.id
    other_amount = other.amount
    ctx["rev"].entitlement_action = RefundEntitlementAction.CANCEL_ADDON.value
    ctx["rev"].addon_revoke_units = 1000
    ctx["rev"].usage_snapshot = {"detectable_pool_usage_after_purchase": False}
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    res = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/apply-entitlement",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert res.status_code == 200, res.text
    db.refresh(ctx["addon"])
    other2 = db.get(UserAddon, other_id)
    assert ctx["addon"].status == UserAddonStatus.CANCELLED.value
    assert other2 is not None
    assert other2.status == UserAddonStatus.ACTIVE.value
    assert other2.amount == other_amount


def test_reduce_blocked_on_unattributed_pool_usage(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_addon(client, db, key="add-red-pool")
    ctx["rev"].entitlement_action = RefundEntitlementAction.REDUCE_AMOUNT.value
    ctx["rev"].addon_revoke_units = 400
    ctx["rev"].addon_total_units = 1000
    ctx["rev"].usage_snapshot = {"detectable_pool_usage_after_purchase": True}
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    result = apply_refund_entitlement(
        db,
        ctx["req"].id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["admin_uid"],
    )
    assert result.outcome == "failed"
    assert result.error_code == "pool_usage_unattributed"
    db.refresh(ctx["addon"])
    db.refresh(ctx["req"])
    assert ctx["addon"].amount == 1000
    assert ctx["addon"].status == UserAddonStatus.ACTIVE.value
    assert ctx["req"].status == RefundRequestStatus.ENTITLEMENT_FAILED.value
    assert (
        db.query(RefundAuditEvent)
        .filter(
            RefundAuditEvent.refund_request_id == ctx["req"].id,
            RefundAuditEvent.action
            == RefundAuditAction.ENTITLEMENT_MANUAL_REQUIRED.value,
        )
        .count()
        >= 1
    )


def test_concurrent_apply_entitlement_no_double(client, db, monkeypatch):
    """
    Два применения с одним expected_version (модель гонки) не снижают amount дважды.
    """
    from backend.services.refund_entitlement import RefundEntitlementError

    _enable_fake(monkeypatch)
    ctx = _create_approved_addon(client, db, key="add-race")
    ctx["rev"].entitlement_action = RefundEntitlementAction.REDUCE_AMOUNT.value
    ctx["rev"].addon_revoke_units = 400
    ctx["rev"].addon_total_units = 1000
    ctx["rev"].usage_snapshot = {"detectable_pool_usage_after_purchase": False}
    db.commit()
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])
    stale_version = ctx["req"].version

    first = apply_refund_entitlement(
        db,
        ctx["req"].id,
        expected_version=stale_version,
        actor_user_id=ctx["admin_uid"],
    )
    assert first.outcome == "applied"
    db.refresh(ctx["addon"])
    assert ctx["addon"].amount == 600

    second_outcome: str | None = None
    try:
        second = apply_refund_entitlement(
            db,
            ctx["req"].id,
            expected_version=stale_version,
            actor_user_id=ctx["admin_uid"],
        )
        second_outcome = second.outcome
    except RefundEntitlementError as exc:
        second_outcome = f"error:{exc.code}"

    db.refresh(ctx["addon"])
    db.refresh(ctx["req"])
    # Double apply would be 1000→600→200; must remain 600.
    assert ctx["addon"].amount == 600
    assert second_outcome in {
        "already_applied",
        "failed",
        "error:version_conflict",
        "error:apply_not_allowed",
        "error:apply_in_progress",
    }
    applied_audits = (
        db.query(RefundAuditEvent)
        .filter(
            RefundAuditEvent.refund_request_id == ctx["req"].id,
            RefundAuditEvent.action == RefundAuditAction.ENTITLEMENT_APPLIED.value,
        )
        .count()
    )
    assert applied_audits == 1

    # Retry with current version after completion → idempotent.
    db.refresh(ctx["req"])
    if ctx["req"].status == RefundRequestStatus.COMPLETED.value:
        third = apply_refund_entitlement(
            db,
            ctx["req"].id,
            expected_version=ctx["req"].version,
            actor_user_id=ctx["admin_uid"],
        )
        assert third.outcome == "already_applied"
        db.refresh(ctx["addon"])
        assert ctx["addon"].amount == 600


def test_unexpected_exception_leaves_entitlement_failed(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _create_approved_tariff(client, db, key="sub-boom")
    _mark_money_done(db, req=ctx["req"], rev=ctx["rev"], attempt=ctx["attempt"])
    db.refresh(ctx["req"])

    with patch(
        "backend.services.refund_entitlement.cancel_subscription_immediate",
        side_effect=RuntimeError("boom"),
    ):
        result = apply_refund_entitlement(
            db,
            ctx["req"].id,
            expected_version=ctx["req"].version,
            actor_user_id=ctx["admin_uid"],
        )
    assert result.outcome == "failed"
    assert result.error_code == "unexpected_error"
    db.refresh(ctx["req"])
    assert ctx["req"].status == RefundRequestStatus.ENTITLEMENT_FAILED.value
    assert ctx["req"].status != RefundRequestStatus.ENTITLEMENT_PROCESSING.value
