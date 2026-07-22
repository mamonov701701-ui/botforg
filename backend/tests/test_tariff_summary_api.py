"""
Тесты GET /me/tariff/summary (Этап 5.4).
"""
from decimal import Decimal

import pytest

from backend.models.bot import Bot
from backend.models.tariff import (
    AddonPackage,
    AddonPackageType,
    GiftGrant,
    GiftGrantStatus,
    GiftType,
    UsageCounter,
    UserAddon,
    UserAddonSource,
    UserAddonStatus,
)
from backend.services.tariff_limits import get_user_tariff_limits
from backend.tests.conftest import TestingSessionLocal, register_and_get_token
from backend.tests.tariff_time import (
    FIXED_TARIFF_NOW,
    freeze_tariff_now,  # noqa: F401 — used via pytestmark
    month_period,
)

pytestmark = pytest.mark.usefixtures("freeze_tariff_now")


def _ensure_addon(db, code: str, pkg_type: AddonPackageType, amount: int) -> AddonPackage:
    pkg = db.query(AddonPackage).filter(AddonPackage.code == code).first()
    if pkg:
        return pkg
    pkg = AddonPackage(
        code=code,
        name_ru=code,
        type=pkg_type,
        amount=amount,
        price=Decimal("0.00"),
        currency="RUB",
        duration_type="current_period",
        is_active=True,
        is_public=True,
        sort_order=0,
    )
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _auth_on_start(client) -> str:
    auth = register_and_get_token(client)
    res = client.post(
        "/me/plan",
        json={"plan_code": "start"},
        headers={"Authorization": auth},
    )
    assert res.status_code == 200
    return auth


def test_tariff_summary_requires_auth(client):
    res = client.get("/me/tariff/summary")
    assert res.status_code == 401


def test_tariff_summary_start_plan_structure(client, db):
    auth = _auth_on_start(client)
    res = client.get("/me/tariff/summary", headers={"Authorization": auth})
    assert res.status_code == 200
    data = res.json()

    assert data["current_plan"]["code"] == "start"
    assert data["current_plan"]["slug"] == "start"
    assert data["current_plan"]["name"]
    assert data["current_plan"]["billing_period"]["start"]
    assert data["current_plan"]["billing_period"]["end"]
    assert data["current_plan"]["source"] in (
        "legacy_plan_code",
        "subscription",
        "fallback_start",
    )

    assert data["messages"]["limit"] == 500
    assert data["messages"]["used"] == 0
    assert data["messages"]["remaining"] == 500
    assert data["active_bots"]["limit"] == 1
    assert data["active_bots"]["used"] == 0
    assert data["active_bots"]["remaining"] == 1
    assert data["team_members"]["limit"] == 0
    assert data["team_members"]["used"] == 0
    assert data["team_members"]["remaining"] == 0

    assert data["flags"]["marketplace_access"] is True
    assert data["flags"]["template_publish"] is True
    assert data["flags"]["scenario_publish"] is True
    assert data["flags"]["addon_purchase"] is False


def test_tariff_summary_matches_tariff_limits_service(client, db):
    auth = _auth_on_start(client)
    me = client.get("/me", headers={"Authorization": auth}).json()
    user_id = me["id"]
    service_summary = get_user_tariff_limits(db, user_id, at=FIXED_TARIFF_NOW)

    res = client.get("/me/tariff/summary", headers={"Authorization": auth})
    data = res.json()
    assert data["messages"]["limit"] == service_summary.messages_limit
    assert data["messages"]["used"] == service_summary.messages_used
    assert data["messages"]["remaining"] == service_summary.messages_remaining
    assert data["active_bots"]["limit"] == service_summary.active_bots_limit
    assert data["active_bots"]["used"] == service_summary.active_bots_used
    assert data["active_bots"]["remaining"] == service_summary.active_bots_remaining
    assert data["team_members"]["limit"] == service_summary.team_members_limit
    assert data["team_members"]["used"] == service_summary.team_members_used
    assert data["team_members"]["remaining"] == service_summary.team_members_remaining


def test_tariff_summary_active_bots_used(client, db):
    auth = _auth_on_start(client)
    me = client.get("/me", headers={"Authorization": auth}).json()
    db.add(
        Bot(
            owner_id=me["id"],
            title="Prod",
            username="prod_bot",
            token="123456789:ProdBot",
            is_active=True,
        )
    )
    db.commit()

    res = client.get("/me/tariff/summary", headers={"Authorization": auth})
    data = res.json()
    assert data["active_bots"]["used"] >= 1
    assert data["active_bots"]["remaining"] == max(
        0, (data["active_bots"]["limit"] or 0) - data["active_bots"]["used"]
    )


def test_tariff_summary_active_addons_and_gifts(client, db):
    auth = _auth_on_start(client)
    me = client.get("/me", headers={"Authorization": auth}).json()
    user_id = me["id"]
    period_start, period_end = month_period()
    pkg = _ensure_addon(db, "api_msg_500", AddonPackageType.MESSAGES, 500)
    db.add(
        UserAddon(
            user_id=user_id,
            addon_package_id=pkg.id,
            amount=500,
            period_start=period_start,
            period_end=period_end,
            status=UserAddonStatus.ACTIVE,
            source=UserAddonSource.PURCHASE,
        )
    )
    admin_me = client.get("/me", headers={"Authorization": auth}).json()
    db.add(
        GiftGrant(
            target_user_id=user_id,
            gift_type=GiftType.MESSAGES,
            amount=100,
            starts_at=period_start,
            ends_at=period_end,
            granted_by_user_id=admin_me["id"],
            status=GiftGrantStatus.ACTIVE,
        )
    )
    db.commit()

    res = client.get("/me/tariff/summary", headers={"Authorization": auth})
    data = res.json()
    assert len(data["active_addons"]) == 1
    assert data["active_addons"][0]["code"] == "api_msg_500"
    assert "period_end" in data["active_addons"][0]
    assert data["active_addons"][0]["expires_at"] == data["active_addons"][0]["period_end"]
    assert len(data["active_gifts"]) == 1
    assert data["active_gifts"][0]["gift_type"] == "messages"
    assert data["messages"]["limit"] == 500 + 500 + 100


def test_tariff_summary_message_warnings(client, db):
    auth = _auth_on_start(client)
    me = client.get("/me", headers={"Authorization": auth}).json()
    period_start, period_end = month_period()
    db.add(
        UsageCounter(
            user_id=me["id"],
            period_start=period_start,
            period_end=period_end,
            messages_used=425,
            active_bots_used=0,
            team_members_used=0,
        )
    )
    db.commit()

    res = client.get("/me/tariff/summary", headers={"Authorization": auth})
    data = res.json()
    msg_warnings = [w for w in data["warnings"] if w["type"] == "messages_usage"]
    assert [w["threshold"] for w in msg_warnings] == [70, 85]

    db.query(UsageCounter).filter(UsageCounter.user_id == me["id"]).update(
        {"messages_used": 500}
    )
    db.commit()
    res_full = client.get("/me/tariff/summary", headers={"Authorization": auth})
    msg_full = [
        w for w in res_full.json()["warnings"] if w["type"] == "messages_usage"
    ]
    assert [w["threshold"] for w in msg_full] == [70, 85, 95, 100]


def test_tariff_summary_business_pro_team_members_limit(client, db):
    from backend.models.plan import Plan
    from backend.models.user import User

    auth = _auth_on_start(client)
    me = client.get("/me", headers={"Authorization": auth}).json()
    user = db.query(User).filter(User.id == me["id"]).one()
    user.plan_code = "business_pro"
    db.commit()

    pro = db.query(Plan).filter(Plan.code == "business_pro").one()
    assert dict(pro.limits or {}).get("team_members") == 3

    res = client.get("/me/tariff/summary", headers={"Authorization": auth})
    assert res.status_code == 200
    data = res.json()
    assert data["current_plan"]["code"] == "business_pro"
    assert data["team_members"]["limit"] == 3
    auth = _auth_on_start(client)
    me = client.get("/me", headers={"Authorization": auth}).json()
    from backend.models.plan import Plan
    from backend.models.tariff import GiftGrant, GiftGrantStatus, GiftType

    business_pro = db.query(Plan).filter(Plan.code == "business_pro").first()
    assert business_pro is not None
    period_start, period_end = month_period()
    db.add(
        GiftGrant(
            target_user_id=me["id"],
            gift_type=GiftType.PLAN,
            plan_id=business_pro.id,
            starts_at=period_start,
            ends_at=period_end,
            granted_by_user_id=me["id"],
            status=GiftGrantStatus.ACTIVE,
        )
    )
    db.commit()

    res = client.get("/me/tariff/summary", headers={"Authorization": auth})
    data = res.json()
    assert data["current_plan"]["code"] == "business_pro"
    assert data["current_plan"]["source"] == "gift_plan"
    assert data["messages"]["limit"] == 10000


def test_tariff_summary_does_not_mutate_usage(client, db):
    auth = _auth_on_start(client)
    me = client.get("/me", headers={"Authorization": auth}).json()
    period_start, period_end = month_period()
    db.add(
        UsageCounter(
            user_id=me["id"],
            period_start=period_start,
            period_end=period_end,
            messages_used=10,
            active_bots_used=0,
            team_members_used=0,
        )
    )
    db.commit()
    counter_id = db.query(UsageCounter).filter(UsageCounter.user_id == me["id"]).one().id

    client.get("/me/tariff/summary", headers={"Authorization": auth})
    client.get("/me/tariff/summary", headers={"Authorization": auth})

    counter = db.query(UsageCounter).filter(UsageCounter.id == counter_id).one()
    assert counter.messages_used == 10
    assert db.query(UsageCounter).filter(UsageCounter.user_id == me["id"]).count() == 1
