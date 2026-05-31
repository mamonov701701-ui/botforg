"""
Тесты моделей marketplace access request / manual access grant.
"""
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from backend.models.chat import ChatRoom, ChatRoomType
from backend.models.market import MarketItem, MarketItemType
from backend.models.market_access import (
    MarketAccessRequest,
    MarketAccessRequestStatus,
    MarketItemAccessGrant,
)
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


def _create_market_item(db, seller_id: int) -> MarketItem:
    item = MarketItem(
        item_type=MarketItemType.SCENARIO,
        title="Платный сценарий",
        seller_id=seller_id,
        price=Decimal("500.00"),
        is_published=True,
    )
    db.add(item)
    db.flush()
    return item


def test_create_market_access_request(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)
    requester_id = get_user_id(client, auth_requester)

    db = TestingSessionLocal()
    try:
        item = _create_market_item(db, author_id)
        room = ChatRoom(room_type=ChatRoomType.PRIVATE, created_by_id=requester_id)
        db.add(room)
        db.flush()

        request = MarketAccessRequest(
            market_item_id=item.id,
            requester_user_id=requester_id,
            author_user_id=author_id,
            chat_room_id=room.id,
            status=MarketAccessRequestStatus.NEW,
            message="Хочу получить доступ",
        )
        db.add(request)
        db.commit()
        db.refresh(request)

        assert request.id is not None
        assert request.status == MarketAccessRequestStatus.NEW
        assert request.market_item.id == item.id
        assert request.requester.id == requester_id
        assert request.author.id == author_id
        assert request.chat_room.id == room.id
    finally:
        db.close()


def test_create_market_item_access_grant(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)
    requester_id = get_user_id(client, auth_requester)

    db = TestingSessionLocal()
    try:
        item = _create_market_item(db, author_id)

        request = MarketAccessRequest(
            market_item_id=item.id,
            requester_user_id=requester_id,
            author_user_id=author_id,
            status=MarketAccessRequestStatus.IN_DISCUSSION,
        )
        db.add(request)
        db.flush()

        grant = MarketItemAccessGrant(
            market_item_id=item.id,
            user_id=requester_id,
            granted_by_user_id=author_id,
            request_id=request.id,
            note="Доступ выдан после договорённости",
        )
        db.add(grant)
        db.commit()
        db.refresh(grant)

        assert grant.id is not None
        assert grant.market_item.id == item.id
        assert grant.user.id == requester_id
        assert grant.granted_by.id == author_id
        assert grant.request.id == request.id
    finally:
        db.close()


def test_market_item_access_grant_unique_per_user(client):
    auth_author = register_and_get_token(client)
    author_id = get_user_id(client, auth_author)
    auth_requester = register_and_get_token(client)
    requester_id = get_user_id(client, auth_requester)

    db = TestingSessionLocal()
    try:
        item = _create_market_item(db, author_id)

        db.add(
            MarketItemAccessGrant(
                market_item_id=item.id,
                user_id=requester_id,
                granted_by_user_id=author_id,
            )
        )
        db.commit()

        db.add(
            MarketItemAccessGrant(
                market_item_id=item.id,
                user_id=requester_id,
                granted_by_user_id=author_id,
                note="duplicate",
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
    finally:
        db.close()
