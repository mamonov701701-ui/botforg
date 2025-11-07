"""
Скрипт для добавления стандартных шаблонов сценариев в библиотеку
Запускать один раз при инициализации платформы
"""
import sys
import os
from datetime import datetime, timezone

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.database import SessionLocal
from backend.models.scenario import Scenario
from backend.models.user import User


# Стандартные шаблоны сценариев
STANDARD_SCENARIOS = [
    {
        "name": "Стандартная оплата",
        "description": "Готовый сценарий оформления заказа с выбором способа оплаты",
        "icon": "CreditCard",
        "category": "payment",
        "content": {
            "nodes": [
                {
                    "id": "start-1",
                    "type": "start",
                    "position": {"x": 100, "y": 100},
                    "data": {"label": "Начало"}
                },
                {
                    "id": "msg-1",
                    "type": "message",
                    "position": {"x": 100, "y": 200},
                    "data": {"label": "Оформление заказа", "message": "Давайте оформим ваш заказ"}
                }
            ],
            "edges": [
                {
                    "id": "e1-2",
                    "source": "start-1",
                    "target": "msg-1"
                }
            ]
        }
    },
    {
        "name": "Поддержка клиентов",
        "description": "Сценарий для связи с техподдержкой и операторами",
        "icon": "Headphones",
        "category": "support",
        "content": {
            "nodes": [
                {
                    "id": "start-1",
                    "type": "start",
                    "position": {"x": 100, "y": 100},
                    "data": {"label": "Начало"}
                },
                {
                    "id": "msg-1",
                    "type": "message",
                    "position": {"x": 100, "y": 200},
                    "data": {"label": "Поддержка", "message": "Связываем с оператором..."}
                }
            ],
            "edges": [
                {
                    "id": "e1-2",
                    "source": "start-1",
                    "target": "msg-1"
                }
            ]
        }
    },
    {
        "name": "Каталог товаров",
        "description": "Сценарий показа товаров с категориями",
        "icon": "Package",
        "category": "catalog",
        "content": {
            "nodes": [
                {
                    "id": "start-1",
                    "type": "start",
                    "position": {"x": 100, "y": 100},
                    "data": {"label": "Начало"}
                },
                {
                    "id": "msg-1",
                    "type": "message",
                    "position": {"x": 100, "y": 200},
                    "data": {"label": "Каталог", "message": "Выберите категорию товаров"}
                }
            ],
            "edges": [
                {
                    "id": "e1-2",
                    "source": "start-1",
                    "target": "msg-1"
                }
            ]
        }
    },
    {
        "name": "FAQ база",
        "description": "Сценарий ответов на частые вопросы",
        "icon": "HelpCircle",
        "category": "faq",
        "content": {
            "nodes": [
                {
                    "id": "start-1",
                    "type": "start",
                    "position": {"x": 100, "y": 100},
                    "data": {"label": "Начало"}
                },
                {
                    "id": "msg-1",
                    "type": "message",
                    "position": {"x": 100, "y": 200},
                    "data": {"label": "FAQ", "message": "Выберите интересующий вопрос"}
                }
            ],
            "edges": [
                {
                    "id": "e1-2",
                    "source": "start-1",
                    "target": "msg-1"
                }
            ]
        }
    },
]


def seed_standard_scenarios():
    """Добавляет стандартные шаблоны в библиотеку"""
    db = SessionLocal()
    
    try:
        # Находим или создаем системного пользователя для стандартных шаблонов
        system_user = db.query(User).filter(User.email == "system@botforg.ru").first()
        
        if not system_user:
            print("Создаем системного пользователя...")
            from backend.security import get_password_hash
            system_user = User(
                email="system@botforg.ru",
                name="System",
                role="owner",
                hashed_password=get_password_hash("system_user_no_login"),  # Dummy password
                email_verified_at=datetime.now(timezone.utc)
            )
            db.add(system_user)
            db.commit()
            db.refresh(system_user)
        
        # Добавляем стандартные сценарии
        for template in STANDARD_SCENARIOS:
            # Проверяем существование
            existing = db.query(Scenario).filter(
                Scenario.name == template["name"],
                Scenario.is_standard == True
            ).first()
            
            if existing:
                print(f"✓ Шаблон '{template['name']}' уже существует")
                continue
            
            scenario = Scenario(
                user_id=system_user.id,
                bot_id=None,  # В библиотеке
                name=template["name"],
                description=template["description"],
                icon=template["icon"],
                category=template["category"],
                content=template["content"],
                is_library=True,
                is_standard=True,
                is_main=False,
                is_public=False,
                order=0,
            )
            
            db.add(scenario)
            print(f"+ Добавлен шаблон: {template['name']}")
        
        db.commit()
        print("\n✅ Стандартные шаблоны успешно добавлены!")
        
    except Exception as e:
        print(f"\n❌ Ошибка: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    print("Добавление стандартных шаблонов сценариев...\n")
    seed_standard_scenarios()

