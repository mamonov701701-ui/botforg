"""
Тесты кабинета разработчика (GET /api/market/my-templates).
"""
from backend.tests.conftest import register_and_get_token, get_user_id, TestingSessionLocal


def test_my_templates_developer_ok(client):
    """Developer может получить список своих шаблонов."""
    from backend.models.market import MarketItem, MarketItemType

    auth = register_and_get_token(client)
    # Меняем тариф на developer
    client.post("/me/plan", json={"plan_code": "developer"}, headers={"Authorization": auth})
    user_id = get_user_id(client, auth)

    # Создаём шаблон от имени пользователя
    db = TestingSessionLocal()
    try:
        item = MarketItem(
            item_type=MarketItemType.TEMPLATE,
            title="Мой шаблон",
            seller_id=user_id,
            price=0,
            is_published=True,
            sales_count=5,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        item_id = item.id
    finally:
        db.close()

    res = client.get("/api/market/my-templates", headers={"Authorization": auth})
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    t = next((x for x in data if x["id"] == item_id), None)
    assert t is not None
    assert t["name"] == "Мой шаблон"
    assert t["status"] == "published"
    assert t["installs_count"] == 5
    assert t["views_count"] == 0
    assert "created_at" in t


def test_my_templates_non_developer_403(client):
    """Пользователь без тарифа Developer получает 403."""
    auth = register_and_get_token(client)
    # План по умолчанию — free
    res = client.get("/api/market/my-templates", headers={"Authorization": auth})
    assert res.status_code == 403
    assert "Developer" in (res.json().get("detail") or "")


def test_my_templates_requires_auth(client):
    """my-templates требует авторизации."""
    res = client.get("/api/market/my-templates")
    assert res.status_code == 401
