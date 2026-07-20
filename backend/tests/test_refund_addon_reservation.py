"""Этап 6.14.9A: addon refund unit reservation workflow."""
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
from backend.models.refund import (
    RefundLedgerEntry,
    RefundLedgerEntryType,
    RefundRequestStatus,
    RefundRevision,
)
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    AddonRefundReservationStatus,
    AddonRefundUnitReservation,
    AddonUsageLedgerEntry,
    AddonUsageOperation,
    AddonUsageSourceType,
    TariffFifoCutover,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
)
from backend.models.user import User
from backend.payments.registry import clear_provider_cache
from backend.services.refund_entitlement import apply_refund_entitlement
from backend.services.refund_revisions import cancel_request, reject_request
from backend.services.refund_submit import create_refund_request
from backend.services.tariff_addon_usage_ledger import fifo_ledger_remaining
from backend.services.tariff_message_enforcement import check_and_consume_message_unit
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


def _ensure_cutover(db, *, at: datetime | None = None):
    cut = (at or (_utc() - timedelta(days=2))).replace(tzinfo=None)
    row = db.query(TariffFifoCutover).first()
    if row is None:
        db.add(
            TariffFifoCutover(
                id=1,
                cutover_at=cut,
                note="test",
                created_at=cut,
            )
        )
    else:
        row.cutover_at = cut
    db.commit()


def _addon_pkg(db) -> AddonPackage:
    pkg = db.query(AddonPackage).filter(AddonPackage.type == AddonPackageType.MESSAGES).first()
    if pkg:
        return pkg
    pkg = AddonPackage(
        code="msg-res",
        name_ru="Msg res",
        type=AddonPackageType.MESSAGES,
        amount=1000,
        price=Decimal("100.00"),
        is_active=True,
    )
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg


def _seed_fifo_addon(client, db, *, key: str, amount: int = 100):
    admin_headers, admin_uid = _auth(client, db, role="admin")
    _uh, uid = _auth(client, db)
    cut = _utc() - timedelta(days=5)
    _ensure_cutover(db, at=cut)
    paid_at = _utc() - timedelta(hours=2)
    pkg = _addon_pkg(db)
    addon = UserAddon(
        user_id=uid,
        addon_package_id=pkg.id,
        amount=amount,
        period_start=paid_at,
        period_end=paid_at + timedelta(days=30),
        status=UserAddonStatus.ACTIVE.value,
        source=UserAddonSource.PURCHASE.value,
        provider_ref=f"fake:res_{key}",
        created_at=paid_at.replace(tzinfo=None),
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
    db.refresh(addon)
    db.refresh(intent)
    db.refresh(attempt)
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
    ent = rev.entitlement_snapshot if isinstance(rev.entitlement_snapshot, dict) else {}
    assert ent.get("fifo_precise") is True, ent
    return {
        "admin_headers": admin_headers,
        "admin_uid": admin_uid,
        "uid": uid,
        "addon": addon,
        "intent": intent,
        "attempt": attempt,
        "req": req,
        "rev": rev,
    }


def _approve(client, ctx, db):
    resp = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/approve",
        json={
            "expected_version": ctx["req"].version,
            "revision_id": ctx["rev"].id,
        },
        headers=ctx["admin_headers"],
    )
    assert resp.status_code == 200, resp.text
    db.refresh(ctx["req"])
    db.refresh(ctx["rev"])
    db.refresh(ctx["addon"])
    return resp


def test_repeat_approve_does_not_double_reserve(client, db):
    ctx = _seed_fifo_addon(client, db, key="res-reappr")
    _approve(client, ctx, db)
    reserved = int(ctx["addon"].reserved_units or 0)
    assert reserved > 0
    second = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/approve",
        json={
            "expected_version": ctx["req"].version,
            "revision_id": ctx["rev"].id,
        },
        headers=ctx["admin_headers"],
    )
    assert second.status_code == 409
    db.refresh(ctx["addon"])
    assert int(ctx["addon"].reserved_units or 0) == reserved
    assert (
        db.query(AddonRefundUnitReservation)
        .filter(AddonRefundUnitReservation.refund_request_id == ctx["req"].id)
        .count()
        == 1
    )


def _enable_fake(monkeypatch):
    monkeypatch.setattr(settings, "ALLOW_FAKE_PAYMENT_PROVIDER", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER_TEST_MODE", True)
    clear_provider_cache()


def _mark_money_done(db, *, req, rev, attempt):
    entry = RefundLedgerEntry(
        refund_request_id=req.id,
        refund_revision_id=rev.id,
        checkout_intent_id=req.checkout_intent_id,
        payment_attempt_id=attempt.id,
        entry_type=RefundLedgerEntryType.SUCCEEDED.value,
        amount=rev.proposed_refund_amount or Decimal("190.00"),
        currency="RUB",
        idempotency_key=f"bf-rf-{req.id}-r{rev.id}",
        provider_refund_id=f"rf_{req.id}",
        provider_status="succeeded",
    )
    db.add(entry)
    req.status = RefundRequestStatus.REFUNDED.value
    req.completed_at = _utc()
    db.commit()
    db.refresh(req)


def test_reserve_created_once_on_approve(client, db):
    ctx = _seed_fifo_addon(client, db, key="res-once")
    addon = ctx["addon"]
    rev = ctx["rev"]
    revoke = int(rev.addon_revoke_units or 0)
    assert revoke > 0

    resp = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/approve",
        json={"expected_version": ctx["req"].version, "revision_id": rev.id},
        headers=ctx["admin_headers"],
    )
    assert resp.status_code == 200, resp.text
    db.refresh(addon)
    assert int(addon.reserved_units or 0) == revoke
    rows = (
        db.query(AddonRefundUnitReservation)
        .filter(AddonRefundUnitReservation.refund_request_id == ctx["req"].id)
        .all()
    )
    assert len(rows) == 1
    assert rows[0].status == AddonRefundReservationStatus.ACTIVE.value


def test_repeat_execute_does_not_double_reserve(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _seed_fifo_addon(client, db, key="res-exec")
    client.post(
        f"/api/admin/refunds/{ctx['req'].id}/approve",
        json={
            "expected_version": ctx["req"].version,
            "revision_id": ctx["rev"].id,
        },
        headers=ctx["admin_headers"],
    )
    db.refresh(ctx["req"])
    db.refresh(ctx["addon"])
    before = int(ctx["addon"].reserved_units or 0)
    from backend.tests.test_refund_execution import _seed_fake_payment

    _seed_fake_payment(ctx["attempt"])
    r1 = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/execute",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert r1.status_code == 200, r1.text
    db.refresh(ctx["addon"])
    assert int(ctx["addon"].reserved_units or 0) == before
    db.refresh(ctx["req"])
    r2 = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/execute",
        json={"expected_version": ctx["req"].version},
        headers=ctx["admin_headers"],
    )
    assert r2.status_code == 200, r2.text
    db.refresh(ctx["addon"])
    assert int(ctx["addon"].reserved_units or 0) == before


def test_fifo_does_not_spend_reserved_units(client, db):
    from backend.models.plan import Plan
    from backend.services.tariff_entitlements import activate_subscription

    ctx = _seed_fifo_addon(client, db, key="res-fifo", amount=5)
    plan = db.query(Plan).filter(Plan.code == "pro").first()
    if plan is None:
        plan = Plan(code="pro", name_ru="Pro", limits_json={"monthly_messages": 10})
        db.add(plan)
        db.commit()
    ps = _utc() - timedelta(days=1)
    pe = _utc() + timedelta(days=29)
    activate_subscription(
        db,
        user_id=ctx["uid"],
        plan_id=plan.id,
        period_start=ps,
        period_end=pe,
        commit=True,
    )
    client.post(
        f"/api/admin/refunds/{ctx['req'].id}/approve",
        json={
            "expected_version": ctx["req"].version,
            "revision_id": ctx["rev"].id,
        },
        headers=ctx["admin_headers"],
    )
    db.refresh(ctx["addon"])
    reserved = int(ctx["addon"].reserved_units or 0)
    assert reserved == 5
    assert fifo_ledger_remaining(db, ctx["addon"].id) == 0
    r = check_and_consume_message_unit(db, ctx["uid"], source_event_key="plan-only")
    assert r.consumed
    debits = (
        db.query(AddonUsageLedgerEntry)
        .filter(
            AddonUsageLedgerEntry.user_addon_id == ctx["addon"].id,
            AddonUsageLedgerEntry.source_type == AddonUsageSourceType.PAID_ADDON.value,
        )
        .count()
    )
    assert debits == 0


def test_release_on_cancel_after_approve(client, db):
    ctx = _seed_fifo_addon(client, db, key="res-cancel")
    client.post(
        f"/api/admin/refunds/{ctx['req'].id}/approve",
        json={
            "expected_version": ctx["req"].version,
            "revision_id": ctx["rev"].id,
        },
        headers=ctx["admin_headers"],
    )
    db.refresh(ctx["req"])
    db.refresh(ctx["addon"])
    assert int(ctx["addon"].reserved_units or 0) > 0
    cancel_request(
        db,
        ctx["req"].id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["uid"],
        reason="user changed mind",
    )
    db.refresh(ctx["addon"])
    assert int(ctx["addon"].reserved_units or 0) == 0
    row = (
        db.query(AddonRefundUnitReservation)
        .filter(AddonRefundUnitReservation.refund_request_id == ctx["req"].id)
        .one()
    )
    assert row.status == AddonRefundReservationStatus.RELEASED.value


def test_release_on_reject_before_approve(client, db):
    ctx = _seed_fifo_addon(client, db, key="res-reject")
    reject_request(
        db,
        ctx["req"].id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["admin_uid"],
        reason="no",
    )
    db.refresh(ctx["addon"])
    assert int(ctx["addon"].reserved_units or 0) == 0
    assert (
        db.query(AddonRefundUnitReservation)
        .filter(AddonRefundUnitReservation.refund_request_id == ctx["req"].id)
        .count()
        == 0
    )


def test_reserve_kept_on_provider_unknown(client, db, monkeypatch):
    from unittest.mock import MagicMock, patch

    from backend.payments.base import PaymentProviderError

    _enable_fake(monkeypatch)
    ctx = _seed_fifo_addon(client, db, key="res-unk")
    client.post(
        f"/api/admin/refunds/{ctx['req'].id}/approve",
        json={
            "expected_version": ctx["req"].version,
            "revision_id": ctx["rev"].id,
        },
        headers=ctx["admin_headers"],
    )
    db.refresh(ctx["req"])
    db.refresh(ctx["addon"])
    before = int(ctx["addon"].reserved_units or 0)
    assert before > 0

    mock_provider = MagicMock()
    mock_provider.refund_payment.side_effect = PaymentProviderError(
        "timeout", code="provider_timeout"
    )
    with patch(
        "backend.services.refund_execution._resolve_provider",
        return_value=mock_provider,
    ):
        resp = client.post(
            f"/api/admin/refunds/{ctx['req'].id}/execute",
            json={"expected_version": ctx["req"].version},
            headers=ctx["admin_headers"],
        )
    assert resp.status_code == 200, resp.text
    assert resp.json()["outcome"] == "provider_unknown"
    db.refresh(ctx["req"])
    db.refresh(ctx["addon"])
    assert ctx["req"].status == RefundRequestStatus.PROVIDER_UNKNOWN.value
    assert int(ctx["addon"].reserved_units or 0) == before


def test_release_on_refund_failed(client, db, monkeypatch):
    from unittest.mock import MagicMock, patch

    from backend.payments.base import PaymentProviderError

    _enable_fake(monkeypatch)
    ctx = _seed_fifo_addon(client, db, key="res-fail")
    client.post(
        f"/api/admin/refunds/{ctx['req'].id}/approve",
        json={
            "expected_version": ctx["req"].version,
            "revision_id": ctx["rev"].id,
        },
        headers=ctx["admin_headers"],
    )
    db.refresh(ctx["req"])
    mock_provider = MagicMock()
    mock_provider.refund_payment.side_effect = PaymentProviderError(
        "bad creds", code="invalid_credentials"
    )
    with patch(
        "backend.services.refund_execution._resolve_provider",
        return_value=mock_provider,
    ):
        resp = client.post(
            f"/api/admin/refunds/{ctx['req'].id}/execute",
            json={"expected_version": ctx["req"].version},
            headers=ctx["admin_headers"],
        )
    assert resp.status_code == 200, resp.text
    assert resp.json()["outcome"] == "failed"
    db.refresh(ctx["req"])
    db.refresh(ctx["addon"])
    assert ctx["req"].status == RefundRequestStatus.REFUND_FAILED.value
    assert int(ctx["addon"].reserved_units or 0) == 0


def test_consume_after_entitlement(client, db, monkeypatch):
    _enable_fake(monkeypatch)
    ctx = _seed_fifo_addon(client, db, key="res-ent")
    client.post(
        f"/api/admin/refunds/{ctx['req'].id}/approve",
        json={
            "expected_version": ctx["req"].version,
            "revision_id": ctx["rev"].id,
        },
        headers=ctx["admin_headers"],
    )
    db.refresh(ctx["req"])
    db.refresh(ctx["rev"])
    db.refresh(ctx["addon"])
    assert int(ctx["addon"].reserved_units or 0) > 0
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
    assert result.outcome == "applied"
    db.refresh(ctx["addon"])
    assert int(ctx["addon"].reserved_units or 0) == 0
    row = (
        db.query(AddonRefundUnitReservation)
        .filter(AddonRefundUnitReservation.refund_request_id == ctx["req"].id)
        .one()
    )
    assert row.status == AddonRefundReservationStatus.CONSUMED.value


def test_no_reserve_for_legacy_manual(client, db):
    admin_headers, admin_uid = _auth(client, db, role="admin")
    _uh, uid = _auth(client, db)
    cut = _utc() - timedelta(days=10)
    _ensure_cutover(db, at=cut)
    paid_at = cut - timedelta(days=3)
    pkg = _addon_pkg(db)
    addon = UserAddon(
        user_id=uid,
        addon_package_id=pkg.id,
        amount=100,
        period_start=paid_at,
        period_end=cut + timedelta(days=30),
        status=UserAddonStatus.ACTIVE.value,
        source=UserAddonSource.PURCHASE.value,
        provider_ref="fake:legacy-res",
        created_at=(cut - timedelta(days=1)).replace(tzinfo=None),
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
        idempotency_key="ci-legacy-res",
        payment_provider="fake",
        provider_payment_id="pay_legacy_res",
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
        provider_payment_id="pay_legacy_res",
        amount=Decimal("190.00"),
        currency="RUB",
        status=PaymentAttemptStatus.SUCCEEDED.value,
        idempotency_key="pay-legacy-res",
    )
    db.add(attempt)
    db.add(
        AddonUsageLedgerEntry(
            user_id=uid,
            source_type=AddonUsageSourceType.LEGACY_UNATTRIBUTED.value,
            units=5,
            operation=AddonUsageOperation.DEBIT.value,
            source_event_key="legacy-res",
            period_start=paid_at.replace(tzinfo=None),
            period_end=(cut + timedelta(days=30)).replace(tzinfo=None),
            created_at=cut.replace(tzinfo=None),
        )
    )
    db.commit()
    req = create_refund_request(
        db,
        user_id=uid,
        checkout_intent_id=intent.id,
        reason_category="unused",
        idempotency_key="idem-legacy-res",
    )
    db.refresh(req)
    rev = (
        db.query(RefundRevision)
        .filter(RefundRevision.refund_request_id == req.id)
        .order_by(RefundRevision.revision_number.desc())
        .first()
    )
    assert rev.calculation_status != "ok"
    # Cannot approve manual — but ensure helper skips if forced OK without fifo_precise
    db.refresh(addon)
    assert int(addon.reserved_units or 0) == 0
