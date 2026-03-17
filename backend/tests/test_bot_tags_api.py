"""
Тесты для API управления тегами
"""
import pytest
from datetime import datetime, timezone

from backend.models.bot import BotInstance
from backend.models.bot_user_state import BotUserState
from backend.models.bot_tag import BotTag


def test_create_tag(client):
    """Тест создания тега через API"""
    from backend.tests.conftest import register_and_get_token, create_test_bot_instance

    auth_header = register_and_get_token(client)
    bot_id = create_test_bot_instance(client, auth_header)
    
    # Создаем тег
    tag_data = {
        "name": "VIP",
        "description": "VIP клиенты",
        "color": "#FFD700"
    }
    
    response = client.post(
        f"/bot-tags/{bot_id}",
        json=tag_data,
        headers={"Authorization": auth_header}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "VIP"
    assert data["description"] == "VIP клиенты"
    assert data["color"] == "#FFD700"
    assert data["bot_id"] == bot_id
    assert "id" in data
    assert "created_at" in data


def test_get_tags(client):
    """Тест получения всех тегов бота"""
    from backend.tests.conftest import register_and_get_token, create_test_bot_instance

    auth_header = register_and_get_token(client)
    bot_id = create_test_bot_instance(client, auth_header)
    
    # Создаем несколько тегов
    tag1_data = {"name": "VIP", "color": "#FFD700"}
    tag2_data = {"name": "Новый клиент", "color": "#3b82f6"}
    
    client.post(f"/bot-tags/{bot_id}", json=tag1_data, headers={"Authorization": auth_header})
    client.post(f"/bot-tags/{bot_id}", json=tag2_data, headers={"Authorization": auth_header})
    
    # Получаем все теги
    response = client.get(
        f"/bot-tags/{bot_id}",
        headers={"Authorization": auth_header}
    )
    
    assert response.status_code == 200
    tags = response.json()
    assert len(tags) == 2
    tag_names = [tag["name"] for tag in tags]
    assert "VIP" in tag_names
    assert "Новый клиент" in tag_names


def test_delete_tag(client):
    """Тест удаления тега"""
    from backend.tests.conftest import register_and_get_token, create_test_bot_instance

    auth_header = register_and_get_token(client)
    bot_id = create_test_bot_instance(client, auth_header)
    
    # Создаем тег
    tag_data = {"name": "Test Tag", "color": "#FF0000"}
    create_response = client.post(
        f"/bot-tags/{bot_id}",
        json=tag_data,
        headers={"Authorization": auth_header}
    )
    tag_id = create_response.json()["id"]
    
    # Удаляем тег
    delete_response = client.delete(
        f"/bot-tags/{tag_id}",
        headers={"Authorization": auth_header}
    )
    
    assert delete_response.status_code == 204
    
    # Проверяем, что тег удален
    get_response = client.get(
        f"/bot-tags/{bot_id}",
        headers={"Authorization": auth_header}
    )
    tags = get_response.json()
    assert len(tags) == 0


def test_assign_tag_to_contact(client):
    """Тест присвоения тега контакту"""
    from backend.tests.conftest import register_and_get_token, create_test_bot_instance

    auth_header = register_and_get_token(client)
    bot_id = create_test_bot_instance(client, auth_header)
    
    # Создаем тег
    tag_data = {"name": "VIP", "color": "#FFD700"}
    tag_response = client.post(
        f"/bot-tags/{bot_id}",
        json=tag_data,
        headers={"Authorization": auth_header}
    )
    tag_id = tag_response.json()["id"]
    
    # Создаем контакт через тестовую сессию
    from backend.tests.conftest import TestingSessionLocal
    db = TestingSessionLocal()
    bot_instance = db.query(BotInstance).filter(BotInstance.id == bot_id).first()
    contact = BotUserState(
        telegram_user_id="123456789",
        bot_id=bot_instance.id,
        channel="telegram",
        status="active",
        last_interaction_at=datetime.now(timezone.utc)
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    contact_id = contact.id
    db.close()
    
    # Присваиваем тег
    assign_data = {
        "contact_id": contact_id,
        "tag_id": tag_id
    }
    assign_response = client.post(
        "/bot-tags/assign",
        json=assign_data,
        headers={"Authorization": auth_header}
    )
    
    assert assign_response.status_code == 204

    # Проверяем через БД, что тег присвоен
    db = TestingSessionLocal()
    contact = db.query(BotUserState).filter(BotUserState.id == contact_id).first()
    assert len(contact.tags) == 1
    assert contact.tags[0].id == tag_id
    db.close()


def test_unassign_tag_from_contact(client):
    """Тест удаления тега у контакта"""
    from backend.tests.conftest import register_and_get_token, create_test_bot_instance

    auth_header = register_and_get_token(client)
    bot_id = create_test_bot_instance(client, auth_header)
    
    # Создаем тег и контакт
    tag_data = {"name": "VIP", "color": "#FFD700"}
    tag_response = client.post(
        f"/bot-tags/{bot_id}",
        json=tag_data,
        headers={"Authorization": auth_header}
    )
    tag_id = tag_response.json()["id"]
    
    from backend.tests.conftest import TestingSessionLocal
    db = TestingSessionLocal()
    bot_instance = db.query(BotInstance).filter(BotInstance.id == bot_id).first()
    contact = BotUserState(
        telegram_user_id="123456789",
        bot_id=bot_instance.id,
        channel="telegram",
        status="active",
        last_interaction_at=datetime.now(timezone.utc)
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    contact_id = contact.id

    # Присваиваем тег
    contact.tags.append(db.query(BotTag).filter(BotTag.id == tag_id).first())
    db.commit()
    db.close()
    
    # Удаляем тег (DELETE с телом через request)
    unassign_data = {
        "contact_id": contact_id,
        "tag_id": tag_id
    }
    unassign_response = client.request(
        "DELETE",
        "/bot-tags/unassign",
        json=unassign_data,
        headers={"Authorization": auth_header}
    )
    
    assert unassign_response.status_code == 204
    
    # Проверяем, что тег удален
    db = TestingSessionLocal()
    contact = db.query(BotUserState).filter(BotUserState.id == contact_id).first()
    assert len(contact.tags) == 0
    db.close()

