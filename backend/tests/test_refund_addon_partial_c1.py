"""6.14.11C.1 — addon partial units→money + recovery (no provider on recovery)."""
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
    RefundAuditAction,
    RefundAuditEvent,
    RefundEntitlementAction,
    RefundLedgerEntry,
    RefundLedgerEntryType,
    RefundRequest,
    RefundRequestStatus,
    RefundRevision,
    RefundType,
)
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    AddonRefundReservationStatus,
    AddonRefundUnitReservation,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
)
from backend.models.user import User
from backend.payments.registry import clear_provider_cache
from backend.services.refund_addon_partial import (
    AddonPartialRefundError,
    assert_addon_revision_entitlement_consistent,
    money_from_revoke_units,
    recover_addon_entitlement_units,
)
from backend.services.refund_addon_reservation import ensure_addon_refund_reservation
from backend.services.refund_entitlement import apply_refund_entitlement
from backend.services.refund_revisions import (
    RefundRevisionServiceError,
    approve_revision,
    create_admin_revision,
)
from backend.services.refund_submit import create_refund_request
from backend.services.refundable_purchases import list_refundable_purchases
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


def _addon_pkg(db, *, amount: int = 5000) -> AddonPackage:
    code = f"msg_{amount}_c1"
    pkg = db.query(AddonPackage).filter(AddonPackage.code == code).first()
    if pkg:
        return pkg
    pkg = AddonPackage(
        code=code,
        name_ru=f"+{amount} сообщений",
        type=AddonPackageType.MESSAGES.value,
        amount=amount,
        price=Decimal("790.00"),
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


def _seed_addon(
    db,
    user_id: int,
    *,
    key: str,
    amount: str = "790.00",
    units: int = 5000,
):
    paid_at = _utc() - timedelta(hours=2)
    pkg = _addon_pkg(db, amount=units)
    addon = UserAddon(
        user_id=user_id,
        addon_package_id=pkg.id,
        amount=units,
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
    db.refresh(addon)
    db.refresh(intent)
    db.refresh(attempt)
    return intent, attempt, addon


def _open_request(client, db, *, key: str):
    admin_headers, admin_uid = _auth(client, db, role="admin")
    user_headers, uid = _auth(client, db)
    intent, attempt, addon = _seed_addon(db, uid, key=key)
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
        .filter(
            RefundRevision.refund_request_id == req.id,
            RefundRevision.revision_number == req.current_revision_number,
        )
        .one()
    )
    return {
        "admin_headers": admin_headers,
        "admin_uid": admin_uid,
        "user_headers": user_headers,
        "uid": uid,
        "intent": intent,
        "attempt": attempt,
        "addon": addon,
        "req": req,
        "rev": rev,
    }


def test_money_from_revoke_units_canonical():
    # 790 × 2000 / 5000 = 316.00
    assert money_from_revoke_units(
        paid_amount="790.00", total_units=5000, revoke_units=2000
    ) == Decimal("316.00")
    assert money_from_revoke_units(
        paid_amount="790.00", total_units=5000, revoke_units=5000
    ) == Decimal("790.00")


def test_partial_units_creates_reduce_amount_revision(client, db):
    ctx = _open_request(client, db, key="c1-partial")
    admin_rev = create_admin_revision(
        db,
        ctx["req"].id,
        based_on_revision_id=ctx["rev"].id,
        admin_user_id=ctx["admin_uid"],
        expected_version=ctx["req"].version,
        addon_revoke_units=2000,
        adjustment_reason_category="policy",
        adjustment_comment="partial units",
    )
    assert admin_rev.proposed_refund_amount == Decimal("316.00")
    assert admin_rev.addon_revoke_units == 2000
    assert admin_rev.entitlement_action == RefundEntitlementAction.REDUCE_AMOUNT.value
    assert admin_rev.refund_type == RefundType.PARTIAL.value


def test_full_units_cancel_semantics(client, db):
    ctx = _open_request(client, db, key="c1-full")
    admin_rev = create_admin_revision(
        db,
        ctx["req"].id,
        based_on_revision_id=ctx["rev"].id,
        admin_user_id=ctx["admin_uid"],
        expected_version=ctx["req"].version,
        addon_revoke_units=5000,
        adjustment_reason_category="policy",
        adjustment_comment="full units",
    )
    assert admin_rev.proposed_refund_amount == Decimal("790.00")
    assert admin_rev.addon_revoke_units == 5000
    assert admin_rev.entitlement_action == RefundEntitlementAction.CANCEL_ADDON.value
    assert admin_rev.refund_type == RefundType.FULL.value


def test_money_only_addon_revision_forbidden(client, db):
    ctx = _open_request(client, db, key="c1-money")
    with pytest.raises(RefundRevisionServiceError) as ei:
        create_admin_revision(
            db,
            ctx["req"].id,
            based_on_revision_id=ctx["rev"].id,
            admin_user_id=ctx["admin_uid"],
            expected_version=ctx["req"].version,
            proposed_refund_amount="300.00",
            adjustment_reason_category="policy",
            adjustment_comment="arbitrary money",
        )
    assert ei.value.code == "addon_units_required"

    with pytest.raises(RefundRevisionServiceError) as ei2:
        create_admin_revision(
            db,
            ctx["req"].id,
            based_on_revision_id=ctx["rev"].id,
            admin_user_id=ctx["admin_uid"],
            expected_version=ctx["req"].version,
            addon_revoke_units=2000,
            proposed_refund_amount="300.00",
            adjustment_reason_category="policy",
            adjustment_comment="mismatch money",
        )
    assert ei2.value.code == "addon_money_independent_forbidden"


def test_approve_blocks_inconsistent_partial_cancel(client, db):
    ctx = _open_request(client, db, key="c1-incons")
    rev = ctx["rev"]
    rev.refund_type = RefundType.PARTIAL.value
    rev.proposed_refund_amount = Decimal("300.00")
    rev.entitlement_action = RefundEntitlementAction.CANCEL_ADDON.value
    rev.addon_revoke_units = 5000
    rev.addon_total_units = 5000
    db.commit()
    db.refresh(ctx["req"])
    with pytest.raises(RefundRevisionServiceError) as ei:
        approve_revision(
            db,
            ctx["req"].id,
            revision_id=rev.id,
            expected_version=ctx["req"].version,
            actor_user_id=ctx["admin_uid"],
        )
    assert ei.value.code == "inconsistent_addon_entitlement"


def test_approve_reservation_equals_selected_units(client, db):
    ctx = _open_request(client, db, key="c1-res")
    admin_rev = create_admin_revision(
        db,
        ctx["req"].id,
        based_on_revision_id=ctx["rev"].id,
        admin_user_id=ctx["admin_uid"],
        expected_version=ctx["req"].version,
        addon_revoke_units=2000,
        adjustment_reason_category="policy",
        adjustment_comment="reserve partial",
    )
    db.refresh(ctx["req"])
    from backend.services.refund_revisions import confirm_admin_revision

    confirm_admin_revision(
        db, ctx["req"].id, expected_version=ctx["req"].version, actor_user_id=ctx["admin_uid"]
    )
    db.refresh(ctx["req"])
    result = approve_revision(
        db,
        ctx["req"].id,
        revision_id=admin_rev.id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["admin_uid"],
    )
    assert result.approved is True
    db.refresh(ctx["addon"])
    assert int(ctx["addon"].reserved_units or 0) == 2000
    row = (
        db.query(AddonRefundUnitReservation)
        .filter(AddonRefundUnitReservation.refund_request_id == ctx["req"].id)
        .one()
    )
    assert row.units == 2000
    assert row.status == AddonRefundReservationStatus.ACTIVE.value


def test_apply_reduce_amount_keeps_active_remainder(client, db):
    ctx = _open_request(client, db, key="c1-apply")
    admin_rev = create_admin_revision(
        db,
        ctx["req"].id,
        based_on_revision_id=ctx["rev"].id,
        admin_user_id=ctx["admin_uid"],
        expected_version=ctx["req"].version,
        addon_revoke_units=2000,
        adjustment_reason_category="policy",
        adjustment_comment="apply partial",
    )
    db.refresh(ctx["req"])
    from backend.services.refund_revisions import confirm_admin_revision

    confirm_admin_revision(
        db, ctx["req"].id, expected_version=ctx["req"].version, actor_user_id=ctx["admin_uid"]
    )
    db.refresh(ctx["req"])
    approve_revision(
        db,
        ctx["req"].id,
        revision_id=admin_rev.id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["admin_uid"],
    )
    db.refresh(ctx["req"])
    db.refresh(admin_rev)
    ensure_addon_refund_reservation(db, ctx["req"], admin_rev, commit=True)

    entry = RefundLedgerEntry(
        refund_request_id=ctx["req"].id,
        refund_revision_id=admin_rev.id,
        checkout_intent_id=ctx["req"].checkout_intent_id,
        payment_attempt_id=ctx["attempt"].id,
        entry_type=RefundLedgerEntryType.SUCCEEDED.value,
        amount=Decimal("316.00"),
        currency="RUB",
        idempotency_key=f"bf-rf-{ctx['req'].id}-r{admin_rev.id}",
        provider_refund_id=f"rf_{ctx['req'].id}",
        provider_status="succeeded",
    )
    db.add(entry)
    ctx["req"].status = RefundRequestStatus.PARTIALLY_REFUNDED.value
    ctx["req"].approved_revision_id = admin_rev.id
    db.commit()
    db.refresh(ctx["req"])

    res1 = apply_refund_entitlement(
        db,
        ctx["req"].id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["admin_uid"],
    )
    assert res1.outcome == "applied"
    db.refresh(ctx["addon"])
    assert ctx["addon"].amount == 3000
    assert ctx["addon"].status == UserAddonStatus.ACTIVE.value
    db.refresh(ctx["req"])
    assert ctx["req"].status == RefundRequestStatus.COMPLETED.value

    res2 = apply_refund_entitlement(
        db,
        ctx["req"].id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["admin_uid"],
    )
    assert res2.outcome in {"already_applied", "applied"}
    db.refresh(ctx["addon"])
    assert ctx["addon"].amount == 3000


def test_second_partial_after_completed_allowed(client, db):
    ctx = _open_request(client, db, key="c1-second")
    admin_rev = create_admin_revision(
        db,
        ctx["req"].id,
        based_on_revision_id=ctx["rev"].id,
        admin_user_id=ctx["admin_uid"],
        expected_version=ctx["req"].version,
        addon_revoke_units=2000,
        adjustment_reason_category="policy",
        adjustment_comment="first partial",
    )
    db.refresh(ctx["req"])
    from backend.services.refund_revisions import confirm_admin_revision

    confirm_admin_revision(
        db, ctx["req"].id, expected_version=ctx["req"].version, actor_user_id=ctx["admin_uid"]
    )
    db.refresh(ctx["req"])
    approve_revision(
        db,
        ctx["req"].id,
        revision_id=admin_rev.id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["admin_uid"],
    )
    db.refresh(ctx["req"])
    ensure_addon_refund_reservation(db, ctx["req"], admin_rev, commit=True)
    db.add(
        RefundLedgerEntry(
            refund_request_id=ctx["req"].id,
            refund_revision_id=admin_rev.id,
            checkout_intent_id=ctx["req"].checkout_intent_id,
            payment_attempt_id=ctx["attempt"].id,
            entry_type=RefundLedgerEntryType.SUCCEEDED.value,
            amount=Decimal("316.00"),
            currency="RUB",
            idempotency_key=f"bf-rf-{ctx['req'].id}-r{admin_rev.id}",
            provider_refund_id=f"rf_{ctx['req'].id}",
            provider_status="succeeded",
        )
    )
    ctx["req"].status = RefundRequestStatus.PARTIALLY_REFUNDED.value
    ctx["req"].approved_revision_id = admin_rev.id
    db.commit()
    db.refresh(ctx["req"])
    apply_refund_entitlement(
        db,
        ctx["req"].id,
        expected_version=ctx["req"].version,
        actor_user_id=ctx["admin_uid"],
    )
    db.refresh(ctx["req"])
    assert ctx["req"].status == RefundRequestStatus.COMPLETED.value

    items = list_refundable_purchases(db, user_id=ctx["uid"], limit=50, offset=0)
    match = next(
        (i for i in items["items"] if i["checkout_intent_id"] == ctx["intent"].id),
        None,
    )
    assert match is not None
    assert match["can_request_refund"] is True
    assert Decimal(match["refundable_available_amount"]) == Decimal("474.00")

    req2 = create_refund_request(
        db,
        user_id=ctx["uid"],
        checkout_intent_id=ctx["intent"].id,
        reason_category="unused",
        idempotency_key=f"idem-{ctx['intent'].id}-2",
    )
    assert req2.id != ctx["req"].id
    db.refresh(req2)
    rev2 = (
        db.query(RefundRevision)
        .filter(
            RefundRevision.refund_request_id == req2.id,
            RefundRevision.revision_number == req2.current_revision_number,
        )
        .one()
    )
    with pytest.raises(RefundRevisionServiceError) as over_money:
        create_admin_revision(
            db,
            req2.id,
            based_on_revision_id=rev2.id,
            admin_user_id=ctx["admin_uid"],
            expected_version=req2.version,
            addon_revoke_units=5000,
            adjustment_reason_category="policy",
            adjustment_comment="over units after first",
        )
    assert over_money.value.code in {"over_units", "over_money"}

    ok = create_admin_revision(
        db,
        req2.id,
        based_on_revision_id=rev2.id,
        admin_user_id=ctx["admin_uid"],
        expected_version=req2.version,
        addon_revoke_units=1000,
        adjustment_reason_category="policy",
        adjustment_comment="second partial ok",
    )
    assert ok.addon_revoke_units == 1000
    assert ok.proposed_refund_amount == Decimal("158.00")


def test_over_units_rejected(client, db):
    ctx = _open_request(client, db, key="c1-overu")
    with pytest.raises(RefundRevisionServiceError) as ei:
        create_admin_revision(
            db,
            ctx["req"].id,
            based_on_revision_id=ctx["rev"].id,
            admin_user_id=ctx["admin_uid"],
            expected_version=ctx["req"].version,
            addon_revoke_units=9000,
            adjustment_reason_category="policy",
            adjustment_comment="too many",
        )
    assert ei.value.code == "over_units"


def _fixture_like_request_6(client, db, *, key: str):
    """partially_refunded + wrong cancel_addon/5000 reservation (like #6)."""
    ctx = _open_request(client, db, key=key)
    rev = ctx["rev"]
    rev.entitlement_action = RefundEntitlementAction.CANCEL_ADDON.value
    rev.addon_revoke_units = 5000
    rev.addon_total_units = 5000
    rev.refund_type = RefundType.PARTIAL.value
    rev.proposed_refund_amount = Decimal("300.00")
    db.commit()
    ctx["req"].approved_revision_id = rev.id
    ctx["req"].status = RefundRequestStatus.PARTIALLY_REFUNDED.value
    db.add(
        RefundLedgerEntry(
            refund_request_id=ctx["req"].id,
            refund_revision_id=rev.id,
            checkout_intent_id=ctx["req"].checkout_intent_id,
            payment_attempt_id=ctx["attempt"].id,
            entry_type=RefundLedgerEntryType.SUCCEEDED.value,
            amount=Decimal("300.00"),
            currency="RUB",
            idempotency_key=f"bf-rf-{ctx['req'].id}-r{rev.id}",
            provider_refund_id=f"rf_{ctx['req'].id}",
            provider_status="succeeded",
        )
    )
    db.commit()
    ensure_addon_refund_reservation(db, ctx["req"], rev, commit=True)
    db.refresh(ctx["addon"])
    assert int(ctx["addon"].reserved_units or 0) == 5000
    db.refresh(ctx["req"])
    return ctx


def test_recovery_no_provider_replaces_reservation_and_audits(client, db):
    ctx = _fixture_like_request_6(client, db, key="c1-rec")
    with patch(
        "backend.payments.providers.fake.FakePaymentProvider.refund_payment"
    ) as refund_mock:
        result = recover_addon_entitlement_units(
            db,
            ctx["req"].id,
            admin_user_id=ctx["admin_uid"],
            expected_version=ctx["req"].version,
            addon_revoke_units=2000,
            adjustment_comment="fix entitlement after money",
        )
        refund_mock.assert_not_called()

    assert result["addon_revoke_units"] == 2000
    assert result["entitlement_action"] == RefundEntitlementAction.REDUCE_AMOUNT.value
    assert Decimal(result["confirmed_refunded_amount"]) == Decimal("300.00")
    assert Decimal(result["equivalent_units_money"]) == Decimal("316.00")
    assert Decimal(result["money_units_delta"]) == Decimal("16.00")

    db.refresh(ctx["addon"])
    assert int(ctx["addon"].reserved_units or 0) == 2000
    row = (
        db.query(AddonRefundUnitReservation)
        .filter(
            AddonRefundUnitReservation.refund_request_id == ctx["req"].id,
            AddonRefundUnitReservation.status
            == AddonRefundReservationStatus.ACTIVE.value,
        )
        .one()
    )
    assert row.units == 2000

    events = (
        db.query(RefundAuditEvent)
        .filter(
            RefundAuditEvent.refund_request_id == ctx["req"].id,
            RefundAuditEvent.action == RefundAuditAction.ENTITLEMENT_RECOVERY.value,
        )
        .all()
    )
    assert len(events) == 1
    assert events[0].event_metadata.get("provider_called") is False

    # repeat recovery safe
    db.refresh(ctx["req"])
    result2 = recover_addon_entitlement_units(
        db,
        ctx["req"].id,
        admin_user_id=ctx["admin_uid"],
        expected_version=ctx["req"].version,
        addon_revoke_units=1900,
        adjustment_comment="second recovery",
    )
    assert result2["addon_revoke_units"] == 1900
    db.refresh(ctx["addon"])
    assert int(ctx["addon"].reserved_units or 0) == 1900


def test_recovery_http_admin_only(client, db):
    ctx = _fixture_like_request_6(client, db, key="c1-http")
    forbidden = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/recover-entitlement",
        json={
            "expected_version": ctx["req"].version,
            "addon_revoke_units": 2000,
            "adjustment_comment": "nope",
        },
        headers=ctx["user_headers"],
    )
    assert forbidden.status_code == 403

    ok = client.post(
        f"/api/admin/refunds/{ctx['req'].id}/recover-entitlement",
        json={
            "expected_version": ctx["req"].version,
            "addon_revoke_units": 2000,
            "adjustment_comment": "admin recovery",
        },
        headers=ctx["admin_headers"],
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert body["addon_revoke_units"] == 2000
    assert body["confirmed_refunded_amount"] == "300.00"
    assert body["equivalent_units_money"] == "316.00"


def test_assert_consistent_helper_rejects_partial_cancel(client, db):
    ctx = _open_request(client, db, key="c1-assert")
    rev = ctx["rev"]
    rev.refund_type = RefundType.PARTIAL.value
    rev.proposed_refund_amount = Decimal("300.00")
    rev.entitlement_action = RefundEntitlementAction.CANCEL_ADDON.value
    rev.addon_revoke_units = 5000
    rev.addon_total_units = 5000
    db.commit()
    with pytest.raises(AddonPartialRefundError) as ei:
        assert_addon_revision_entitlement_consistent(
            db, request=ctx["req"], revision=rev
        )
    assert ei.value.code == "inconsistent_addon_entitlement"
