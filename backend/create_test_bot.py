"""
Скрипт для создания тестового бота с главным сценарием
"""
import sys
import os
from datetime import datetime, timezone

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal
from backend.models.user import User
from backend.models.bot import Bot
from backend.models.scenario import Scenario


def create_test_bot():
    """Создает тестового бота с главным сценарием"""
    db = SessionLocal()
    
    try:
        # Находим первого пользователя
        user = db.query(User).first()
        
        if not user:
            print("❌ Пользователей не найдено. Создайте пользователя через регистрацию.")
            return
        
        print(f"✓ Используем пользователя: {user.email} (ID: {user.id})")
        
        # Создаем тестового бота
        test_bot = Bot(
            owner_id=user.id,
            title="Тестовый бот",
            username="test_bot_" + str(int(datetime.now(timezone.utc).timestamp())),
            token="TEST_TOKEN_" + str(int(datetime.now(timezone.utc).timestamp())),
            is_active=True,
        )
        
        db.add(test_bot)
        db.commit()
        db.refresh(test_bot)
        
        print(f"✓ Создан бот: {test_bot.title} (ID: {test_bot.id})")
        
        # Создаем главный сценарий
        main_scenario = Scenario(
            user_id=user.id,
            bot_id=test_bot.id,
            name="Главный",
            description="Главный сценарий - точка входа в бот",
            icon="Home",
            category="main",
            is_main=True,
            is_library=False,
            is_standard=False,
            content={"nodes": [], "edges": []},
            order=0,
        )
        
        db.add(main_scenario)
        db.commit()
        db.refresh(main_scenario)
        
        print(f"✓ Создан главный сценарий (ID: {main_scenario.id})")
        
        # Создаем дополнительный тестовый сценарий
        test_scenario = Scenario(
            user_id=user.id,
            bot_id=test_bot.id,
            name="Оформление заказа",
            description="Сценарий оформления заказа",
            icon="ShoppingCart",
            category="payment",
            is_main=False,
            is_library=False,
            is_standard=False,
            content={
                "nodes": [
                    {
                        "id": "start-1",
                        "type": "start",
                        "position": {"x": 100, "y": 100},
                        "data": {"label": "Начало", "settings": {}}
                    },
                    {
                        "id": "msg-1",
                        "type": "message",
                        "position": {"x": 100, "y": 250},
                        "data": {"label": "Приветствие", "message": "Добро пожаловать!", "settings": {"text": "Добро пожаловать!"}}
                    }
                ],
                "edges": [
                    {
                        "id": "e1-2",
                        "source": "start-1",
                        "target": "msg-1"
                    }
                ]
            },
            order=1,
        )
        
        db.add(test_scenario)
        db.commit()
        db.refresh(test_scenario)
        
        print(f"✓ Создан тестовый сценарий: {test_scenario.name} (ID: {test_scenario.id})")
        print(f"\n✅ Готово! Откройте редактор: http://localhost:5173/editor/{test_bot.id}")
        
    except Exception as e:
        print(f"\n❌ Ошибка: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    print("Создание тестового бота...\n")
    create_test_bot()

