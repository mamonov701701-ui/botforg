"""
Тесты provider-agnostic payment fulfillment (Этап 6.7).
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from backend.models.checkout import (
    CheckoutIntentStatus,
    PaymentAttempt,
    PaymentWebhookEvent,
    PaymentWebhookProcessStatus,
)
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    SubscriptionStatus,
    UserAddon,
    UserSubscription,
)
from backend.services.checkout_intents import create_checkout_intent
from backend.services.payment_fulfillment import (
    FulfillmentError,
    create_payment_attempt,
    fulfill_paid_intent,
)
from backend.tests.conftest import (
    TestingSessionLocal,
    get_user_id,
    register_and_get_token,
)


def _utc(y=2026, m=6, d=15, h=12):
    return datetime(y, m, d, h, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _user(client, db):
    auth = register_and_get_token(client)
    uid = get_user_id(client, auth)
    return auth, uid


def _ensure_addon(db, code="ful_msg_100", amount=100, price="49.00"):
    pkg = db.query(AddonPackage).filter(AddonPackage.code == code).first()
    if pkg:
        return pkg
    pkg = AddonPackage(
        code=code,
        name_ru=code,
        type=AddonPackageType.MESSAGES,
        amount=amount,
        price=Decimal(price),
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


def _tariff_intent(db, user_id, key="t1"):
    return create_checkout_intent(
        db,
        user_id=user_id,
        product_type="tariff",
        code="business",
        idempotency_key=key,
    )


def _addon_intent(db, user_id, key="a1"):
    from datetime import datetime, timedelta, timezone

    from backend.models.plan import Plan
    from backend.models.tariff import SubscriptionStatus

    # Addon checkout requires effective plan.limits.addon_purchase (Business+).
    plan = db.query(Plan).filter(Plan.code == "business").one()
    start = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(
        UserSubscription(
            user_id=user_id,
            plan_id=plan.id,
            status=SubscriptionStatus.ACTIVE,
            current_period_start=start,
            current_period_end=start + timedelta(days=30),
        )
    )
    db.commit()

    pkg = _ensure_addon(db)
    return create_checkout_intent(
        db,
        user_id=user_id,
        product_type="addon",
        code=pkg.code,
        idempotency_key=key,
    )


def _fulfill(db, intent, user_id, *, event_id="evt-1", payment_id="pay-1", **kw):
    defaults = dict(
        checkout_intent_id=intent.id,
        user_id=user_id,
        provider="testpay",
        provider_payment_id=payment_id,
        provider_event_id=event_id,
        event_type="payment.succeeded",
        amount=intent.amount,
        currency=intent.currency,
        period_start=_utc(),
        period_end=_utc() + timedelta(days=30),
        now=_utc(),
    )
    defaults.update(kw)
    return fulfill_paid_intent(db, **defaults)


def test_fulfill_tariff_creates_subscription(client, db):
    _, uid = _user(client, db)
    intent = _tariff_intent(db, uid)
    create_payment_attempt(
        db,
        checkout_intent_id=intent.id,
        user_id=uid,
        provider="testpay",
        idempotency_key="att-1",
        provider_payment_id="pay-tariff-1",
    )
    result = _fulfill(db, intent, uid, event_id="e-t1", payment_id="pay-tariff-1")
    assert result.intent.status == CheckoutIntentStatus.FULFILLED.value
    assert result.intent.fulfilled_subscription_id is not None
    assert result.already_fulfilled is False
    subs = db.query(UserSubscription).filter(UserSubscription.user_id == uid).all()
    assert len(subs) == 1
    assert subs[0].provider_subscription_id == "testpay:pay-tariff-1"
    assert result.event.process_status == PaymentWebhookProcessStatus.PROCESSED.value


def test_fulfill_addon_creates_user_addon(client, db):
    _, uid = _user(client, db)
    intent = _addon_intent(db, uid)
    result = _fulfill(db, intent, uid, event_id="e-a1", payment_id="pay-addon-1")
    assert result.intent.status == CheckoutIntentStatus.FULFILLED.value
    assert result.intent.fulfilled_addon_id is not None
    addons = db.query(UserAddon).filter(UserAddon.user_id == uid).all()
    assert len(addons) == 1
    assert addons[0].provider_ref == "testpay:pay-addon-1"
    # Default validity: 30 calendar days from activation.
    delta = addons[0].period_end - addons[0].period_start
    assert abs(delta.total_seconds() - 30 * 24 * 3600) < 2


def test_fulfill_bot_addon_uses_current_tariff_period(client, db):
    _, uid = _user(client, db)
    from backend.models.plan import Plan

    plan = db.query(Plan).filter(Plan.code == "business").one()
    start = datetime.now(timezone.utc).replace(tzinfo=None)
    end = start + timedelta(days=12)
    db.add(
        UserSubscription(
            user_id=uid,
            plan_id=plan.id,
            status=SubscriptionStatus.ACTIVE,
            current_period_start=start,
            current_period_end=end,
        )
    )
    pkg = AddonPackage(
        code="ful_bot_cap",
        name_ru="Бот",
        type=AddonPackageType.ACTIVE_BOT,
        amount=1,
        price=Decimal("10.00"),
        currency="RUB",
        duration_type="current_billing_period",
        is_active=True,
        is_public=True,
        sort_order=1,
    )
    db.add(pkg)
    db.commit()
    intent = create_checkout_intent(
        db,
        user_id=uid,
        product_type="addon",
        code="ful_bot_cap",
        idempotency_key="ful-bot-cap",
    )
    result = fulfill_paid_intent(
        db,
        checkout_intent_id=intent.id,
        user_id=uid,
        provider="testpay",
        provider_payment_id="pay-bot-cap",
        provider_event_id="e-bot-cap",
        event_type="payment.succeeded",
        amount=intent.amount,
        currency=intent.currency,
    )
    addon = db.query(UserAddon).filter(UserAddon.id == result.intent.fulfilled_addon_id).one()
    got_end = addon.period_end.replace(tzinfo=None) if addon.period_end.tzinfo else addon.period_end
    assert abs((got_end - end).total_seconds()) < 2


def test_fulfill_team_member_addon_uses_current_tariff_period(client, db):
    _, uid = _user(client, db)
    from backend.models.plan import Plan

    plan = db.query(Plan).filter(Plan.code == "business").one()
    start = datetime.now(timezone.utc).replace(tzinfo=None)
    end = start + timedelta(days=9)
    db.add(
        UserSubscription(
            user_id=uid,
            plan_id=plan.id,
            status=SubscriptionStatus.ACTIVE,
            current_period_start=start,
            current_period_end=end,
        )
    )
    pkg = AddonPackage(
        code="ful_team_cap",
        name_ru="Участник",
        type=AddonPackageType.TEAM_MEMBER,
        amount=1,
        price=Decimal("10.00"),
        currency="RUB",
        duration_type="current_billing_period",
        validity_days=90,
        is_active=True,
        is_public=True,
        sort_order=1,
    )
    db.add(pkg)
    db.commit()
    intent = create_checkout_intent(
        db,
        user_id=uid,
        product_type="addon",
        code="ful_team_cap",
        idempotency_key="ful-team-cap",
    )
    result = fulfill_paid_intent(
        db,
        checkout_intent_id=intent.id,
        user_id=uid,
        provider="testpay",
        provider_payment_id="pay-team-cap",
        provider_event_id="e-team-cap",
        event_type="payment.succeeded",
        amount=intent.amount,
        currency=intent.currency,
    )
    addon = db.query(UserAddon).filter(UserAddon.id == result.intent.fulfilled_addon_id).one()
    got_end = addon.period_end.replace(tzinfo=None) if addon.period_end.tzinfo else addon.period_end
    assert abs((got_end - end).total_seconds()) < 2
    # Must not use package.validity_days (90).
    assert abs((got_end - (addon.period_start.replace(tzinfo=None) + timedelta(days=90))).total_seconds()) > 60


def test_fulfill_addon_replay_does_not_extend_or_duplicate(client, db):
    _, uid = _user(client, db)
    intent = _addon_intent(db, uid, key="addon-idem")
    r1 = _fulfill(db, intent, uid, event_id="e-a-idem", payment_id="pay-addon-idem")
    end1 = (
        db.query(UserAddon)
        .filter(UserAddon.id == r1.intent.fulfilled_addon_id)
        .one()
        .period_end
    )
    r2 = _fulfill(db, intent, uid, event_id="e-a-idem-2", payment_id="pay-addon-idem")
    assert r2.already_fulfilled is True
    addons = db.query(UserAddon).filter(UserAddon.user_id == uid).all()
    assert len(addons) == 1
    assert addons[0].period_end == end1


def test_webhook_replay_is_idempotent(client, db):
    _, uid = _user(client, db)
    intent = _tariff_intent(db, uid, key="replay")
    r1 = _fulfill(db, intent, uid, event_id="same-evt", payment_id="pay-r1")
    r2 = _fulfill(db, intent, uid, event_id="same-evt", payment_id="pay-r1")
    assert r1.intent.id == r2.intent.id
    assert r2.already_fulfilled is True or r2.event.process_status == "processed"
    assert (
        db.query(UserSubscription).filter(UserSubscription.user_id == uid).count() == 1
    )
    assert (
        db.query(PaymentWebhookEvent)
        .filter(PaymentWebhookEvent.provider_event_id == "same-evt")
        .count()
        == 1
    )


def test_double_fulfill_different_events_no_second_entitlement(client, db):
    _, uid = _user(client, db)
    intent = _addon_intent(db, uid, key="dbl")
    _fulfill(db, intent, uid, event_id="e1", payment_id="pay-d1")
    r2 = _fulfill(db, intent, uid, event_id="e2", payment_id="pay-d1")
    assert r2.already_fulfilled is True
    assert db.query(UserAddon).filter(UserAddon.user_id == uid).count() == 1


def test_amount_mismatch_marks_event_error_and_no_entitlement(client, db):
    _, uid = _user(client, db)
    intent = _tariff_intent(db, uid, key="amt")
    with pytest.raises(FulfillmentError) as exc:
        _fulfill(
            db,
            intent,
            uid,
            event_id="e-amt",
            payment_id="pay-amt",
            amount=Decimal("1.00"),
        )
    assert exc.value.code == "amount_mismatch"
    db.refresh(intent)
    assert intent.status != CheckoutIntentStatus.FULFILLED.value
    assert (
        db.query(UserSubscription).filter(UserSubscription.user_id == uid).count() == 0
    )
    ev = (
        db.query(PaymentWebhookEvent)
        .filter(PaymentWebhookEvent.provider_event_id == "e-amt")
        .one()
    )
    assert ev.process_status == PaymentWebhookProcessStatus.ERROR.value


def test_currency_mismatch(client, db):
    _, uid = _user(client, db)
    intent = _tariff_intent(db, uid, key="cur")
    with pytest.raises(FulfillmentError) as exc:
        _fulfill(
            db,
            intent,
            uid,
            event_id="e-cur",
            payment_id="pay-cur",
            currency="USD",
        )
    assert exc.value.code == "currency_mismatch"


def test_foreign_user_cannot_fulfill(client, db):
    _, uid_a = _user(client, db)
    _, uid_b = _user(client, db)
    intent = _tariff_intent(db, uid_a, key="own")
    with pytest.raises(FulfillmentError) as exc:
        _fulfill(db, intent, uid_b, event_id="e-x", payment_id="pay-x")
    assert exc.value.code == "intent_forbidden"


def test_cancelled_intent_cannot_fulfill(client, db):
    _, uid = _user(client, db)
    intent = _tariff_intent(db, uid, key="cancel")
    intent.status = CheckoutIntentStatus.CANCELLED.value
    intent.cancelled_at = _utc()
    db.commit()
    with pytest.raises(FulfillmentError) as exc:
        _fulfill(db, intent, uid, event_id="e-c", payment_id="pay-c")
    assert exc.value.code == "intent_not_fulfillable"
    assert (
        db.query(UserSubscription).filter(UserSubscription.user_id == uid).count() == 0
    )


def test_out_of_order_failed_after_fulfilled_ignored(client, db):
    _, uid = _user(client, db)
    intent = _tariff_intent(db, uid, key="ooo")
    _fulfill(db, intent, uid, event_id="e-ok", payment_id="pay-ooo")
    result = fulfill_paid_intent(
        db,
        checkout_intent_id=intent.id,
        user_id=uid,
        provider="testpay",
        provider_payment_id="pay-ooo",
        provider_event_id="e-fail-late",
        event_type="payment.failed",
        amount=intent.amount,
        currency=intent.currency,
        now=_utc(),
    )
    assert result.ignored is True
    db.refresh(intent)
    assert intent.status == CheckoutIntentStatus.FULFILLED.value
    assert (
        db.query(UserSubscription).filter(UserSubscription.user_id == uid).count() == 1
    )


def test_retry_after_error_then_succeeds(client, db):
    _, uid = _user(client, db)
    intent = _tariff_intent(db, uid, key="retry")
    with pytest.raises(FulfillmentError):
        _fulfill(
            db,
            intent,
            uid,
            event_id="e-retry",
            payment_id="pay-retry",
            amount=Decimal("0.01"),
        )
    # same event id retry with correct amount
    result = _fulfill(
        db,
        intent,
        uid,
        event_id="e-retry",
        payment_id="pay-retry",
        amount=intent.amount,
    )
    assert result.intent.status == CheckoutIntentStatus.FULFILLED.value
    ev = (
        db.query(PaymentWebhookEvent)
        .filter(PaymentWebhookEvent.provider_event_id == "e-retry")
        .one()
    )
    assert ev.process_status == PaymentWebhookProcessStatus.PROCESSED.value


def test_create_payment_attempt_sets_awaiting_payment(client, db):
    _, uid = _user(client, db)
    intent = _tariff_intent(db, uid, key="await")
    attempt = create_payment_attempt(
        db,
        checkout_intent_id=intent.id,
        user_id=uid,
        provider="testpay",
        idempotency_key="k-await",
        provider_payment_id="pay-await",
    )
    db.refresh(intent)
    assert intent.status == CheckoutIntentStatus.AWAITING_PAYMENT.value
    assert attempt.status == "pending"
    assert (
        db.query(PaymentAttempt).filter(PaymentAttempt.id == attempt.id).count() == 1
    )
