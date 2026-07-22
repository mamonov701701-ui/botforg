"""
Тесты публичного каталога GET /tariffs и GET /addons (Этап 6.1).
"""
from decimal import Decimal

import pytest

from backend.models.plan import Plan
from backend.models.tariff import AddonPackage, AddonPackageType
from backend.tests.conftest import TestingSessionLocal, register_and_get_token


@pytest.fixture
def db(client):
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


def _make_addon(
    db,
    *,
    code: str,
    sort_order: int = 0,
    is_active: bool = True,
    is_public: bool = True,
    amount: int = 100,
    price: str = "199.50",
) -> AddonPackage:
    pkg = AddonPackage(
        code=code,
        name_ru=f"Пакет {code}",
        description_ru=f"Описание {code}",
        type=AddonPackageType.MESSAGES,
        amount=amount,
        price=Decimal(price),
        currency="RUB",
        duration_type="current_period",
        available_from_plan=["start"],
        max_per_period=3,
        is_active=is_active,
        is_public=is_public,
        sort_order=sort_order,
    )
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg


def test_tariffs_returns_active_public_seeded_plans(client, db):
    res = client.get("/tariffs")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    codes = [item["code"] for item in data]
    assert "start" in codes
    for item in data:
        assert "code" in item
        assert "name" in item
        assert "limits" in item
        assert "sort_order" in item
        assert "created_at" not in item
        assert "id" not in item
        assert "is_active" not in item
        assert "is_public" not in item


def test_tariffs_excludes_hidden_and_inactive(client, db):
    start = db.query(Plan).filter(Plan.code == "start").one()
    business = db.query(Plan).filter(Plan.code == "business").one()
    start.is_public = False
    business.is_active = False
    db.commit()

    res = client.get("/tariffs")
    assert res.status_code == 200
    codes = {item["code"] for item in res.json()}
    assert "start" not in codes
    assert "business" not in codes

    # restore for other tests sharing plans table
    start.is_public = True
    business.is_active = True
    db.commit()


def test_tariffs_sorted_by_sort_order(client, db):
    res = client.get("/tariffs")
    assert res.status_code == 200
    data = res.json()
    orders = [item["sort_order"] for item in data]
    assert orders == sorted(orders)
    codes = [item["code"] for item in data]
    # seeded: start=10, business=20, ...
    if "start" in codes and "business" in codes:
        assert codes.index("start") < codes.index("business")


def test_tariffs_serializes_price_and_limits(client, db):
    res = client.get("/tariffs")
    assert res.status_code == 200
    business = next(item for item in res.json() if item["code"] == "business")
    assert business["name"] == "Бизнес"
    assert business["currency"] == "RUB"
    # Decimal → JSON string
    assert business["price_month"] in ("990.00", "990.0", "990")
    assert isinstance(business["limits"], dict)
    assert business["limits"]["monthly_messages"] == 3000
    assert business["is_recommended"] is False


def test_tariffs_empty_list_when_none_public(client, db):
    plans = db.query(Plan).all()
    for plan in plans:
        plan.is_public = False
    db.commit()

    res = client.get("/tariffs")
    assert res.status_code == 200
    assert res.json() == []

    for plan in plans:
        plan.is_public = True
    db.commit()


def test_addons_returns_active_public_only(client, db):
    _make_addon(db, code="pub_a", sort_order=20, is_active=True, is_public=True)
    _make_addon(db, code="hidden_a", sort_order=5, is_active=True, is_public=False)
    _make_addon(db, code="inactive_a", sort_order=1, is_active=False, is_public=True)

    res = client.get("/addons")
    assert res.status_code == 200
    data = res.json()
    codes = [item["code"] for item in data]
    assert codes == ["pub_a"]
    item = data[0]
    assert item["name_ru"] == "Пакет pub_a"
    assert item["type"] == "messages"
    assert item["amount"] == 100
    assert item["price"] in ("199.50", "199.5")
    assert item["currency"] == "RUB"
    assert item["duration_type"] == "current_period"
    assert item["validity_days"] == 30
    assert item["available_from_plan"] == ["start"]
    assert item["max_per_period"] == 3
    assert item["sort_order"] == 20
    assert "id" not in item
    assert "created_at" not in item
    assert "updated_at" not in item
    assert "is_active" not in item
    assert "is_public" not in item


def test_addons_sorted_by_sort_order(client, db):
    _make_addon(db, code="z_last", sort_order=30)
    _make_addon(db, code="a_first", sort_order=10)
    _make_addon(db, code="m_mid", sort_order=20)

    res = client.get("/addons")
    assert res.status_code == 200
    assert [item["code"] for item in res.json()] == ["a_first", "m_mid", "z_last"]


def test_addons_empty_list(client, db):
    assert db.query(AddonPackage).count() == 0
    res = client.get("/addons")
    assert res.status_code == 200
    assert res.json() == []


def test_catalog_endpoints_do_not_require_auth(client):
    assert client.get("/tariffs").status_code == 200
    assert client.get("/addons").status_code == 200


def test_me_tariff_summary_still_works(client, db):
    """Регрессия: каталог не ломает GET /me/tariff/summary."""
    auth = register_and_get_token(client)
    client.post(
        "/me/plan",
        json={"plan_code": "start"},
        headers={"Authorization": auth},
    )
    res = client.get("/me/tariff/summary", headers={"Authorization": auth})
    assert res.status_code == 200
    data = res.json()
    assert data["current_plan"]["code"] == "start"
    assert data["messages"]["limit"] == 500
    assert "active_bots" in data
    assert "flags" in data
