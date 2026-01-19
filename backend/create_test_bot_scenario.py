"""
Скрипт для создания тестового бота и сценария с простой цепочкой блоков
для тестирования платформы
"""
import sys
import os
import requests
import json
from datetime import datetime

# Настройки API
API_BASE_URL = "http://localhost:8001"

def login(email: str, password: str) -> str:
    """Авторизация и получение токена"""
    url = f"{API_BASE_URL}/auth/login"
    data = {
        "username": email,
        "password": password
    }
    response = requests.post(url, data=data)
    if response.status_code != 200:
        raise Exception(f"Ошибка авторизации: {response.status_code} - {response.text}")
    result = response.json()
    return result.get("access_token") or result.get("token")

def create_bot(token: str, title: str) -> dict:
    """Создание бота"""
    url = f"{API_BASE_URL}/bots/"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    data = {
        "title": title
    }
    response = requests.post(url, headers=headers, json=data)
    if response.status_code != 201:
        raise Exception(f"Ошибка создания бота: {response.status_code} - {response.text}")
    return response.json()

def create_scenario(token: str, bot_id: int, name: str, content: dict) -> dict:
    """Создание сценария"""
    url = f"{API_BASE_URL}/scenarios/"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    data = {
        "name": name,
        "description": f"Тестовый сценарий для проверки работы платформы",
        "icon": "TestTube",
        "category": "other",
        "bot_id": bot_id,
        "is_main": True,
        "is_library": False,
        "content": content
    }
    response = requests.post(url, headers=headers, json=data)
    if response.status_code != 201:
        raise Exception(f"Ошибка создания сценария: {response.status_code} - {response.text}")
    return response.json()

def create_test_scenario_content():
    """Создание содержимого тестового сценария"""
    # Структура: start -> message с кнопками -> condition -> два message блока
    
    nodes = [
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
            "id": "node_condition",
            "type": "default",
            "position": {"x": 250, "y": 350},
            "data": {
                "title": "Проверка выбора",
                "blockId": "condition",
                "icon": "🔀",
                "color": "#9C27B0",
                "settings": {
                    "variable": "user_choice",
                    "operator": "equals",
                    "value": "Да",
                    "trueLabel": "Да",
                    "falseLabel": "Нет"
                }
            }
        },
        {
            "id": "node_message_yes",
            "type": "default",
            "position": {"x": 100, "y": 500},
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
            "position": {"x": 400, "y": 500},
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
    ]
    
    edges = [
        {
            "id": "edge_start_to_message",
            "source": "node_start",
            "target": "node_message_1",
            "type": "default",
            "sourceHandle": None,
            "targetHandle": None
        },
        {
            "id": "edge_message_to_condition",
            "source": "node_message_1",
            "target": "node_condition",
            "type": "default",
            "sourceHandle": None,
            "targetHandle": None
        },
        {
            "id": "edge_condition_to_yes",
            "source": "node_condition",
            "target": "node_message_yes",
            "type": "default",
            "sourceHandle": "true",
            "targetHandle": None
        },
        {
            "id": "edge_condition_to_no",
            "source": "node_condition",
            "target": "node_message_no",
            "type": "default",
            "sourceHandle": "false",
            "targetHandle": None
        }
    ]
    
    return {"nodes": nodes, "edges": edges}

def main():
    """Основная функция"""
    import sys
    import io
    # Устанавливаем UTF-8 для вывода
    if sys.platform == 'win32':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
    
    print("Создание тестового бота и сценария...\n")
    
    # Запрашиваем данные для входа
    email = input("Введите email пользователя: ").strip()
    password = input("Введите пароль: ").strip()
    
    try:
        # Авторизация
        print("\n1. Авторизация...")
        token = login(email, password)
        print(f"OK Авторизация успешна")
        
        # Создание бота
        print("\n2. Создание бота...")
        bot = create_bot(token, "Тестовый бот для проверки платформы")
        bot_id = bot["id"]
        print(f"OK Бот создан: {bot['title']} (ID: {bot_id})")
        
        # Создание сценария
        print("\n3. Создание сценария...")
        content = create_test_scenario_content()
        scenario = create_scenario(token, bot_id, "Главный", content)
        scenario_id = scenario["id"]
        print(f"OK Сценарий создан: {scenario['name']} (ID: {scenario_id})")
        
        print("\nГотово! Тестовый бот и сценарий созданы.")
        print(f"\nИнформация:")
        print(f"   Бот ID: {bot_id}")
        print(f"   Сценарий ID: {scenario_id}")
        print(f"   Блоков в сценарии: {len(content['nodes'])}")
        print(f"   Соединений: {len(content['edges'])}")
        print(f"\nТеперь вы можете:")
        print(f"   1. Открыть редактор: http://localhost:5173/editor/{bot_id}")
        print(f"   2. Протестировать сценарий через Telegram (если бот подключен)")
        
    except Exception as e:
        print(f"\nОшибка: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
