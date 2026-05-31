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


def test_install_paid_scenario_with_grant(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)
    requester_id = get_user_id(client, auth_requester)

    db = TestingSessionLocal()
    try:
        scenario = Scenario(
            user_id=author_id,
            name="Платный исходник",
            content={"nodes": [{"id": "1"}], "edges": []},
        )
        db.add(scenario)
        db.flush()

        item = MarketItem(
            item_type=MarketItemType.SCENARIO,
            source_scenario_id=scenario.id,
            title="Платный сценарий с grant",
            seller_id=author_id,
            price=Decimal("500.00"),
            is_published=True,
        )
        db.add(item)
        db.commit()
        item_id = item.id
        scenarios_before = db.query(Scenario).filter(Scenario.user_id == requester_id).count()
    finally:
        db.close()

    req = client.post(
        f"/api/market/items/{item_id}/access-requests",
        json={},
        headers={"Authorization": auth_requester},
    )
    assert req.status_code == 201
    request_id = req.json()["request"]["id"]

    grant = client.post(
        f"/api/market/access-requests/{request_id}/grant",
        json={},
        headers={"Authorization": auth_author},
    )
    assert grant.status_code == 201

    res = client.post(
        f"/api/market/items/{item_id}/install-scenario",
        headers={"Authorization": auth_requester},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["created_scenario_id"] is not None

    db = TestingSessionLocal()
    try:
        scenarios_after = db.query(Scenario).filter(Scenario.user_id == requester_id).count()
        assert scenarios_after == scenarios_before + 1

        copied = db.query(Scenario).filter(Scenario.id == data["created_scenario_id"]).first()
        assert copied is not None
        assert copied.content == {"nodes": [{"id": "1"}], "edges": []}

        item = db.query(MarketItem).filter(MarketItem.id == item_id).first()
        assert item.sales_count == 1
    finally:
        db.close()


def test_install_paid_bot_with_grant(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)
    requester_id = get_user_id(client, auth_requester)

    db = TestingSessionLocal()
    try:
        bot = Bot(
            owner_id=author_id,
            title="Исходный бот автора",
            username="market_grant_src_bot",
            token="placeholder_market_grant_test",
            is_active=False,
        )
        db.add(bot)
        db.flush()

        bot_scenario = Scenario(
            user_id=author_id,
            bot_id=bot.id,
            name="Сценарий бота",
            content={"nodes": [], "edges": []},
        )
        db.add(bot_scenario)
        db.flush()

        item = MarketItem(
            item_type=MarketItemType.TEMPLATE,
            source_bot_id=bot.id,
            title="Платный шаблон с grant",
            seller_id=author_id,
            price=Decimal("1000.00"),
            is_published=True,
        )
        db.add(item)
        db.commit()
        item_id = item.id
        bots_before = db.query(Bot).filter(Bot.owner_id == requester_id).count()
    finally:
        db.close()

    req = client.post(
        f"/api/market/items/{item_id}/access-requests",
        json={},
        headers={"Authorization": auth_requester},
    )
    assert req.status_code == 201
    request_id = req.json()["request"]["id"]

    grant = client.post(
        f"/api/market/access-requests/{request_id}/grant",
        json={},
        headers={"Authorization": auth_author},
    )
    assert grant.status_code == 201

    res = client.post(
        f"/api/market/items/{item_id}/install-bot",
        headers={"Authorization": auth_requester},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["created_bot_id"] is not None
    assert data["created_scenarios_count"] == 1

    db = TestingSessionLocal()
    try:
        bots_after = db.query(Bot).filter(Bot.owner_id == requester_id).count()
        assert bots_after == bots_before + 1

        copied_bot = db.query(Bot).filter(Bot.id == data["created_bot_id"]).first()
        assert copied_bot is not None
        assert copied_bot.owner_id == requester_id

        item = db.query(MarketItem).filter(MarketItem.id == item_id).first()
        assert item.sales_count == 1
    finally:
        db.close()
