"""
Тесты установки товаров маркетплейса (free vs paid).
"""
from decimal import Decimal

from backend.models.bot import Bot
from backend.models.market import MarketItem, MarketItemType
from backend.models.scenario import Scenario
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


def test_install_free_scenario_ok(client):
    auth = register_and_get_token(client)
    user_id = get_user_id(client, auth)

    db = TestingSessionLocal()
    try:
        scenario = Scenario(
            user_id=user_id,
            name="Исходный сценарий",
            content={"nodes": [], "edges": []},
        )
        db.add(scenario)
        db.flush()

        item = MarketItem(
            item_type=MarketItemType.SCENARIO,
            source_scenario_id=scenario.id,
            title="Бесплатный сценарий",
            seller_id=user_id,
            price=Decimal("0"),
            is_published=True,
        )
        db.add(item)
        db.commit()
        item_id = item.id
    finally:
        db.close()

    res = client.post(
        f"/api/market/items/{item_id}/install-scenario",
        headers={"Authorization": auth},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["created_scenario_id"] is not None


def test_install_paid_scenario_manual_access_required(client):
    auth = register_and_get_token(client)
    user_id = get_user_id(client, auth)

    db = TestingSessionLocal()
    try:
        scenario = Scenario(
            user_id=user_id,
            name="Платный исходник",
            content={"nodes": [], "edges": []},
        )
        db.add(scenario)
        db.flush()

        item = MarketItem(
            item_type=MarketItemType.SCENARIO,
            source_scenario_id=scenario.id,
            title="Платный сценарий",
            seller_id=user_id,
            price=Decimal("500.00"),
            is_published=True,
        )
        db.add(item)
        db.commit()
        item_id = item.id
        scenarios_before = db.query(Scenario).filter(Scenario.user_id == user_id).count()
    finally:
        db.close()

    res = client.post(
        f"/api/market/items/{item_id}/install-scenario",
        headers={"Authorization": auth},
    )
    assert res.status_code == 403
    detail = res.json()["detail"]
    assert detail["code"] == "manual_access_required"
    assert "договорённости с автором" in detail["message"]

    db = TestingSessionLocal()
    try:
        scenarios_after = db.query(Scenario).filter(Scenario.user_id == user_id).count()
        assert scenarios_after == scenarios_before
    finally:
        db.close()


def test_install_paid_bot_manual_access_required(client):
    auth = register_and_get_token(client)
    user_id = get_user_id(client, auth)

    db = TestingSessionLocal()
    try:
        bot = Bot(
            owner_id=user_id,
            title="Исходный бот",
            username="market_src_bot",
            token="placeholder_market_test",
            is_active=False,
        )
        db.add(bot)
        db.flush()

        item = MarketItem(
            item_type=MarketItemType.TEMPLATE,
            source_bot_id=bot.id,
            title="Платный шаблон",
            seller_id=user_id,
            price=Decimal("1000.00"),
            is_published=True,
        )
        db.add(item)
        db.commit()
        item_id = item.id
        bots_before = db.query(Bot).filter(Bot.owner_id == user_id).count()
    finally:
        db.close()

    res = client.post(
        f"/api/market/items/{item_id}/install-bot",
        headers={"Authorization": auth},
    )
    assert res.status_code == 403
    detail = res.json()["detail"]
    assert detail["code"] == "manual_access_required"
    assert "договорённости с автором" in detail["message"]

    db = TestingSessionLocal()
    try:
        bots_after = db.query(Bot).filter(Bot.owner_id == user_id).count()
        assert bots_after == bots_before
    finally:
        db.close()
