"""
Права публикации шаблонов на маркетплейсе (тариф Developer).
"""
from backend.tests.conftest import (
    TestingSessionLocal,
    create_test_bot,
    get_user_id,
    register_and_get_token,
)
from backend.models.market import MarketItem, MarketItemType, ModerationStatus


def _template_payload(source_bot_id: int) -> dict:
    return {
        "item_type": "template",
        "source_bot_id": source_bot_id,
        "title": "Тестовый шаблон",
        "description": "Описание",
        "price": 0,
        "is_published": True,
    }


def test_create_market_template_non_developer_403(client):
    """POST /api/market/items (template) без тарифа Developer — 403."""
    auth = register_and_get_token(client)
    bot_id = create_test_bot(client, auth)

    res = client.post(
        "/api/market/items",
        json=_template_payload(bot_id),
        headers={"Authorization": auth},
    )
    assert res.status_code == 403
    assert "Developer" in res.json()["detail"]


def test_create_market_template_developer_201(client):
    """Developer может создать шаблон на маркете."""
    auth = register_and_get_token(client)
    client.post("/me/plan", json={"plan_code": "developer"}, headers={"Authorization": auth})
    bot_id = create_test_bot(client, auth)

    res = client.post(
        "/api/market/items",
        json=_template_payload(bot_id),
        headers={"Authorization": auth},
    )
    assert res.status_code == 201
    assert res.json()["item_type"] == "template"


def test_publish_market_template_via_put_non_developer_403(client):
    """PUT is_published=true для шаблона без Developer — 403 (обход через API)."""
    auth = register_and_get_token(client)
    user_id = get_user_id(client, auth)

    db = TestingSessionLocal()
    try:
        item = MarketItem(
            item_type=MarketItemType.TEMPLATE,
            title="Черновик",
            seller_id=user_id,
            price=0,
            is_published=False,
            moderation_status=ModerationStatus.DRAFT,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        item_id = item.id
    finally:
        db.close()

    res = client.put(
        f"/api/market/items/{item_id}",
        json={"is_published": True},
        headers={"Authorization": auth},
    )
    assert res.status_code == 403
    assert "Developer" in res.json()["detail"]
