"""
Тесты для BotUserState и связанной функциональности
"""
import pytest
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from backend.models.bot import BotInstance
from backend.models.bot_user_state import BotUserState
from backend.models.bot_tag import BotTag, bot_contact_tags
from backend.models.template import Template


def test_bot_user_state_creation(client):
    """Тест создания BotUserState с новыми полями"""
    from backend.tests.conftest import register_and_get_token, create_test_bot_instance, TestingSessionLocal

    auth_header = register_and_get_token(client)
    bot_id = create_test_bot_instance(client, auth_header)

    db = TestingSessionLocal()
    try:
        bot_instance = db.query(BotInstance).filter(BotInstance.id == bot_id).first()
        assert bot_instance is not None

        state = BotUserState(
            telegram_user_id="123456789",
            bot_id=bot_id,
            channel="telegram",
            status="active",
            name="Test User",
            email="test@example.com",
            phone="+79991234567",
            entry_point="promo1",
            utm_source="google",
            utm_campaign="summer2025",
            last_interaction_at=datetime.now(timezone.utc)
        )
        db.add(state)
        db.commit()
        db.refresh(state)

        # Проверяем, что все поля сохранены
        assert state.id is not None
        assert state.public_id is not None
        assert state.telegram_user_id == "123456789"
        assert state.bot_id == bot_instance.id
        assert state.channel == "telegram"
        assert state.status == "active"
        assert state.name == "Test User"
        assert state.email == "test@example.com"
        assert state.phone == "+79991234567"
        assert state.entry_point == "promo1"
        assert state.utm_source == "google"
        assert state.utm_campaign == "summer2025"
        assert state.last_interaction_at is not None
        assert state.created_at is not None
        assert state.updated_at is not None
    finally:
        db.close()


def test_bot_user_state_statuses(client):
    """Тест различных статусов BotUserState"""
    from backend.tests.conftest import register_and_get_token, create_test_bot_instance, TestingSessionLocal

    auth_header = register_and_get_token(client)
    bot_id = create_test_bot_instance(client, auth_header)

    db = TestingSessionLocal()
    try:
        bot_instance = db.query(BotInstance).filter(BotInstance.id == bot_id).first()

        # Создаем состояния с разными статусами
        statuses = ["active", "unsubscribed", "banned", "inactive"]
        states = []

        for i, status in enumerate(statuses):
            state = BotUserState(
                telegram_user_id=f"12345678{i}",
                bot_id=bot_instance.id,
                channel="telegram",
                status=status,
                last_interaction_at=datetime.now(timezone.utc)
            )
            db.add(state)
            states.append(state)

        db.commit()

        # Проверяем, что все статусы сохранены
        for state in states:
            db.refresh(state)
            assert state.status in statuses

        # Проверяем фильтрацию по статусу
        active_states = db.query(BotUserState).filter(BotUserState.status == "active").all()
        assert len(active_states) == 1
        assert active_states[0].status == "active"
    finally:
        db.close()


def test_bot_tags_creation(client):
    """Тест создания тегов для бота"""
    from backend.tests.conftest import register_and_get_token, create_test_bot_instance, TestingSessionLocal

    auth_header = register_and_get_token(client)
    bot_id = create_test_bot_instance(client, auth_header)

    db = TestingSessionLocal()
    try:
        bot_instance = db.query(BotInstance).filter(BotInstance.id == bot_id).first()

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
            description="Новые подписчики",
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
    finally:
        db.close()


def test_bot_tags_assignment(client):
    """Тест присвоения тегов контактам"""
    from backend.tests.conftest import register_and_get_token, create_test_bot_instance, TestingSessionLocal

    auth_header = register_and_get_token(client)
    bot_id = create_test_bot_instance(client, auth_header)

    db = TestingSessionLocal()
    try:
        bot_instance = db.query(BotInstance).filter(BotInstance.id == bot_id).first()

        # Создаем тег
        tag = BotTag(
            bot_id=bot_instance.id,
            name="VIP",
            color="#FFD700"
        )
        db.add(tag)
        db.commit()
        db.refresh(tag)

        # Создаем контакт
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

        # Присваиваем тег
        contact.tags.append(tag)
        db.commit()

        # Проверяем связь
        db.refresh(contact)
        assert len(contact.tags) == 1
        assert contact.tags[0].id == tag.id
        assert contact.tags[0].name == "VIP"

        # Проверяем обратную связь
        db.refresh(tag)
        assert len(tag.contacts) == 1
        assert tag.contacts[0].id == contact.id
    finally:
        db.close()


def test_bot_user_state_search_by_email_phone(client):
    """Тест поиска контактов по email и phone"""
    from backend.tests.conftest import register_and_get_token, create_test_bot_instance, TestingSessionLocal

    auth_header = register_and_get_token(client)
    bot_id = create_test_bot_instance(client, auth_header)

    db = TestingSessionLocal()
    try:
        bot_instance = db.query(BotInstance).filter(BotInstance.id == bot_id).first()

        # Создаем контакты с email и phone
        contact1 = BotUserState(
            telegram_user_id="111111111",
            bot_id=bot_instance.id,
            channel="telegram",
            status="active",
            email="user1@example.com",
            phone="+79991111111",
            last_interaction_at=datetime.now(timezone.utc)
        )
        contact2 = BotUserState(
            telegram_user_id="222222222",
            bot_id=bot_instance.id,
            channel="telegram",
            status="active",
            email="user2@example.com",
            phone="+79992222222",
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
    finally:
        db.close()


def test_bot_user_state_utm_tracking(client):
    """Тест отслеживания UTM-меток"""
    from backend.tests.conftest import register_and_get_token, create_test_bot_instance, TestingSessionLocal

    auth_header = register_and_get_token(client)
    bot_id = create_test_bot_instance(client, auth_header)

    db = TestingSessionLocal()
    try:
        bot_instance = db.query(BotInstance).filter(BotInstance.id == bot_id).first()

        # Создаем контакты с разными UTM-метками
        contact1 = BotUserState(
            telegram_user_id="111111111",
            bot_id=bot_instance.id,
            channel="telegram",
            status="active",
            entry_point="promo1",
            utm_source="google",
            utm_campaign="summer2025",
            last_interaction_at=datetime.now(timezone.utc)
        )
        contact2 = BotUserState(
            telegram_user_id="222222222",
            bot_id=bot_instance.id,
            channel="telegram",
            status="active",
            entry_point="ref_link",
            utm_source="vk",
            utm_campaign="winter2025",
            last_interaction_at=datetime.now(timezone.utc)
        )
        db.add(contact1)
        db.add(contact2)
        db.commit()

        # Фильтрация по utm_source
        google_contacts = db.query(BotUserState).filter(
            BotUserState.utm_source == "google"
        ).all()
        assert len(google_contacts) == 1
        assert google_contacts[0].utm_campaign == "summer2025"

        # Фильтрация по utm_campaign
        summer_contacts = db.query(BotUserState).filter(
            BotUserState.utm_campaign == "summer2025"
        ).all()
        assert len(summer_contacts) == 1

        # Фильтрация по entry_point
        promo_contacts = db.query(BotUserState).filter(
            BotUserState.entry_point == "promo1"
        ).all()
        assert len(promo_contacts) == 1
    finally:
        db.close()


def test_bot_user_state_last_interaction(client):
    """Тест обновления last_interaction_at"""
    import time
    from datetime import timedelta

    from backend.tests.conftest import register_and_get_token, create_test_bot_instance, TestingSessionLocal

    auth_header = register_and_get_token(client)
    bot_id = create_test_bot_instance(client, auth_header)

    db = TestingSessionLocal()
    try:
        bot_instance = db.query(BotInstance).filter(BotInstance.id == bot_id).first()

        # Создаем контакт
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

        first_interaction = contact.last_interaction_at

        # Обновляем last_interaction_at
        time.sleep(0.1)  # Небольшая задержка для проверки времени
        contact.last_interaction_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(contact)

        # Проверяем, что время обновилось
        assert contact.last_interaction_at > first_interaction

        # Проверяем фильтрацию по активности
        cutoff_time = datetime.now(timezone.utc) - timedelta(days=30)
        active_contacts = db.query(BotUserState).filter(
            BotUserState.last_interaction_at > cutoff_time
        ).all()
        assert len(active_contacts) >= 1
    finally:
        db.close()

