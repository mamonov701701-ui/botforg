"""
Тесты GET /api/market/items/{id}/access-status
"""
from decimal import Decimal

from backend.models.market import MarketItem, MarketItemType
from backend.models.scenario import Scenario
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


def _create_paid_scenario_item(db, seller_id: int, *, price=Decimal("500.00")) -> MarketItem:
    scenario = Scenario(
        user_id=seller_id,
        name="Исходный",
        content={"nodes": [], "edges": []},
    )
    db.add(scenario)
    db.flush()
    item = MarketItem(
        item_type=MarketItemType.SCENARIO,
        source_scenario_id=scenario.id,
        title="Платный сценарий",
        seller_id=seller_id,
        price=price,
        is_published=True,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def test_access_status_free_item(client):
    auth = register_and_get_token(client)
    user_id = get_user_id(client, auth)

    db = TestingSessionLocal()
    try:
        item = _create_paid_scenario_item(db, user_id, price=Decimal("0"))
        item_id = item.id
    finally:
        db.close()

    res = client.get(
        f"/api/market/items/{item_id}/access-status",
        headers={"Authorization": auth},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "free"
    assert data["is_paid"] is False
    assert data["can_install"] is True
    assert data["has_grant"] is True
    assert data["request"] is None


def test_access_status_none(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)

    db = TestingSessionLocal()
    try:
        item = _create_paid_scenario_item(db, author_id)
        item_id = item.id
    finally:
        db.close()

    res = client.get(
        f"/api/market/items/{item_id}/access-status",
        headers={"Authorization": auth_requester},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "none"
    assert data["is_paid"] is True
    assert data["has_grant"] is False
    assert data["can_install"] is False


def test_access_status_active_request(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)

    db = TestingSessionLocal()
    try:
        item = _create_paid_scenario_item(db, author_id)
        item_id = item.id
    finally:
        db.close()

    created = client.post(
        f"/api/market/items/{item_id}/access-requests",
        json={},
        headers={"Authorization": auth_requester},
    )
    chat_room_id = created.json()["chat_room_id"]

    res = client.get(
        f"/api/market/items/{item_id}/access-status",
        headers={"Authorization": auth_requester},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "new"
    assert data["has_grant"] is False
    assert data["can_install"] is False
    assert data["chat_room_id"] == chat_room_id
    assert data["request"] is not None


def test_access_status_granted(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)

    db = TestingSessionLocal()
    try:
        item = _create_paid_scenario_item(db, author_id)
        item_id = item.id
    finally:
        db.close()

    created = client.post(
        f"/api/market/items/{item_id}/access-requests",
        json={},
        headers={"Authorization": auth_requester},
    )
    request_id = created.json()["request"]["id"]

    grant = client.post(
        f"/api/market/access-requests/{request_id}/grant",
        json={},
        headers={"Authorization": auth_author},
    )
    assert grant.status_code == 201

    res = client.get(
        f"/api/market/items/{item_id}/access-status",
        headers={"Authorization": auth_requester},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "access_granted"
    assert data["has_grant"] is True
    assert data["can_install"] is True


def test_access_status_owner(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)

    db = TestingSessionLocal()
    try:
        item = _create_paid_scenario_item(db, author_id)
        item_id = item.id
    finally:
        db.close()

    res = client.get(
        f"/api/market/items/{item_id}/access-status",
        headers={"Authorization": auth_author},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "owner"
    assert data["is_paid"] is True
    assert data["can_install"] is False
    assert data["has_grant"] is False
