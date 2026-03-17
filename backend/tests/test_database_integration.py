"""
Интеграционные тесты для проверки работоспособности базы данных

TODO: Вернуть тесты после обновления под текущую модель (Template.category NOT NULL,
BotInstance, draft/published). См. XFAIL_TESTS_REPORT.md.
"""
import pytest
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.user import User
from backend.models.bot import Bot, BotInstance
from backend.models.bot_user_state import BotUserState
from backend.models.bot_tag import BotTag, bot_contact_tags
from backend.models.template import Template


def test_database_connection(client):
    """Тест подключения к БД"""
    db = next(get_db())
    assert db is not None
    db.close()


@pytest.mark.xfail(reason="Устаревшее поведение после внедрения draft/published: Template.category NOT NULL, требуется обновить фикстуры")
def test_bot_user_state_model_creation():
    """Тест создания BotUserState с новыми полями"""
    db = next(get_db())
    
    try:
        # Создаем пользователя
        from backend.auth.password import hash_password
        user = User(
            email="test@example.com",
            name="Test User",
            role="user",
            hashed_password=hash_password("TestPassword123!")
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # Создаем бота
        bot = Bot(
            owner_id=user.id,
            title="Test Bot",
            username="test_bot",
            token="123456:ABC-DEF"
        )
        db.add(bot)
        db.commit()
        db.refresh(bot)
        
        # Создаем шаблон
        template = Template(
            name="Test Template",
            user_id=user.id,
            content={"nodes": [], "edges": []}
        )
        db.add(template)
        db.commit()
        db.refresh(template)
        
        # Создаем BotInstance
        bot_instance = BotInstance(
            user_id=user.id,
            token="123456:ABC-DEF",
            username="test_bot",
            template_id=template.id
        )
        db.add(bot_instance)
        db.commit()
        db.refresh(bot_instance)
        
        # Создаем BotUserState с новыми полями
        state = BotUserState(
            telegram_user_id="123456789",
            bot_id=bot_instance.id,
            channel="telegram",
            status="active",
            name="Telegram User",
            email="telegram@example.com",
            phone="+79991234567",
            entry_point="promo1",
            utm_source="google",
            utm_campaign="summer2025",
            last_interaction_at=datetime.now(timezone.utc)
        )
        db.add(state)
        db.commit()
        db.refresh(state)
        
        # Проверяем все поля
        assert state.id is not None
        assert state.public_id is not None
        assert state.telegram_user_id == "123456789"
        assert state.bot_id == bot_instance.id
        assert state.channel == "telegram"
        assert state.status == "active"
        assert state.name == "Telegram User"
        assert state.email == "telegram@example.com"
        assert state.phone == "+79991234567"
        assert state.entry_point == "promo1"
        assert state.utm_source == "google"
        assert state.utm_campaign == "summer2025"
        assert state.last_interaction_at is not None
        assert state.created_at is not None
        
        print(f"✅ BotUserState создан успешно: id={state.id}, public_id={state.public_id}")
        
    finally:
        db.close()


@pytest.mark.xfail(reason="Устаревшее поведение после внедрения draft/published: Template.category NOT NULL, требуется обновить фикстуры")
def test_bot_tags_model_creation():
    """Тест создания BotTag"""
    db = next(get_db())
    
    try:
        # Создаем пользователя, бота, шаблон и BotInstance
        from backend.auth.password import hash_password
        user = User(email="test2@example.com", name="Test User 2", role="user", hashed_password=hash_password("TestPassword123!"))
        db.add(user)
        db.commit()
        db.refresh(user)
        
        bot = Bot(owner_id=user.id, title="Test Bot 2", username="test_bot_2", token="123456:ABC-DEF")
        db.add(bot)
        db.commit()
        db.refresh(bot)
        
        template = Template(name="Test Template 2", user_id=user.id, content={"nodes": [], "edges": []})
        db.add(template)
        db.commit()
        db.refresh(template)
        
        bot_instance = BotInstance(user_id=user.id, token="123456:ABC-DEF", username="test_bot_2", template_id=template.id)
        db.add(bot_instance)
        db.commit()
        db.refresh(bot_instance)
        
        # Создаем теги
        tag1 = BotTag(
            bot_id=bot_instance.id,
            name="VIP",
            description="VIP клиенты",
            color="#FFD700"
        )
        tag2 = BotTag(
            bot_id=bot_instance.id,
            name="Новый клиент",
            color="#3b82f6"
        )
        db.add(tag1)
        db.add(tag2)
        db.commit()
        db.refresh(tag1)
        db.refresh(tag2)
        
        # Проверяем создание
        assert tag1.id is not None
        assert tag1.bot_id == bot_instance.id
        assert tag1.name == "VIP"
        assert tag1.color == "#FFD700"
        
        assert tag2.id is not None
        assert tag2.name == "Новый клиент"
        
        # Проверяем получение всех тегов бота
        all_tags = db.query(BotTag).filter(BotTag.bot_id == bot_instance.id).all()
        assert len(all_tags) == 2
        
        print(f"✅ BotTag созданы успешно: {len(all_tags)} тегов")
        
    finally:
        db.close()


@pytest.mark.xfail(reason="Устаревшее поведение после внедрения draft/published: Template.category NOT NULL, требуется обновить фикстуры")
def test_bot_tags_assignment():
    """Тест присвоения тегов контактам"""
    db = next(get_db())
    
    try:
        # Создаем необходимые объекты
        from backend.auth.password import hash_password
        user = User(email="test3@example.com", name="Test User 3", role="user", hashed_password=hash_password("TestPassword123!"))
        db.add(user)
        db.commit()
        db.refresh(user)
        
        bot = Bot(owner_id=user.id, title="Test Bot 3", username="test_bot_3", token="123456:ABC-DEF")
        db.add(bot)
        db.commit()
        db.refresh(bot)
        
        template = Template(name="Test Template 3", user_id=user.id, content={"nodes": [], "edges": []})
        db.add(template)
        db.commit()
        db.refresh(template)
        
        bot_instance = BotInstance(user_id=user.id, token="123456:ABC-DEF", username="test_bot_3", template_id=template.id)
        db.add(bot_instance)
        db.commit()
        db.refresh(bot_instance)
        
        # Создаем тег
        tag = BotTag(bot_id=bot_instance.id, name="VIP", color="#FFD700")
        db.add(tag)
        db.commit()
        db.refresh(tag)
        
        # Создаем контакт
        contact = BotUserState(
            telegram_user_id="987654321",
            bot_id=bot_instance.id,
            channel="telegram",
            status="active",
            last_interaction_at=datetime.now(timezone.utc)
        )
        db.add(contact)
        db.commit()
        db.refresh(contact)
        
        # Присваиваем тег
        contact.tags.append(tag)
        db.commit()
        db.refresh(contact)
        
        # Проверяем связь
        assert len(contact.tags) == 1
        assert contact.tags[0].id == tag.id
        assert contact.tags[0].name == "VIP"
        
        # Проверяем обратную связь
        db.refresh(tag)
        assert len(tag.contacts) == 1
        assert tag.contacts[0].id == contact.id
        
        print(f"✅ Тег присвоен контакту успешно")
        
    finally:
        db.close()


@pytest.mark.xfail(reason="Устаревшее поведение после внедрения draft/published: Template.category NOT NULL, требуется обновить фикстуры")
def test_bot_user_state_search():
    """Тест поиска контактов по новым полям"""
    db = next(get_db())
    
    try:
        # Создаем необходимые объекты
        from backend.auth.password import hash_password
        user = User(email="test4@example.com", name="Test User 4", role="user", hashed_password=hash_password("TestPassword123!"))
        db.add(user)
        db.commit()
        db.refresh(user)
        
        bot = Bot(owner_id=user.id, title="Test Bot 4", username="test_bot_4", token="123456:ABC-DEF")
        db.add(bot)
        db.commit()
        db.refresh(bot)
        
        template = Template(name="Test Template 4", user_id=user.id, content={"nodes": [], "edges": []})
        db.add(template)
        db.commit()
        db.refresh(template)
        
        bot_instance = BotInstance(user_id=user.id, token="123456:ABC-DEF", username="test_bot_4", template_id=template.id)
        db.add(bot_instance)
        db.commit()
        db.refresh(bot_instance)
        
        # Создаем контакты с разными данными
        contact1 = BotUserState(
            telegram_user_id="111111111",
            bot_id=bot_instance.id,
            channel="telegram",
            status="active",
            email="user1@example.com",
            phone="+79991111111",
            utm_source="google",
            last_interaction_at=datetime.now(timezone.utc)
        )
        contact2 = BotUserState(
            telegram_user_id="222222222",
            bot_id=bot_instance.id,
            channel="telegram",
            status="active",
            email="user2@example.com",
            phone="+79992222222",
            utm_source="vk",
            last_interaction_at=datetime.now(timezone.utc)
        )
        db.add(contact1)
        db.add(contact2)
        db.commit()
        
        # Поиск по email
        found_by_email = db.query(BotUserState).filter(
            BotUserState.email == "user1@example.com"
        ).first()
        assert found_by_email is not None
        assert found_by_email.telegram_user_id == "111111111"
        
        # Поиск по phone
        found_by_phone = db.query(BotUserState).filter(
            BotUserState.phone == "+79992222222"
        ).first()
        assert found_by_phone is not None
        assert found_by_phone.email == "user2@example.com"
        
        # Поиск по utm_source
        google_contacts = db.query(BotUserState).filter(
            BotUserState.utm_source == "google"
        ).all()
        assert len(google_contacts) == 1
        assert google_contacts[0].email == "user1@example.com"
        
        # Поиск по status
        active_contacts = db.query(BotUserState).filter(
            BotUserState.status == "active"
        ).all()
        assert len(active_contacts) == 2
        
        print(f"✅ Поиск контактов работает: найдено {len(active_contacts)} активных контактов")
        
    finally:
        db.close()

