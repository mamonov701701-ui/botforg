"""
Тесты gate mock writes и внутреннего entitlement service (Этап 6.3).
"""
from datetime import datetime, timezone
from decimal import Decimal

import pytest

from backend.auth.password import hash_password
from backend.models.plan import Plan
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    GiftGrantStatus,
    GiftType,
    SubscriptionStatus,
    UserAddonSource,
    UserAddonStatus,
    UserSubscription,
)
from backend.models.user import User
from backend.services.dev_tariff_gate import (
    MSG_DEV_TARIFF_FULFILLMENT_FORBIDDEN,
    allow_dev_tariff_fulfillment,
)
from backend.services.tariff_entitlements import (
    EntitlementError,
    activate_subscription,
    create_user_addon,
    expire_entitlements,
    grant_gift,
    revoke_gift,
)
from backend.services.tariff_limits import get_user_tariff_limits
from backend.settings import settings
from backend.tests.conftest import TestingSessionLocal, register_and_get_token


def _utc(*args, **kwargs) -> datetime:
    return datetime(*args, tzinfo=timezone.utc, **kwargs)


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _user(db, suffix: str = "ent") -> User:
    user = User(
        email=f"ent_{suffix}@example.com",
        name="Ent",
        plan_code="start",
        role="user",
        hashed_password=hash_password("TestPassword123!"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _addon_pkg(db, code: str = "ent_msg_100") -> AddonPackage:
    pkg = db.query(AddonPackage).filter(AddonPackage.code == code).first()
    if pkg:
        return pkg
    pkg = AddonPackage(
        code=code,
        name_ru=code,
        type=AddonPackageType.MESSAGES,
        amount=100,
        price=Decimal("10.00"),
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


# --- Dev gate ---


def test_allow_dev_tariff_fulfillment_false_in_production(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ALLOW_DEV_TARIFF_FULFILLMENT", True)
    assert allow_dev_tariff_fulfillment() is False


def test_allow_dev_tariff_fulfillment_requires_flag(monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "ALLOW_DEV_TARIFF_FULFILLMENT", False)
    assert allow_dev_tariff_fulfillment() is False


def test_me_plan_forbidden_without_dev_flag(client, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "ALLOW_DEV_TARIFF_FULFILLMENT", False)
    auth = register_and_get_token(client)
    res = client.post(
        "/me/plan",
        json={"plan_code": "business"},
        headers={"Authorization": auth},
    )
    assert res.status_code == 403
    assert res.json()["detail"] == MSG_DEV_TARIFF_FULFILLMENT_FORBIDDEN
    me = client.get("/me", headers={"Authorization": auth}).json()
    assert me["plan_code"] != "business"


def test_me_plan_forbidden_in_production_even_with_flag(client, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ALLOW_DEV_TARIFF_FULFILLMENT", True)
    auth = register_and_get_token(client)
    res = client.post(
        "/me/plan",
        json={"plan_code": "corporate"},
        headers={"Authorization": auth},
    )
    assert res.status_code == 403
    me = client.get("/me", headers={"Authorization": auth}).json()
    assert me["plan_code"] != "corporate"


def test_me_plan_allowed_in_dev_with_flag(client, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "ALLOW_DEV_TARIFF_FULFILLMENT", True)
    auth = register_and_get_token(client)
    res = client.post(
        "/me/plan",
        json={"plan_code": "start"},
        headers={"Authorization": auth},
    )
    assert res.status_code == 200
    assert res.json()["plan_code"] == "start"


def test_billing_quota_forbidden_without_dev_flag(client, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "ALLOW_DEV_TARIFF_FULFILLMENT", False)
    auth = register_and_get_token(client)
    res = client.patch(
        "/billing/quota",
        json={"monthly_limit": 999999},
        headers={"Authorization": auth},
    )
    assert res.status_code == 403
    assert res.json()["detail"] == MSG_DEV_TARIFF_FULFILLMENT_FORBIDDEN


def test_billing_quota_forbidden_in_production(client, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr(settings, "ALLOW_DEV_TARIFF_FULFILLMENT", True)
    auth = register_and_get_token(client)
    res = client.patch(
        "/billing/quota",
        json={"monthly_limit": 999999},
        headers={"Authorization": auth},
    )
    assert res.status_code == 403


def test_mock_plan_does_not_create_subscription(client, db, monkeypatch):
    """Даже при разрешённом mock /me/plan не создаётся UserSubscription (нет оплаты)."""
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "ALLOW_DEV_TARIFF_FULFILLMENT", True)
    auth = register_and_get_token(client)
    res = client.post(
        "/me/plan",
        json={"plan_code": "business"},
        headers={"Authorization": auth},
    )
    assert res.status_code == 200
    me = client.get("/me", headers={"Authorization": auth}).json()
    assert (
        db.query(UserSubscription).filter(UserSubscription.user_id == me["id"]).count()
        == 0
    )


# --- Entitlement service ---


def test_activate_subscription_and_expire(db, client):
    user = _user(db, "sub1")
    plan = db.query(Plan).filter(Plan.code == "business").one()
    start, end = _utc(2026, 6, 1), _utc(2026, 7, 1)
    sub = activate_subscription(
        db,
        user_id=user.id,
        plan_id=plan.id,
        period_start=start,
        period_end=end,
    )
    assert sub.status == SubscriptionStatus.ACTIVE
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.plan_code == "business"
    assert summary.source == "subscription"

    counts = expire_entitlements(db, now=_utc(2026, 7, 1))
    assert counts["subscriptions"] == 1
    db.refresh(sub)
    assert sub.status == SubscriptionStatus.EXPIRED
    summary_after = get_user_tariff_limits(db, user.id, at=_utc(2026, 7, 2))
    assert summary_after.source != "subscription"


def test_activate_subscription_rejects_invalid_period(db, client):
    user = _user(db, "bad_period")
    plan = db.query(Plan).filter(Plan.code == "start").one()
    with pytest.raises(EntitlementError) as exc:
        activate_subscription(
            db,
            user_id=user.id,
            plan_id=plan.id,
            period_start=_utc(2026, 7, 1),
            period_end=_utc(2026, 6, 1),
        )
    assert exc.value.code == "invalid_period"


def test_activate_subscription_overlap_without_replace(db, client):
    user = _user(db, "overlap")
    plan = db.query(Plan).filter(Plan.code == "start").one()
    activate_subscription(
        db,
        user_id=user.id,
        plan_id=plan.id,
        period_start=_utc(2026, 6, 1),
        period_end=_utc(2026, 7, 1),
    )
    with pytest.raises(EntitlementError) as exc:
        activate_subscription(
            db,
            user_id=user.id,
            plan_id=plan.id,
            period_start=_utc(2026, 6, 15),
            period_end=_utc(2026, 7, 15),
            replace_active=False,
        )
    assert exc.value.code == "subscription_overlap"


def test_activate_subscription_replace_active(db, client):
    user = _user(db, "replace")
    start_plan = db.query(Plan).filter(Plan.code == "start").one()
    biz = db.query(Plan).filter(Plan.code == "business").one()
    first = activate_subscription(
        db,
        user_id=user.id,
        plan_id=start_plan.id,
        period_start=_utc(2026, 6, 1),
        period_end=_utc(2026, 7, 1),
    )
    second = activate_subscription(
        db,
        user_id=user.id,
        plan_id=biz.id,
        period_start=_utc(2026, 6, 1),
        period_end=_utc(2026, 7, 1),
        replace_active=True,
    )
    db.refresh(first)
    assert first.status == SubscriptionStatus.CANCELLED
    assert second.status == SubscriptionStatus.ACTIVE
    assert get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15)).plan_code == "business"


def test_activate_subscription_idempotent_by_provider_id(db, client):
    user = _user(db, "idem")
    plan = db.query(Plan).filter(Plan.code == "team").one()
    a = activate_subscription(
        db,
        user_id=user.id,
        plan_id=plan.id,
        period_start=_utc(2026, 6, 1),
        period_end=_utc(2026, 7, 1),
        provider_subscription_id="sub_abc",
    )
    b = activate_subscription(
        db,
        user_id=user.id,
        plan_id=plan.id,
        period_start=_utc(2026, 6, 1),
        period_end=_utc(2026, 7, 1),
        provider_subscription_id="sub_abc",
    )
    assert a.id == b.id
    assert (
        db.query(UserSubscription).filter(UserSubscription.user_id == user.id).count()
        == 1
    )


def test_create_user_addon_and_expire(db, client):
    user = _user(db, "addon1")
    pkg = _addon_pkg(db)
    addon = create_user_addon(
        db,
        user_id=user.id,
        addon_package_id=pkg.id,
        period_start=_utc(2026, 6, 1),
        period_end=_utc(2026, 7, 1),
        source=UserAddonSource.ADMIN,
    )
    assert addon.status == UserAddonStatus.ACTIVE
    assert addon.amount == 100
    assert addon.source == UserAddonSource.ADMIN
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.messages_limit == 500 + 100

    counts = expire_entitlements(db, now=_utc(2026, 7, 1))
    assert counts["addons"] == 1
    db.refresh(addon)
    assert addon.status == UserAddonStatus.EXPIRED


def test_create_user_addon_requires_explicit_source(db, client):
    user = _user(db, "addon_src")
    pkg = _addon_pkg(db, "ent_msg_src")
    with pytest.raises(Exception):
        create_user_addon(
            db,
            user_id=user.id,
            addon_package_id=pkg.id,
            period_start=_utc(2026, 6, 1),
            period_end=_utc(2026, 7, 1),
            source="not_a_valid_source",
        )


def test_grant_and_revoke_gift(db, client):
    user = _user(db, "gift1")
    admin = _user(db, "gift_admin")
    grant = grant_gift(
        db,
        target_user_id=user.id,
        gift_type=GiftType.MESSAGES,
        amount=250,
        starts_at=_utc(2026, 6, 1),
        ends_at=_utc(2026, 7, 1),
        granted_by_user_id=admin.id,
    )
    assert grant.status == GiftGrantStatus.ACTIVE
    summary = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary.messages_limit == 500 + 250

    revoke_gift(db, gift_id=grant.id)
    db.refresh(grant)
    assert grant.status == GiftGrantStatus.CANCELLED
    summary2 = get_user_tariff_limits(db, user.id, at=_utc(2026, 6, 15))
    assert summary2.messages_limit == 500


def test_grant_gift_expires(db, client):
    user = _user(db, "gift_exp")
    admin = _user(db, "gift_exp_admin")
    grant = grant_gift(
        db,
        target_user_id=user.id,
        gift_type=GiftType.ACTIVE_BOT,
        amount=1,
        starts_at=_utc(2026, 6, 1),
        ends_at=_utc(2026, 7, 1),
        granted_by_user_id=admin.id,
    )
    counts = expire_entitlements(db, now=_utc(2026, 7, 2))
    assert counts["gifts"] >= 1
    db.refresh(grant)
    assert grant.status == GiftGrantStatus.EXPIRED


def test_grant_plan_gift_requires_plan_id(db, client):
    user = _user(db, "gift_plan")
    admin = _user(db, "gift_plan_admin")
    with pytest.raises(EntitlementError) as exc:
        grant_gift(
            db,
            target_user_id=user.id,
            gift_type=GiftType.PLAN,
            starts_at=_utc(2026, 6, 1),
            ends_at=_utc(2026, 7, 1),
            granted_by_user_id=admin.id,
        )
    assert exc.value.code == "gift_plan_required"
