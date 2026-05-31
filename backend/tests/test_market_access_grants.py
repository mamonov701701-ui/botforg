"""
Тесты grant/reject для POST /api/market/access-requests/{id}/grant|reject
"""
from decimal import Decimal

from backend.models.chat import ChatMessage, MessageType
from backend.models.market import MarketItem, MarketItemType
from backend.models.market_access import MarketAccessRequest, MarketAccessRequestStatus, MarketItemAccessGrant
from backend.models.scenario import Scenario
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


def _create_paid_scenario_item(db, seller_id: int, *, title: str = "Платный сценарий") -> MarketItem:
    scenario = Scenario(
        user_id=seller_id,
        name="Исходный сценарий",
        content={"nodes": [], "edges": []},
    )
    db.add(scenario)
    db.flush()

    item = MarketItem(
        item_type=MarketItemType.SCENARIO,
        source_scenario_id=scenario.id,
        title=title,
        seller_id=seller_id,
        price=Decimal("500.00"),
        is_published=True,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def _create_access_request(client, item_id: int, requester_auth: str) -> dict:
    res = client.post(
        f"/api/market/items/{item_id}/access-requests",
        json={"message": "Хочу доступ"},
        headers={"Authorization": requester_auth},
    )
    assert res.status_code == 201
    return res.json()


def test_grant_access_request(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)
    requester_id = get_user_id(client, auth_requester)

    db = TestingSessionLocal()
    try:
        item = _create_paid_scenario_item(db, author_id)
        item_id = item.id
    finally:
        db.close()

    req_data = _create_access_request(client, item_id, auth_requester)
    request_id = req_data["request"]["id"]
    chat_room_id = req_data["chat_room_id"]

    res = client.post(
        f"/api/market/access-requests/{request_id}/grant",
        json={"note": "Договорились"},
        headers={"Authorization": auth_author},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["already_exists"] is False
    assert data["request"]["status"] == "access_granted"
    assert data["grant"]["market_item_id"] == item_id
    assert data["grant"]["user_id"] == requester_id
    assert data["grant"]["granted_by_user_id"] == author_id
    assert data["grant"]["request_id"] == request_id
    assert data["grant"]["note"] == "Договорились"

    db = TestingSessionLocal()
    try:
        grant = db.query(MarketItemAccessGrant).filter(MarketItemAccessGrant.id == data["grant"]["id"]).first()
        assert grant is not None

        req = db.query(MarketAccessRequest).filter(MarketAccessRequest.id == request_id).first()
        assert req.status == MarketAccessRequestStatus.ACCESS_GRANTED

        grant_msg = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.room_id == chat_room_id,
                ChatMessage.message_type == MessageType.SYSTEM,
                ChatMessage.content.like("%выдал доступ%"),
            )
            .first()
        )
        assert grant_msg is not None
        assert grant_msg.sender_id is None
        assert "Платный сценарий" in grant_msg.content
    finally:
        db.close()


def test_non_author_grant_forbidden(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)
    auth_other = register_and_get_token(client)

    db = TestingSessionLocal()
    try:
        item = _create_paid_scenario_item(db, author_id)
        item_id = item.id
    finally:
        db.close()

    req_data = _create_access_request(client, item_id, auth_requester)
    request_id = req_data["request"]["id"]

    res = client.post(
        f"/api/market/access-requests/{request_id}/grant",
        json={},
        headers={"Authorization": auth_other},
    )
    assert res.status_code == 403

    db = TestingSessionLocal()
    try:
        assert db.query(MarketItemAccessGrant).count() == 0
    finally:
        db.close()


def test_grant_idempotency(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)

    db = TestingSessionLocal()
    try:
        item = _create_paid_scenario_item(db, author_id)
        item_id = item.id
    finally:
        db.close()

    req_data = _create_access_request(client, item_id, auth_requester)
    request_id = req_data["request"]["id"]
    chat_room_id = req_data["chat_room_id"]

    first = client.post(
        f"/api/market/access-requests/{request_id}/grant",
        json={},
        headers={"Authorization": auth_author},
    )
    assert first.status_code == 201
    first_grant_id = first.json()["grant"]["id"]

    second = client.post(
        f"/api/market/access-requests/{request_id}/grant",
        json={},
        headers={"Authorization": auth_author},
    )
    assert second.status_code == 200
    second_data = second.json()
    assert second_data["already_exists"] is True
    assert second_data["grant"]["id"] == first_grant_id

    db = TestingSessionLocal()
    try:
        grant_count = (
            db.query(MarketItemAccessGrant)
            .filter(
                MarketItemAccessGrant.market_item_id == item_id,
            )
            .count()
        )
        assert grant_count == 1

        grant_msg_count = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.room_id == chat_room_id,
                ChatMessage.message_type == MessageType.SYSTEM,
                ChatMessage.content.like("%выдал доступ%"),
            )
            .count()
        )
        assert grant_msg_count == 1
    finally:
        db.close()


def test_reject_access_request(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)

    db = TestingSessionLocal()
    try:
        item = _create_paid_scenario_item(db, author_id, title="Отклоняемый сценарий")
        item_id = item.id
    finally:
        db.close()

    req_data = _create_access_request(client, item_id, auth_requester)
    request_id = req_data["request"]["id"]
    chat_room_id = req_data["chat_room_id"]

    res = client.post(
        f"/api/market/access-requests/{request_id}/reject",
        headers={"Authorization": auth_author},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "rejected"

    db = TestingSessionLocal()
    try:
        req = db.query(MarketAccessRequest).filter(MarketAccessRequest.id == request_id).first()
        assert req.status == MarketAccessRequestStatus.REJECTED

        reject_msg = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.room_id == chat_room_id,
                ChatMessage.message_type == MessageType.SYSTEM,
                ChatMessage.content.like("%отклонил заявку%"),
            )
            .first()
        )
        assert reject_msg is not None
        assert "Отклоняемый сценарий" in reject_msg.content
    finally:
        db.close()


def test_grant_rejected_request_conflict(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)

    db = TestingSessionLocal()
    try:
        item = _create_paid_scenario_item(db, author_id)
        item_id = item.id
    finally:
        db.close()

    req_data = _create_access_request(client, item_id, auth_requester)
    request_id = req_data["request"]["id"]

    reject = client.post(
        f"/api/market/access-requests/{request_id}/reject",
        headers={"Authorization": auth_author},
    )
    assert reject.status_code == 200

    grant = client.post(
        f"/api/market/access-requests/{request_id}/grant",
        json={},
        headers={"Authorization": auth_author},
    )
    assert grant.status_code == 409

    db = TestingSessionLocal()
    try:
        assert db.query(MarketItemAccessGrant).count() == 0
    finally:
        db.close()
