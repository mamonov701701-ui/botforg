"""
Скрипт для проверки работоспособности базы данных
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timezone
from sqlalchemy.orm import Session
from backend.database import get_db, engine
from backend.models.user import User
from backend.models.bot import Bot, BotInstance
from backend.models.bot_user_state import BotUserState
from backend.models.bot_tag import BotTag
from backend.models.template import Template


def test_database():
    """Проверка работоспособности БД"""
    print("=" * 60)
    print("ТЕСТИРОВАНИЕ БАЗЫ ДАННЫХ")
    print("=" * 60)
    
    db = next(get_db())
    
    try:
        # 1. Проверка создания BotUserState с новыми полями
        print("\n1. Тест создания BotUserState с новыми полями...")
        
        # Получаем или создаем пользователя
        user = db.query(User).first()
        if not user:
            print("   ⚠ Пользователь не найден, создаем тестового...")
            user = User(
                email="test_db@example.com",
                name="Test DB User",
                role="user",
                hashed_password="dummy_hash_for_test"
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"   ✓ Пользователь создан: id={user.id}")
        else:
            print(f"   ✓ Используем существующего пользователя: id={user.id}")
        
        # Получаем или создаем бота
        bot = db.query(Bot).filter(Bot.owner_id == user.id).first()
        if not bot:
            print("   ⚠ Бот не найден, создаем тестового...")
            bot = Bot(
                owner_id=user.id,
                title="Test Bot",
                username="test_bot",
                token="123456:ABC-DEF"
            )
            db.add(bot)
            db.commit()
            db.refresh(bot)
            print(f"   ✓ Бот создан: id={bot.id}")
        else:
            print(f"   ✓ Используем существующего бота: id={bot.id}")
        
        # Получаем или создаем шаблон
        template = db.query(Template).filter(Template.user_id == user.id).first()
        if not template:
            print("   ⚠ Шаблон не найден, создаем тестовый...")
            template = Template(
                name="Test Template",
                user_id=user.id,
                category="test",
                content={"nodes": [], "edges": []}
            )
            db.add(template)
            db.commit()
            db.refresh(template)
            print(f"   ✓ Шаблон создан: id={template.id}")
        else:
            print(f"   ✓ Используем существующий шаблон: id={template.id}")
        
        # Получаем или создаем BotInstance
        bot_instance = db.query(BotInstance).filter(BotInstance.user_id == user.id).first()
        if not bot_instance:
            print("   ⚠ BotInstance не найден, создаем тестовый...")
            bot_instance = BotInstance(
                user_id=user.id,
                token="123456:ABC-DEF",
                username="test_bot",
                template_id=template.id
            )
            db.add(bot_instance)
            db.commit()
            db.refresh(bot_instance)
            print(f"   ✓ BotInstance создан: id={bot_instance.id}")
        else:
            print(f"   ✓ Используем существующий BotInstance: id={bot_instance.id}")
        
        # Создаем BotUserState с новыми полями
        test_telegram_id = "999888777"
        existing_state = db.query(BotUserState).filter(
            BotUserState.telegram_user_id == test_telegram_id,
            BotUserState.bot_id == bot_instance.id
        ).first()
        
        if existing_state:
            print(f"   ⚠ BotUserState уже существует, удаляем...")
            db.delete(existing_state)
            db.commit()
        
        state = BotUserState(
            telegram_user_id=test_telegram_id,
            bot_id=bot_instance.id,
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
        
        # Проверяем все поля
        assert state.id is not None, "ID не создан"
        assert state.public_id is not None, "public_id не создан"
        assert state.telegram_user_id == test_telegram_id, "telegram_user_id не совпадает"
        assert state.bot_id == bot_instance.id, "bot_id не совпадает"
        assert state.channel == "telegram", "channel не совпадает"
        assert state.status == "active", "status не совпадает"
        assert state.name == "Test User", "name не совпадает"
        assert state.email == "test@example.com", "email не совпадает"
        assert state.phone == "+79991234567", "phone не совпадает"
        assert state.entry_point == "promo1", "entry_point не совпадает"
        assert state.utm_source == "google", "utm_source не совпадает"
        assert state.utm_campaign == "summer2025", "utm_campaign не совпадает"
        assert state.last_interaction_at is not None, "last_interaction_at не создан"
        
        print(f"   ✅ BotUserState создан успешно:")
        print(f"      - id: {state.id}")
        print(f"      - public_id: {state.public_id}")
        print(f"      - name: {state.name}")
        print(f"      - email: {state.email}")
        print(f"      - phone: {state.phone}")
        print(f"      - utm_source: {state.utm_source}")
        print(f"      - utm_campaign: {state.utm_campaign}")
        
        # 2. Проверка создания тегов
        print("\n2. Тест создания BotTag...")
        
        existing_tag = db.query(BotTag).filter(
            BotTag.bot_id == bot_instance.id,
            BotTag.name == "VIP"
        ).first()
        
        if existing_tag:
            print(f"   ⚠ Тег 'VIP' уже существует, удаляем...")
            db.delete(existing_tag)
            db.commit()
        
        tag = BotTag(
            bot_id=bot_instance.id,
            name="VIP",
            description="VIP клиенты",
            color="#FFD700"
        )
        db.add(tag)
        db.commit()
        db.refresh(tag)
        
        assert tag.id is not None, "ID тега не создан"
        assert tag.bot_id == bot_instance.id, "bot_id тега не совпадает"
        assert tag.name == "VIP", "name тега не совпадает"
        assert tag.color == "#FFD700", "color тега не совпадает"
        
        print(f"   ✅ BotTag создан успешно:")
        print(f"      - id: {tag.id}")
        print(f"      - name: {tag.name}")
        print(f"      - color: {tag.color}")
        
        # 3. Проверка присвоения тега контакту
        print("\n3. Тест присвоения тега контакту...")
        
        state.tags.append(tag)
        db.commit()
        db.refresh(state)
        
        assert len(state.tags) == 1, "Тег не присвоен"
        assert state.tags[0].id == tag.id, "ID тега не совпадает"
        
        print(f"   ✅ Тег присвоен контакту успешно")
        
        # 4. Проверка поиска
        print("\n4. Тест поиска контактов...")
        
        # Поиск по email
        found_by_email = db.query(BotUserState).filter(
            BotUserState.email == "test@example.com"
        ).first()
        assert found_by_email is not None, "Контакт не найден по email"
        assert found_by_email.id == state.id, "Найден неправильный контакт"
        print(f"   ✅ Поиск по email работает")
        
        # Поиск по phone
        found_by_phone = db.query(BotUserState).filter(
            BotUserState.phone == "+79991234567"
        ).first()
        assert found_by_phone is not None, "Контакт не найден по phone"
        assert found_by_phone.id == state.id, "Найден неправильный контакт"
        print(f"   ✅ Поиск по phone работает")
        
        # Поиск по utm_source
        found_by_utm = db.query(BotUserState).filter(
            BotUserState.utm_source == "google"
        ).first()
        assert found_by_utm is not None, "Контакт не найден по utm_source"
        assert found_by_utm.id == state.id, "Найден неправильный контакт"
        print(f"   ✅ Поиск по utm_source работает")
        
        # Поиск по status
        active_contacts = db.query(BotUserState).filter(
            BotUserState.status == "active"
        ).all()
        assert len(active_contacts) > 0, "Активные контакты не найдены"
        print(f"   ✅ Поиск по status работает: найдено {len(active_contacts)} активных контактов")
        
        print("\n" + "=" * 60)
        print("✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ ОШИБКА: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        return False
    finally:
        db.close()
    
    return True


if __name__ == "__main__":
    success = test_database()
    sys.exit(0 if success else 1)

