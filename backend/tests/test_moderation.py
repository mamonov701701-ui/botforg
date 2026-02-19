"""
Тесты модерации шаблонов маркетплейса.
"""
from backend.tests.conftest import register_and_get_token, get_user_id, TestingSessionLocal
from backend.models.market import MarketItem, MarketItemType, ModerationStatus


def test_submit_template_developer_ok(client):
    """Developer может отправить шаблон на модерацию."""
    auth = register_and_get_token(client)
    client.post("/me/plan", json={"plan_code": "developer"}, headers={"Authorization": auth})
    user_id = get_user_id(client, auth)

    db = TestingSessionLocal()
    try:
        item = MarketItem(
            item_type=MarketItemType.TEMPLATE,
            title="Тест шаблон",
            seller_id=user_id,
            price=0,
            is_published=False,
            moderation_status=ModerationStatus.DRAFT,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        tid = item.id
    finally:
        db.close()

    res = client.post(
        f"/api/market/templates/{tid}/submit",
        headers={"Authorization": auth},
    )
    assert res.status_code == 200
    assert res.json()["moderation_status"] == "pending"


def test_submit_template_non_developer_403(client):
    """Пользователь без Developer не может отправить на модерацию."""
    auth = register_and_get_token(client)
    user_id = get_user_id(client, auth)

    db = TestingSessionLocal()
    try:
        item = MarketItem(
            item_type=MarketItemType.TEMPLATE,
            title="Тест",
            seller_id=user_id,
            price=0,
            moderation_status=ModerationStatus.DRAFT,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        tid = item.id
    finally:
        db.close()

    res = client.post(
        f"/api/market/templates/{tid}/submit",
        headers={"Authorization": auth},
    )
    assert res.status_code == 403


def test_admin_approve(client):
    """Администратор (owner) может одобрить шаблон."""
    from backend.models.user import User

    auth = register_and_get_token(client)
    client.post("/me/plan", json={"plan_code": "developer"}, headers={"Authorization": auth})
    user_id = get_user_id(client, auth)

    db = TestingSessionLocal()
    try:
        item = MarketItem(
            item_type=MarketItemType.TEMPLATE,
            title="На модерации",
            seller_id=user_id,
            price=0,
            moderation_status=ModerationStatus.PENDING,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        tid = item.id
        user = db.query(User).filter(User.id == user_id).first()
        user.role = "owner"
        db.commit()
    finally:
        db.close()

    res = client.post(
        f"/api/admin/market/templates/{tid}/approve",
        headers={"Authorization": auth},
    )
    assert res.status_code == 200
    assert res.json()["moderation_status"] == "approved"


def test_admin_reject(client):
    """Администратор может отклонить шаблон с причиной."""
    from backend.models.user import User

    auth = register_and_get_token(client)
    client.post("/me/plan", json={"plan_code": "developer"}, headers={"Authorization": auth})
    user_id = get_user_id(client, auth)

    db = TestingSessionLocal()
    try:
        item = MarketItem(
            item_type=MarketItemType.TEMPLATE,
            title="На модерации 2",
            seller_id=user_id,
            price=0,
            moderation_status=ModerationStatus.PENDING,
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        tid = item.id
        user = db.query(User).filter(User.id == user_id).first()
        user.role = "owner"
        db.commit()
    finally:
        db.close()

    res = client.post(
        f"/api/admin/market/templates/{tid}/reject",
        json={"reason": "Недостаточно описания"},
        headers={"Authorization": auth},
    )
    assert res.status_code == 200
    assert res.json()["moderation_status"] == "rejected"


def test_public_market_only_approved(client):
    """В публичном маркете видны только approved шаблоны."""
    auth = register_and_get_token(client)
    client.post("/me/plan", json={"plan_code": "developer"}, headers={"Authorization": auth})
    user_id = get_user_id(client, auth)

    db = TestingSessionLocal()
    try:
        approved = MarketItem(
            item_type=MarketItemType.TEMPLATE,
            title="Одобренный",
            seller_id=user_id,
            price=0,
            is_published=True,
            moderation_status=ModerationStatus.APPROVED,
        )
        pending = MarketItem(
            item_type=MarketItemType.TEMPLATE,
            title="На модерации",
            seller_id=user_id,
            price=0,
            is_published=True,
            moderation_status=ModerationStatus.PENDING,
        )
        db.add(approved)
        db.add(pending)
        db.commit()
    finally:
        db.close()

    res = client.get("/api/market/items?item_type=template&is_published=true")
    assert res.status_code == 200
    items = res.json().get("items", [])
    titles = [t["title"] for t in items]
    assert "Одобренный" in titles
    assert "На модерации" not in titles
