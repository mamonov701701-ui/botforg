"""
Скрипт полной настройки демонстрации системы сценариев
Создает пользователя, бота с сценариями для тестирования
"""
import sys
import os
from datetime import datetime, timezone

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal
from backend.models.user import User
from backend.models.bot import Bot
from backend.models.scenario import Scenario
from backend.security import get_password_hash


def setup_demo():
    """Полная настройка демо-окружения"""
    db = SessionLocal()
    
    try:
        print("=" * 60)
        print("🚀 НАСТРОЙКА ДЕМОНСТРАЦИИ СИСТЕМЫ СЦЕНАРИЕВ")
        print("=" * 60)
        
        # 1. Создаем или находим демо пользователя
        demo_user = db.query(User).filter(User.email == "demo@bot.ru").first()
        
        if not demo_user:
            print("\n📝 Создаем демо пользователя...")
            demo_user = User(
                email="demo@bot.ru",
                name="Demo User",
                hashed_password=get_password_hash("Demo123!"),
                role="moderator",
                email_verified_at=datetime.now(timezone.utc)
            )
            db.add(demo_user)
            db.commit()
            db.refresh(demo_user)
            print(f"   ✅ Пользователь создан: {demo_user.email}")
        else:
            # Обновляем роль на всякий случай
            demo_user.role = "moderator"
            db.commit()
            print(f"   ✅ Пользователь найден: {demo_user.email} (ID: {demo_user.id})")
        
        # 2. Создаем демо бота
        print("\n🤖 Создаем демо бота...")
        demo_bot = Bot(
            owner_id=demo_user.id,
            title="Демо магазин",
            username="demo_shop_bot",
            token="DEMO_TOKEN_" + str(int(datetime.now(timezone.utc).timestamp())),
            is_active=True,
        )
        
        db.add(demo_bot)
        db.commit()
        db.refresh(demo_bot)
        print(f"   ✅ Бот создан: {demo_bot.title} (ID: {demo_bot.id})")
        
        # 3. Создаем главный сценарий
        print("\n📋 Создаем сценарии...")
        main_scenario = Scenario(
            user_id=demo_user.id,
            bot_id=demo_bot.id,
            name="Главный",
            description="Главный сценарий - точка входа в бот",
            icon="Home",
            category="main",
            is_main=True,
            is_library=False,
            is_standard=False,
            content={
                "nodes": [
                    {
                        "id": "start-1",
                        "type": "start",
                        "position": {"x": 100, "y": 100},
                        "data": {
                            "blockId": "start",
                            "title": "Начало",
                            "icon": "▶️",
                            "color": "#10b981",
                            "settings": {}
                        }
                    }
                ],
                "edges": []
            },
            order=0,
        )
        
        db.add(main_scenario)
        db.commit()
        db.refresh(main_scenario)
        print(f"   ✅ Главный сценарий (ID: {main_scenario.id})")
        
        # 4. Дополнительные сценарии
        checkout_scenario = Scenario(
            user_id=demo_user.id,
            bot_id=demo_bot.id,
            name="Оформление заказа",
            description="Сценарий оформления заказа и оплаты",
            icon="ShoppingCart",
            category="payment",
            is_main=False,
            is_library=False,
            content={
                "nodes": [
                    {
                        "id": "start-1",
                        "type": "start",
                        "position": {"x": 100, "y": 100},
                        "data": {
                            "blockId": "start",
                            "title": "Начало",
                            "icon": "▶️",
                            "color": "#10b981",
                            "settings": {}
                        }
                    },
                    {
                        "id": "msg-1",
                        "type": "message",
                        "position": {"x": 100, "y": 250},
                        "data": {
                            "blockId": "message",
                            "title": "Сообщение",
                            "icon": "💬",
                            "color": "#3b82f6",
                            "settings": {"text": "Приступаем к оформлению заказа..."}
                        }
                    }
                ],
                "edges": [
                    {
                        "id": "e1-2",
                        "source": "start-1",
                        "target": "msg-1",
                        "type": "default"
                    }
                ]
            },
            order=1,
        )
        
        db.add(checkout_scenario)
        db.commit()
        print(f"   ✅ Оформление заказа (ID: {checkout_scenario.id})")
        
        support_scenario = Scenario(
            user_id=demo_user.id,
            bot_id=demo_bot.id,
            name="Поддержка",
            description="Сценарий связи с оператором",
            icon="Headphones",
            category="support",
            is_main=False,
            is_library=False,
            content={"nodes": [], "edges": []},
            order=2,
        )
        
        db.add(support_scenario)
        db.commit()
        print(f"   ✅ Поддержка (ID: {support_scenario.id})")
        
        # 5. Выводим итоги
        print("\n" + "=" * 60)
        print("✅ ДЕМОНСТРАЦИЯ ГОТОВА!")
        print("=" * 60)
        print(f"\n📧 Email:    demo@bot.ru")
        print(f"🔑 Пароль:  Demo123!")
        print(f"\n🤖 Бот ID:   {demo_bot.id}")
        print(f"📋 Сценарии: {len(db.query(Scenario).filter(Scenario.bot_id == demo_bot.id).all())}")
        print(f"\n🌐 Редактор: http://localhost:5173/editor/{demo_bot.id}")
        print(f"🏠 Dashboard: http://localhost:5173/dashboard")
        print("\n" + "=" * 60)
        print("🎯 СЛЕДУЮЩИЕ ШАГИ:")
        print("=" * 60)
        print("1. Откройте браузер")
        print("2. Перейдите на http://localhost:5173")
        print("3. Войдите: demo@bot.ru / Demo123!")
        print(f"4. Откройте редактор: http://localhost:5173/editor/{demo_bot.id}")
        print("5. Проверьте dropdown 'Сценарии' - должны быть 3 сценария")
        print("6. Добавьте блоки - они НЕ должны исчезать")
        print("7. Нажмите 'Новый сценарий' - создание работает")
        print("8. Сохранение - работает автоматически каждые 30 сек")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Ошибка: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    setup_demo()

