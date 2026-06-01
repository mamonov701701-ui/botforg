"""
Тесты POST /api/market/items/{id}/access-requests
"""
from decimal import Decimal

from backend.models.chat import ChatMessage, ChatParticipant, ChatRoom, ChatRoomType, MessageType
from backend.models.market import MarketItem, MarketItemType
from backend.models.market_access import MarketAccessRequest, MarketAccessRequestStatus
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


def _create_paid_item(
    db,
    seller_id: int,
    *,
    published: bool = True,
    price=Decimal("500.00"),
    title: str = "Платный сценарий",
) -> MarketItem:
    item = MarketItem(
        item_type=MarketItemType.SCENARIO,
        title=title,
        seller_id=seller_id,
        price=price,
        is_published=published,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def test_create_access_request_for_paid_item(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)
    requester_id = get_user_id(client, auth_requester)

    db = TestingSessionLocal()
    try:
        item = _create_paid_item(db, author_id)
        item_id = item.id
    finally:
        db.close()

    res = client.post(
        f"/api/market/items/{item_id}/access-requests",
        json={"message": "Хочу доступ"},
        headers={"Authorization": auth_requester},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["already_exists"] is False
    assert data["chat_room_id"] is not None
    assert data["request"]["market_item_id"] == item_id
    assert data["request"]["requester_user_id"] == requester_id
    assert data["request"]["author_user_id"] == author_id
    assert data["request"]["status"] == "new"
    assert data["request"]["message"] == "Хочу доступ"

    db = TestingSessionLocal()
    try:
        req = db.query(MarketAccessRequest).filter(MarketAccessRequest.id == data["request"]["id"]).first()
        assert req is not None
        assert req.chat_room_id == data["chat_room_id"]

        room = db.query(ChatRoom).filter(ChatRoom.id == req.chat_room_id).first()
        assert room is not None
        assert room.room_type == ChatRoomType.PRIVATE

        participant_ids = {
            p.user_id
            for p in db.query(ChatParticipant).filter(ChatParticipant.room_id == room.id).all()
        }
        assert participant_ids == {requester_id, author_id}

        system_msg = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.room_id == room.id,
                ChatMessage.message_type == MessageType.SYSTEM,
            )
            .first()
        )
        assert system_msg is not None
        assert system_msg.sender_id is None
        assert "Платный сценарий" in system_msg.content
        assert "BotForg" in system_msg.content
    finally:
        db.close()


def test_duplicate_active_access_request(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)

    db = TestingSessionLocal()
    try:
        item = _create_paid_item(db, author_id)
        item_id = item.id
    finally:
        db.close()

    headers = {"Authorization": auth_requester}
    first = client.post(f"/api/market/items/{item_id}/access-requests", json={}, headers=headers)
    assert first.status_code == 201
    first_id = first.json()["request"]["id"]

    second = client.post(f"/api/market/items/{item_id}/access-requests", json={}, headers=headers)
    assert second.status_code == 200
    second_data = second.json()
    assert second_data["already_exists"] is True
    assert second_data["request"]["id"] == first_id

    db = TestingSessionLocal()
    try:
        count = (
            db.query(MarketAccessRequest)
            .filter(
                MarketAccessRequest.market_item_id == item_id,
                MarketAccessRequest.status.in_(
                    [MarketAccessRequestStatus.NEW, MarketAccessRequestStatus.IN_DISCUSSION]
                ),
            )
            .count()
        )
        assert count == 1

        system_count = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.room_id == second_data["chat_room_id"],
                ChatMessage.message_type == MessageType.SYSTEM,
            )
            .count()
        )
        assert system_count == 1
    finally:
        db.close()


def test_access_request_free_item_400(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)

    db = TestingSessionLocal()
    try:
        item = _create_paid_item(db, author_id, price=Decimal("0"))
        item_id = item.id
    finally:
        db.close()

    res = client.post(
        f"/api/market/items/{item_id}/access-requests",
        json={},
        headers={"Authorization": auth_requester},
    )
    assert res.status_code == 400


def test_access_request_own_item_400(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)

    db = TestingSessionLocal()
    try:
        item = _create_paid_item(db, author_id)
        item_id = item.id
    finally:
        db.close()

    res = client.post(
        f"/api/market/items/{item_id}/access-requests",
        json={},
        headers={"Authorization": auth_author},
    )
    assert res.status_code == 400


def test_access_request_unpublished_item_403(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)

    db = TestingSessionLocal()
    try:
        item = _create_paid_item(db, author_id, published=False)
        item_id = item.id
    finally:
        db.close()

    res = client.post(
        f"/api/market/items/{item_id}/access-requests",
        json={},
        headers={"Authorization": auth_requester},
    )
    assert res.status_code == 403


def test_list_access_requests_author(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)
    auth_other = register_and_get_token(client)

    db = TestingSessionLocal()
    try:
        item = _create_paid_item(db, author_id, title="Товар автора")
        item_id = item.id
        _create_paid_item(db, get_user_id(client, auth_other), title="Чужой товар")
    finally:
        db.close()

    client.post(
        f"/api/market/items/{item_id}/access-requests",
        json={},
        headers={"Authorization": auth_requester},
    )

    res = client.get(
        "/api/market/access-requests?role=author",
        headers={"Authorization": auth_author},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    assert len(data["items"]) >= 1
    row = data["items"][0]
    assert row["market_item"]["title"] == "Товар автора"
    assert row["author"]["id"] == author_id
    assert row["chat_room_id"] is not None

    res_other = client.get(
        "/api/market/access-requests?role=author",
        headers={"Authorization": auth_other},
    )
    assert res_other.status_code == 200
    other_item_ids = [i["market_item"]["id"] for i in res_other.json()["items"]]
    assert item_id not in other_item_ids


def test_list_access_requests_requester(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)
    requester_id = get_user_id(client, auth_requester)

    db = TestingSessionLocal()
    try:
        item = _create_paid_item(db, author_id)
        item_id = item.id
    finally:
        db.close()

    client.post(
        f"/api/market/items/{item_id}/access-requests",
        json={"message": "Моя заявка"},
        headers={"Authorization": auth_requester},
    )

    res = client.get(
        "/api/market/access-requests?role=requester",
        headers={"Authorization": auth_requester},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 1
    assert any(i["request"]["requester_user_id"] == requester_id for i in data["items"])


def test_list_access_requests_filter_status(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)

    db = TestingSessionLocal()
    try:
        item = _create_paid_item(db, author_id)
        item_id = item.id
    finally:
        db.close()

    created = client.post(
        f"/api/market/items/{item_id}/access-requests",
        json={},
        headers={"Authorization": auth_requester},
    )
    request_id = created.json()["request"]["id"]

    client.post(
        f"/api/market/access-requests/{request_id}/reject",
        headers={"Authorization": auth_author},
    )

    res_new = client.get(
        "/api/market/access-requests?role=requester&status=new",
        headers={"Authorization": auth_requester},
    )
    assert res_new.status_code == 200
    assert res_new.json()["total"] == 0

    res_rejected = client.get(
        "/api/market/access-requests?role=requester&status=rejected",
        headers={"Authorization": auth_requester},
    )
    assert res_rejected.status_code == 200
    assert res_rejected.json()["total"] >= 1
    assert all(i["request"]["status"] == "rejected" for i in res_rejected.json()["items"])
