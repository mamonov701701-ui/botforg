"""Этап 6.14.2: refund calculation + revision lifecycle services."""
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
from backend.models.plan import Plan
from backend.models.refund import (
    RefundAuditEvent,
    RefundCalculationStatus,
    RefundLedgerEntry,
    RefundLedgerEntryType,
    RefundLedgerProviderStatus,
    RefundRequest,
    RefundRequestStatus,
    RefundRevision,
    RefundRevisionType,
    RefundType,
)
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    SubscriptionStatus,
    UsageCounter,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
    UserSubscription,
)
from backend.services.refund_calculation import (
    build_refund_calculation,
    calculate_tariff_time_proration,
    load_ledger_balance,
)
from backend.services.refund_invariants import round_money as inv_round_money
from backend.services.refund_revisions import (
    ApproveRevisionResult,
    RefundRevisionServiceError,
    approve_revision,
    cancel_request,
    confirm_admin_revision,
    create_admin_revision,
    create_initial_automatic_revision,
    mark_needs_information,
    recalculate_automatic_revision,
    reject_request,
)
from backend.tests.conftest import get_user_id, register_and_get_token


@pytest.fixture
def db(client):
    from backend.tests.conftest import TestingSessionLocal

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _utc(dt: datetime | None = None) -> datetime:
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _plan(db) -> Plan:
    plan = db.query(Plan).filter(Plan.code == "start").first()
    if plan:
        return plan
    plan = Plan(
        code="start",
        name="Старт",
        price_month=Decimal("300.00"),
        currency="RUB",
        is_active=True,
        limits={},
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _addon_pkg(db, *, code: str = "msg_1000", amount: int = 1000) -> AddonPackage:
    pkg = db.query(AddonPackage).filter(AddonPackage.code == code).first()
    if pkg:
        return pkg
    pkg = AddonPackage(
        code=code,
        name_ru=code,
        type=AddonPackageType.MESSAGES,
        amount=amount,
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


def _seed_tariff_intent(
    db,
    user_id: int,
    *,
    key: str,
    amount: str = "300.00",
    paid_at: datetime,
    period_start: datetime,
    period_end: datetime,
    sub_status: str = SubscriptionStatus.ACTIVE.value,
):
    plan = _plan(db)
    sub = UserSubscription(
        user_id=user_id,
        plan_id=plan.id,
        status=sub_status,
        current_period_start=period_start,
        current_period_end=period_end,
        payment_provider="yookassa",
        provider_subscription_id=f"yookassa:yk_{key}",
    )
    db.add(sub)
    db.flush()
    intent = CheckoutIntent(
        user_id=user_id,
        product_type=CheckoutProductType.TARIFF.value,
        product_code="start",
        product_name="Старт",
        amount=Decimal(amount),
        currency="RUB",
        status=CheckoutIntentStatus.FULFILLED.value,
        idempotency_key=key,
        payment_provider="yookassa",
        provider_payment_id=f"yk_{key}",
        paid_at=paid_at,
        fulfilled_at=paid_at,
        fulfilled_subscription_id=sub.id,
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
    db.refresh(sub)
    return intent, attempt, sub


def _seed_addon_intent(
    db,
    user_id: int,
    *,
    key: str,
    amount: str = "190.00",
    paid_at: datetime,
    units: int = 1000,
):
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
        idempotency_key=key,
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


def _create_request(db, user_id, intent, attempt):
    req = RefundRequest(
        user_id=user_id,
        checkout_intent_id=intent.id,
        payment_attempt_id=attempt.id,
        status=RefundRequestStatus.SUBMITTED.value,
        reason_category="unused",
        current_revision_number=0,
        version=1,
        submitted_at=_utc(),
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def _add_usage(db, user_id, *, period_start, period_end, messages, updated_at):
    c = UsageCounter(
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
        messages_used=messages,
        active_bots_used=0,
        team_members_used=0,
        created_at=updated_at,
        updated_at=updated_at,
    )
    db.add(c)
    db.commit()
    return c


def _add_ledger(
    db,
    req,
    intent,
    attempt,
    rev,
    amount: str,
    key: str,
    *,
    entry_type: str = RefundLedgerEntryType.RESERVED.value,
):
    entry = RefundLedgerEntry(
        refund_request_id=req.id,
        refund_revision_id=rev.id,
        checkout_intent_id=intent.id,
        payment_attempt_id=attempt.id,
        entry_type=entry_type,
        amount=Decimal(amount),
        currency="RUB",
        idempotency_key=key,
        provider_status=RefundLedgerProviderStatus.LOCAL_ONLY.value,
    )
    db.add(entry)
    db.commit()
    return entry


# --- Pure formula ---


def test_tariff_exact_time_proration_mid_period():
    start = _utc(datetime(2026, 1, 1, 0, 0, 0))
    end = start + timedelta(days=10)  # 864000 seconds
    calc_at = start + timedelta(days=3)  # 259200 / 864000 = 0.3
    result = calculate_tariff_time_proration(
        paid_amount="100.00",
        prior_refunded_amount="0.00",
        period_start=start,
        period_end=end,
        calculation_at=calc_at,
    )
    assert result["ok"] is True
    assert result["used_time_seconds"] == 259200
    assert result["total_time_seconds"] == 864000
    # used = 30.00, refund = 70.00
    assert result["proposed_refund_amount"] == Decimal("70.00")
    assert result["used_amount"] == Decimal("30.00")


def test_calculation_before_period_start_zero_usage():
    start = _utc(datetime(2026, 2, 1, 0, 0, 0))
    end = start + timedelta(days=30)
    calc_at = start - timedelta(hours=1)
    result = calculate_tariff_time_proration(
        paid_amount="100.00",
        prior_refunded_amount="0.00",
        period_start=start,
        period_end=end,
        calculation_at=calc_at,
    )
    assert result["ok"] is True
    assert result["used_time_seconds"] == 0
    assert result["proposed_refund_amount"] == Decimal("100.00")


def test_calculation_after_period_end_zero_refund():
    start = _utc(datetime(2026, 1, 1, 0, 0, 0))
    end = start + timedelta(days=30)
    calc_at = end + timedelta(days=1)
    result = calculate_tariff_time_proration(
        paid_amount="100.00",
        prior_refunded_amount="0.00",
        period_start=start,
        period_end=end,
        calculation_at=calc_at,
    )
    assert result["ok"] is True
    assert result["proposed_refund_amount"] == Decimal("0.00")
    assert result["used_time_seconds"] == result["total_time_seconds"]


def test_decimal_rounding_half_up():
    # 100 * (1/3) = 33.333... → used 33.33, refund 66.67
    start = _utc(datetime(2026, 1, 1, 0, 0, 0))
    end = start + timedelta(seconds=3)
    calc_at = start + timedelta(seconds=1)
    result = calculate_tariff_time_proration(
        paid_amount="100.00",
        prior_refunded_amount="0.00",
        period_start=start,
        period_end=end,
        calculation_at=calc_at,
    )
    assert result["used_amount"] == inv_round_money(Decimal("100") / 3)
    assert result["proposed_refund_amount"] == Decimal("66.67")


def test_invalid_period_fails():
    start = _utc(datetime(2026, 1, 1, 0, 0, 0))
    result = calculate_tariff_time_proration(
        paid_amount="100.00",
        prior_refunded_amount="0.00",
        period_start=start,
        period_end=start,
        calculation_at=start + timedelta(hours=1),
    )
    assert result["ok"] is False
    assert result["request_status_after"] == RefundRequestStatus.CALCULATION_FAILED.value


def test_prior_partial_refunds_clamp():
    start = _utc(datetime(2026, 1, 1, 0, 0, 0))
    end = start + timedelta(days=10)
    calc_at = start  # unused → would be 100, but prior 40 → max 60
    result = calculate_tariff_time_proration(
        paid_amount="100.00",
        prior_refunded_amount="40.00",
        period_start=start,
        period_end=end,
        calculation_at=calc_at,
    )
    assert result["proposed_refund_amount"] == Decimal("60.00")


# --- Integration: grace / tariff / addon ---


def test_full_grace_refund_within_24h_no_usage(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=2)
    period_start = paid_at
    period_end = paid_at + timedelta(days=30)
    intent, attempt, _ = _seed_tariff_intent(
        db,
        uid,
        key="grace-1",
        paid_at=paid_at,
        period_start=period_start,
        period_end=period_end,
    )
    req = _create_request(db, uid, intent, attempt)
    rev = create_initial_automatic_revision(
        db, req.id, expected_version=1, calculation_at=_utc()
    )
    db.refresh(req)
    assert rev.proposed_refund_amount == Decimal("300.00")
    assert rev.refund_type == RefundType.FULL.value
    assert rev.calculation_snapshot["basis"] == "grace_period_full_refund"
    assert req.status == RefundRequestStatus.AWAITING_ADMIN_REVIEW.value


def test_grace_not_applied_with_usage(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=2)
    period_start = paid_at
    period_end = paid_at + timedelta(days=30)
    intent, attempt, _ = _seed_tariff_intent(
        db,
        uid,
        key="grace-usage",
        paid_at=paid_at,
        period_start=period_start,
        period_end=period_end,
    )
    _add_usage(
        db,
        uid,
        period_start=period_start,
        period_end=period_end,
        messages=5,
        updated_at=paid_at + timedelta(minutes=30),
    )
    req = _create_request(db, uid, intent, attempt)
    calc_at = paid_at + timedelta(hours=3)
    rev = create_initial_automatic_revision(
        db, req.id, expected_version=1, calculation_at=calc_at
    )
    assert rev.calculation_snapshot.get("basis") != "grace_period_full_refund"
    assert rev.calculation_snapshot.get("formula") == "tariff_time_proration"
    assert rev.proposed_refund_amount < Decimal("300.00")


def test_tariff_time_proration_service(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(days=5)
    period_start = paid_at
    period_end = paid_at + timedelta(days=10)
    intent, attempt, _ = _seed_tariff_intent(
        db,
        uid,
        key="prorate-1",
        amount="100.00",
        paid_at=paid_at,
        period_start=period_start,
        period_end=period_end,
    )
    req = _create_request(db, uid, intent, attempt)
    calc_at = period_start + timedelta(days=3)
    rev = create_initial_automatic_revision(
        db, req.id, expected_version=1, calculation_at=calc_at
    )
    assert rev.proposed_refund_amount == Decimal("70.00")


def test_missing_period_manual_or_failed(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(days=2)
    intent = CheckoutIntent(
        user_id=uid,
        product_type=CheckoutProductType.TARIFF.value,
        product_code="start",
        product_name="Старт",
        amount=Decimal("100.00"),
        currency="RUB",
        status=CheckoutIntentStatus.FULFILLED.value,
        idempotency_key="no-period",
        payment_provider="yookassa",
        provider_payment_id="yk_no_period",
        paid_at=paid_at,
        fulfilled_at=paid_at,
        fulfilled_subscription_id=None,
    )
    db.add(intent)
    db.flush()
    attempt = PaymentAttempt(
        checkout_intent_id=intent.id,
        user_id=uid,
        provider="yookassa",
        provider_payment_id="yk_no_period",
        amount=Decimal("100.00"),
        currency="RUB",
        status=PaymentAttemptStatus.SUCCEEDED.value,
        idempotency_key="pay-no-period",
    )
    db.add(attempt)
    db.commit()
    req = _create_request(db, uid, intent, attempt)
    rev = create_initial_automatic_revision(db, req.id, expected_version=1)
    db.refresh(req)
    assert rev.calculation_status == RefundCalculationStatus.MANUAL_REQUIRED.value
    assert req.status == RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value


def test_addon_no_usage_full(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=5)
    intent, attempt, addon = _seed_addon_intent(
        db, uid, key="addon-full", paid_at=paid_at
    )
    req = _create_request(db, uid, intent, attempt)
    rev = create_initial_automatic_revision(db, req.id, expected_version=1)
    db.refresh(req)
    assert rev.proposed_refund_amount == Decimal("190.00")
    assert rev.addon_revoke_units == addon.amount
    assert req.status == RefundRequestStatus.AWAITING_ADMIN_REVIEW.value


def test_addon_pool_usage_manual_review(client, db):
    from backend.models.tariff import (
        AddonUsageLedgerEntry,
        AddonUsageOperation,
        AddonUsageSourceType,
        TariffFifoCutover,
    )

    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=5)
    intent, attempt, addon = _seed_addon_intent(
        db, uid, key="addon-pool", paid_at=paid_at
    )
    # Pre-cutover purchase + legacy pool → manual (not false FIFO attribution).
    cut = db.query(TariffFifoCutover).first()
    cut_at = (cut.cutover_at if cut else _utc())
    if getattr(cut_at, "tzinfo", None) is None:
        cut_at = cut_at.replace(tzinfo=timezone.utc)
    addon.created_at = (cut_at - timedelta(days=1)).replace(tzinfo=None)
    db.add(
        AddonUsageLedgerEntry(
            user_id=uid,
            source_type=AddonUsageSourceType.LEGACY_UNATTRIBUTED.value,
            units=3,
            operation=AddonUsageOperation.DEBIT.value,
            source_event_key="legacy-pool-test",
            period_start=addon.period_start,
            period_end=addon.period_end,
            created_at=cut_at.replace(tzinfo=None),
        )
    )
    _add_usage(
        db,
        uid,
        period_start=addon.period_start,
        period_end=addon.period_end,
        messages=3,
        updated_at=paid_at + timedelta(hours=1),
    )
    db.commit()
    req = _create_request(db, uid, intent, attempt)
    rev = create_initial_automatic_revision(db, req.id, expected_version=1)
    db.refresh(req)
    assert rev.calculation_status == RefundCalculationStatus.MANUAL_REQUIRED.value
    assert req.status == RefundRequestStatus.MANUAL_REVIEW_REQUIRED.value
    assert rev.proposed_refund_amount == Decimal("0.00")
    assert rev.calculation_snapshot.get("auto_proposed_deferred") is True
    assert rev.calculation_snapshot.get("proposed_amount_undefined") is True
    assert rev.calculation_snapshot.get("proposed_refund_semantic") == "undefined_not_denial"
    assert rev.calculation_snapshot.get("proposed_refund_amount_is_placeholder") is True


def test_reserved_blocks_available_but_is_not_confirmed(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=1)
    period_start = paid_at
    period_end = paid_at + timedelta(days=30)
    intent, attempt, _ = _seed_tariff_intent(
        db,
        uid,
        key="prior-1",
        amount="100.00",
        paid_at=paid_at,
        period_start=period_start,
        period_end=period_end,
    )
    req = _create_request(db, uid, intent, attempt)
    rev1 = create_initial_automatic_revision(
        db, req.id, expected_version=1, calculation_at=period_start
    )
    assert rev1.proposed_refund_amount == Decimal("100.00")
    _add_ledger(db, req, intent, attempt, rev1, "25.00", "ledger-reserved-1")
    balance = load_ledger_balance(db, checkout_intent_id=intent.id, paid_amount="100.00")
    assert balance.confirmed_refunded_amount == Decimal("0.00")
    assert balance.active_reserved_amount == Decimal("25.00")
    assert balance.refundable_available_amount == Decimal("75.00")

    db.refresh(req)
    rev2 = recalculate_automatic_revision(
        db,
        req.id,
        expected_version=req.version,
        calculation_at=period_start,
    )
    # Reserved is NOT prior_refunded / confirmed.
    assert rev2.prior_refunded_amount == Decimal("0.00")
    assert rev2.calculation_snapshot["ledger_balance"]["active_reserved_amount"] == "25.00"
    assert rev2.calculation_snapshot["ledger_balance"]["confirmed_refunded_amount"] == "0.00"
    assert rev2.proposed_refund_amount == Decimal("75.00")
    assert rev2.revision_number == 2


def test_confirmed_and_failed_ledger_semantics(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=1)
    period_start = paid_at
    period_end = paid_at + timedelta(days=30)
    intent, attempt, _ = _seed_tariff_intent(
        db,
        uid,
        key="ledger-sem",
        amount="100.00",
        paid_at=paid_at,
        period_start=period_start,
        period_end=period_end,
    )
    req = _create_request(db, uid, intent, attempt)
    rev1 = create_initial_automatic_revision(
        db, req.id, expected_version=1, calculation_at=period_start
    )
    _add_ledger(
        db,
        req,
        intent,
        attempt,
        rev1,
        "30.00",
        "led-succ",
        entry_type=RefundLedgerEntryType.SUCCEEDED.value,
    )
    _add_ledger(
        db,
        req,
        intent,
        attempt,
        rev1,
        "10.00",
        "led-res",
        entry_type=RefundLedgerEntryType.RESERVED.value,
    )
    _add_ledger(
        db,
        req,
        intent,
        attempt,
        rev1,
        "5.00",
        "led-fail",
        entry_type=RefundLedgerEntryType.FAILED.value,
    )
    _add_ledger(
        db,
        req,
        intent,
        attempt,
        rev1,
        "7.00",
        "led-unk",
        entry_type=RefundLedgerEntryType.PROVIDER_UNKNOWN.value,
    )
    balance = load_ledger_balance(db, checkout_intent_id=intent.id, paid_amount="100.00")
    assert balance.confirmed_refunded_amount == Decimal("30.00")
    assert balance.active_reserved_amount == Decimal("10.00")
    assert balance.provider_unknown_amount == Decimal("7.00")
    assert balance.failed_or_canceled_amount == Decimal("5.00")
    # available = 100 - 30 - 10 - 7 = 53 (failed ignored)
    assert balance.refundable_available_amount == Decimal("53.00")

    db.refresh(req)
    rev2 = recalculate_automatic_revision(
        db,
        req.id,
        expected_version=req.version,
        calculation_at=period_start,
    )
    assert rev2.prior_refunded_amount == Decimal("30.00")
    assert rev2.proposed_refund_amount == Decimal("53.00")


# --- Revisions lifecycle ---


def test_automatic_revision_and_recalculate(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(days=2)
    intent, attempt, _ = _seed_tariff_intent(
        db,
        uid,
        key="recalc-1",
        amount="100.00",
        paid_at=paid_at,
        period_start=paid_at,
        period_end=paid_at + timedelta(days=10),
    )
    req = _create_request(db, uid, intent, attempt)
    r1 = create_initial_automatic_revision(
        db, req.id, expected_version=1, calculation_at=paid_at + timedelta(days=1)
    )
    snap1 = dict(r1.calculation_snapshot)
    db.refresh(req)
    r2 = recalculate_automatic_revision(
        db,
        req.id,
        expected_version=req.version,
        calculation_at=paid_at + timedelta(days=2),
    )
    db.refresh(r1)
    assert r2.revision_number == 2
    assert r2.id != r1.id
    assert r1.calculation_snapshot == snap1  # immutable


def test_admin_edit_requires_reason_comment(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=1)
    intent, attempt, _ = _seed_addon_intent(db, uid, key="adm-req", paid_at=paid_at)
    req = _create_request(db, uid, intent, attempt)
    rev = create_initial_automatic_revision(db, req.id, expected_version=1)
    db.refresh(req)
    with pytest.raises(RefundRevisionServiceError) as ei:
        create_admin_revision(
            db,
            req.id,
            based_on_revision_id=rev.id,
            admin_user_id=uid,
            expected_version=req.version,
            proposed_refund_amount="100.00",
            adjustment_reason_category="",
            adjustment_comment="ok",
        )
    assert ei.value.code == "adjustment_required"


def test_admin_edit_bounds(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=1)
    intent, attempt, _ = _seed_addon_intent(db, uid, key="adm-bound", paid_at=paid_at)
    req = _create_request(db, uid, intent, attempt)
    rev = create_initial_automatic_revision(db, req.id, expected_version=1)
    db.refresh(req)
    with pytest.raises(RefundRevisionServiceError) as ei:
        create_admin_revision(
            db,
            req.id,
            based_on_revision_id=rev.id,
            admin_user_id=uid,
            expected_version=req.version,
            proposed_refund_amount="200.00",
            adjustment_reason_category="goodwill",
            adjustment_comment="too much",
        )
    assert ei.value.code == "refund_exceeds_cap"

    admin_rev = create_admin_revision(
        db,
        req.id,
        based_on_revision_id=rev.id,
        admin_user_id=uid,
        expected_version=req.version,
        proposed_refund_amount="50.00",
        adjustment_reason_category="goodwill",
        adjustment_comment="partial ok",
    )
    db.refresh(req)
    assert admin_rev.revision_type == RefundRevisionType.ADMIN.value
    assert admin_rev.based_on_revision_id == rev.id
    assert admin_rev.proposed_refund_amount == Decimal("50.00")
    assert req.status == RefundRequestStatus.ADMIN_EDITED.value
    assert admin_rev.calculation_snapshot["changed_fields"]["proposed_refund_amount"][
        "to"
    ] == "50.00"


def test_stale_revision_approval_rejected(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=1)
    intent, attempt, addon = _seed_addon_intent(
        db, uid, key="stale-1", paid_at=paid_at
    )
    req = _create_request(db, uid, intent, attempt)
    rev = create_initial_automatic_revision(db, req.id, expected_version=1)
    db.refresh(req)
    assert req.status == RefundRequestStatus.AWAITING_ADMIN_REVIEW.value

    # Usage appears after calculation → fingerprint changes.
    from backend.models.tariff import (
        AddonUsageLedgerEntry,
        AddonUsageOperation,
        AddonUsageSourceType,
        TariffFifoCutover,
    )

    cut = db.query(TariffFifoCutover).first()
    cut_at = cut.cutover_at if cut else _utc()
    if getattr(cut_at, "tzinfo", None) is None:
        cut_at = cut_at.replace(tzinfo=timezone.utc)
    addon.created_at = (cut_at - timedelta(days=1)).replace(tzinfo=None)
    db.add(
        AddonUsageLedgerEntry(
            user_id=uid,
            source_type=AddonUsageSourceType.LEGACY_UNATTRIBUTED.value,
            units=1,
            operation=AddonUsageOperation.DEBIT.value,
            source_event_key="legacy-stale-test",
            period_start=addon.period_start,
            period_end=addon.period_end,
            created_at=cut_at.replace(tzinfo=None),
        )
    )
    _add_usage(
        db,
        uid,
        period_start=addon.period_start,
        period_end=addon.period_end,
        messages=1,
        updated_at=_utc(),
    )
    db.commit()

    result = approve_revision(
        db,
        req.id,
        revision_id=rev.id,
        expected_version=req.version,
        actor_user_id=uid,
    )
    assert isinstance(result, ApproveRevisionResult)
    assert result.approved is False
    assert result.stale is True
    assert result.new_revision is not None
    db.refresh(req)
    assert req.approved_revision_id is None
    assert req.current_revision_number == 2
    assert result.new_revision.calculation_status == RefundCalculationStatus.MANUAL_REQUIRED.value


def test_optimistic_version_conflict(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=1)
    intent, attempt, _ = _seed_addon_intent(db, uid, key="ver-1", paid_at=paid_at)
    req = _create_request(db, uid, intent, attempt)
    create_initial_automatic_revision(db, req.id, expected_version=1)
    db.refresh(req)
    with pytest.raises(RefundRevisionServiceError) as ei:
        recalculate_automatic_revision(
            db, req.id, expected_version=1, calculation_at=_utc()
        )
    assert ei.value.code == "version_conflict"


def test_frozen_request_cannot_recalculate(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=1)
    intent, attempt, _ = _seed_addon_intent(db, uid, key="froz-1", paid_at=paid_at)
    req = _create_request(db, uid, intent, attempt)
    create_initial_automatic_revision(db, req.id, expected_version=1)
    db.refresh(req)
    req.status = RefundRequestStatus.REFUND_PROCESSING.value
    db.commit()
    with pytest.raises(RefundRevisionServiceError) as ei:
        recalculate_automatic_revision(
            db, req.id, expected_version=req.version, calculation_at=_utc()
        )
    assert ei.value.code in {"financials_frozen", "status_not_editable"}


def test_approve_happy_path_and_audit(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=1)
    intent, attempt, _ = _seed_addon_intent(db, uid, key="appr-1", paid_at=paid_at)
    req = _create_request(db, uid, intent, attempt)
    rev = create_initial_automatic_revision(db, req.id, expected_version=1)
    db.refresh(req)
    result = approve_revision(
        db,
        req.id,
        revision_id=rev.id,
        expected_version=req.version,
        actor_user_id=uid,
    )
    assert result.approved is True
    db.refresh(req)
    assert req.status == RefundRequestStatus.APPROVED.value
    assert req.approved_revision_id == rev.id
    events = (
        db.query(RefundAuditEvent)
        .filter(RefundAuditEvent.refund_request_id == req.id)
        .all()
    )
    assert any(e.action == "revision_created" for e in events)
    assert any(e.action == "approved_revision_set" for e in events)
    # Cannot start refund_processing in this stage via these services.
    assert req.status != RefundRequestStatus.REFUND_PROCESSING.value


def test_confirm_admin_then_approve(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=1)
    intent, attempt, _ = _seed_addon_intent(db, uid, key="conf-1", paid_at=paid_at)
    req = _create_request(db, uid, intent, attempt)
    rev = create_initial_automatic_revision(db, req.id, expected_version=1)
    db.refresh(req)
    admin_rev = create_admin_revision(
        db,
        req.id,
        based_on_revision_id=rev.id,
        admin_user_id=uid,
        expected_version=req.version,
        proposed_refund_amount="100.00",
        adjustment_reason_category="policy",
        adjustment_comment="adjusted",
    )
    db.refresh(req)
    confirm_admin_revision(
        db, req.id, expected_version=req.version, actor_user_id=uid
    )
    db.refresh(req)
    assert req.status == RefundRequestStatus.AWAITING_FINAL_CONFIRMATION.value
    result = approve_revision(
        db,
        req.id,
        revision_id=admin_rev.id,
        expected_version=req.version,
        actor_user_id=uid,
    )
    assert result.approved is True


def test_reject_and_cancel(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=1)
    intent, attempt, _ = _seed_addon_intent(db, uid, key="rej-1", paid_at=paid_at)
    req = _create_request(db, uid, intent, attempt)
    create_initial_automatic_revision(db, req.id, expected_version=1)
    db.refresh(req)
    reject_request(
        db,
        req.id,
        expected_version=req.version,
        actor_user_id=uid,
        reason="abuse",
    )
    db.refresh(req)
    assert req.status == RefundRequestStatus.REJECTED.value

    intent2, attempt2, _ = _seed_addon_intent(db, uid, key="can-1", paid_at=paid_at)
    req2 = _create_request(db, uid, intent2, attempt2)
    create_initial_automatic_revision(db, req2.id, expected_version=1)
    db.refresh(req2)
    cancel_request(db, req2.id, expected_version=req2.version, actor_user_id=uid)
    db.refresh(req2)
    assert req2.status == RefundRequestStatus.CANCELED.value


def test_mark_needs_information(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=1)
    intent, attempt, _ = _seed_addon_intent(db, uid, key="need-1", paid_at=paid_at)
    req = _create_request(db, uid, intent, attempt)
    create_initial_automatic_revision(db, req.id, expected_version=1)
    db.refresh(req)
    mark_needs_information(
        db,
        req.id,
        expected_version=req.version,
        actor_user_id=uid,
        reason="need receipt",
    )
    db.refresh(req)
    assert req.status == RefundRequestStatus.NEEDS_INFORMATION.value


def test_cannot_approve_stale_revision_number(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=1)
    intent, attempt, _ = _seed_addon_intent(db, uid, key="old-appr", paid_at=paid_at)
    req = _create_request(db, uid, intent, attempt)
    r1 = create_initial_automatic_revision(db, req.id, expected_version=1)
    db.refresh(req)
    recalculate_automatic_revision(
        db, req.id, expected_version=req.version, calculation_at=_utc()
    )
    db.refresh(req)
    with pytest.raises(RefundRevisionServiceError) as ei:
        approve_revision(
            db,
            req.id,
            revision_id=r1.id,
            expected_version=req.version,
            actor_user_id=uid,
        )
    assert ei.value.code == "stale_revision"


def test_revision_number_collision_recovery(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=1)
    intent, attempt, _ = _seed_addon_intent(db, uid, key="coll-1", paid_at=paid_at)
    req = _create_request(db, uid, intent, attempt)
    create_initial_automatic_revision(db, req.id, expected_version=1)
    db.refresh(req)

    # Simulate lost update: current_revision_number lagging behind existing row.
    ghost = RefundRevision(
        refund_request_id=req.id,
        revision_number=2,
        revision_type=RefundRevisionType.AUTOMATIC.value,
        calculation_status=RefundCalculationStatus.OK.value,
        refund_type=RefundType.FULL.value,
        currency="RUB",
        paid_amount=Decimal("190.00"),
        prior_refunded_amount=Decimal("0.00"),
        proposed_refund_amount=Decimal("190.00"),
        calculation_at=_utc(),
        entitlement_action="none",
        calculation_snapshot={"input_fingerprint": "x"},
    )
    db.add(ghost)
    req.current_revision_number = 1
    db.commit()
    db.refresh(req)

    rev = recalculate_automatic_revision(
        db, req.id, expected_version=req.version, calculation_at=_utc()
    )
    assert rev.revision_number == 3
    db.refresh(req)
    assert req.current_revision_number == 3


def test_build_calculation_fingerprint_stable(client, db):
    token = register_and_get_token(client)
    uid = get_user_id(client, token)
    paid_at = _utc() - timedelta(hours=1)
    intent, attempt, _ = _seed_addon_intent(db, uid, key="fp-1", paid_at=paid_at)
    req = _create_request(db, uid, intent, attempt)
    a = build_refund_calculation(db, req, calculation_at=paid_at + timedelta(minutes=1))
    b = build_refund_calculation(db, req, calculation_at=paid_at + timedelta(minutes=2))
    assert a.input_fingerprint == b.input_fingerprint
