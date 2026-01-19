"""
Скрипт для создания тестового бота и сценария напрямую в БД
для тестирования платформы
"""
import sys
import os

# Добавляем корневую директорию проекта в путь
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from sqlalchemy.orm import Session
from backend.database import SessionLocal
from backend.models.bot import Bot
from backend.models.user import User
from backend.models.scenario import Scenario

def create_test_bot_scenario():
    """Создает тестовый бот и сценарий напрямую в БД"""
    db: Session = SessionLocal()
    
    try:
        # Находим первого пользователя или создаем тестового
        user = db.query(User).first()
        if not user:
            print("Ошибка: Пользователь не найден. Создайте пользователя через регистрацию.")
            return None, None
        
        print(f"Используем пользователя: {user.email} (ID: {user.id})")
        
        # Создаем бота
        bot = Bot(
            owner_id=user.id,
            title="Тестовый бот для проверки платформы",
            username=f"test_bot_{user.id}",
            token=f"test_token_{user.id}",
            is_active=True
        )
        db.add(bot)
        db.commit()
        db.refresh(bot)
        print(f"OK Бот создан: {bot.title} (ID: {bot.id})")
        
        # Создаем сценарий с простой цепочкой блоков.
        # ВАЖНО: EditorV2 валидирует edge.sourceHandle и принимает только:
        # - 'top'|'right'|'bottom'|'left' для обычных хэндлов
        # - 'button_N' для message-блоков с кнопками
        # Поэтому ветвление делаем через кнопки message (button_0/button_1),
        # а не через condition true/false handles.
        content = {
            "nodes": [
                {
                    "id": "node_start",
                    "type": "default",
                    "position": {"x": 250, "y": 50},
                    "data": {
                        "title": "Начало",
                        "blockId": "start",
                        "icon": "▶️",
                        "color": "#4CAF50",
                        "settings": {}
                    }
                },
                {
                    "id": "node_message_1",
                    "type": "default",
                    "position": {"x": 250, "y": 200},
                    "data": {
                        "title": "Приветствие",
                        "blockId": "message",
                        "icon": "💬",
                        "color": "#2196F3",
                        "settings": {
                            "text": "Привет! 👋\n\nДобро пожаловать в тестового бота!\n\nВыберите действие:",
                            "parseMode": "Plain",
                            "disablePreview": False,
                            "buttons": [
                                {"label": "Да", "action": "next"},
                                {"label": "Нет", "action": "next"}
                            ]
                        }
                    }
                },
                {
                    "id": "node_message_yes",
                    "type": "default",
                    "position": {"x": 100, "y": 420},
                    "data": {
                        "title": "Ответ: Да",
                        "blockId": "message",
                        "icon": "💬",
                        "color": "#2196F3",
                        "settings": {
                            "text": "Отлично! Вы выбрали 'Да'. 👍\n\nЭто ветка для положительного ответа.",
                            "parseMode": "Plain",
                            "disablePreview": False
                        }
                    }
                },
                {
                    "id": "node_message_no",
                    "type": "default",
                    "position": {"x": 400, "y": 420},
                    "data": {
                        "title": "Ответ: Нет",
                        "blockId": "message",
                        "icon": "💬",
                        "color": "#2196F3",
                        "settings": {
                            "text": "Понятно, вы выбрали 'Нет'. 👌\n\nЭто ветка для отрицательного ответа.",
                            "parseMode": "Plain",
                            "disablePreview": False
                        }
                    }
                }
            ],
            "edges": [
                {
                    "id": "edge_start_to_message",
                    "source": "node_start",
                    "target": "node_message_1",
                    "type": "default",
                    "sourceHandle": None,
                    "targetHandle": None
                },
                {
                    "id": "edge_message_yes",
                    "source": "node_message_1",
                    "target": "node_message_yes",
                    "type": "default",
                    "sourceHandle": "button_0",
                    "targetHandle": None
                },
                {
                    "id": "edge_message_no",
                    "source": "node_message_1",
                    "target": "node_message_no",
                    "type": "default",
                    "sourceHandle": "button_1",
                    "targetHandle": None
                }
            ]
        }
        
        scenario = Scenario(
            user_id=user.id,
            bot_id=bot.id,
            name="Главный",
            description="Тестовый сценарий для проверки работы платформы",
            icon="TestTube",
            category="other",
            is_main=True,
            is_library=False,
            is_standard=False,
            content=content,
            order=0
        )
        db.add(scenario)
        db.commit()
        db.refresh(scenario)
        print(f"OK Сценарий создан: {scenario.name} (ID: {scenario.id})")
        
        print("\nГотово! Тестовый бот и сценарий созданы.")
        print(f"\nИнформация:")
        print(f"   Бот ID: {bot.id}")
        print(f"   Сценарий ID: {scenario.id}")
        print(f"   Блоков в сценарии: {len(content['nodes'])}")
        print(f"   Соединений: {len(content['edges'])}")
        print(f"\nТеперь вы можете:")
        print(f"   1. Открыть редактор: http://localhost:5173/editor/{bot.id}")
        print(f"   2. Протестировать сценарий через Telegram (если бот подключен)")
        
        return bot.id, scenario.id
        
    except Exception as e:
        db.rollback()
        print(f"Ошибка: {e}")
        import traceback
        traceback.print_exc()
        return None, None
    finally:
        db.close()

if __name__ == "__main__":
    print("Создание тестового бота и сценария...\n")
    bot_id, scenario_id = create_test_bot_scenario()
    if bot_id:
        print(f"\nБот ID: {bot_id}")
        print(f"Сценарий ID: {scenario_id}")
