"""
Демо-контент для новых пользователей.
Создаёт 1 демо-бота, 2 шаблона, 2 сценария в боте.
"""
import uuid
import logging

from sqlalchemy.orm import Session

from backend.models.bot import Bot
from backend.models.scenario import Scenario, SCENARIO_STATUS_PUBLISHED
from backend.models.template import Template
from backend.models.user import User, UserSettings

logger = logging.getLogger(__name__)

# Базовый контент сценария с nodes и edges
DEFAULT_SCENARIO_CONTENT = {
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
                "settings": {},
            },
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
                "settings": {"text": "Добро пожаловать! Это демо-сценарий."},
            },
        },
    ],
    "edges": [
        {"id": "e1-2", "source": "start-1", "target": "msg-1", "type": "default"},
    ],
}


def _get_demo_content_created(db: Session, user_id: int) -> bool:
    """Проверяет, создан ли уже демо-контент для пользователя."""
    row = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not row or not row.interface_settings:
        return False
    return bool(row.interface_settings.get("demo_content_created", False))


def _set_demo_content_created(db: Session, user_id: int) -> None:
    """Устанавливает флаг demo_content_created в настройках пользователя."""
    row = db.query(UserSettings).filter(UserSettings.user_id == user_id).first()
    if not row:
        row = UserSettings(user_id=user_id, interface_settings={})
        db.add(row)
        db.flush()
    settings = dict(row.interface_settings or {})
    settings["demo_content_created"] = True
    row.interface_settings = settings
    db.commit()


def create_demo_content_for_user(db: Session, user_id: int) -> bool:
    """
    Создаёт демо-контент для пользователя (бот, шаблоны, сценарии).
    Вызывается один раз при первой регистрации.
    Возвращает True если контент создан, False если уже был создан.
    """
    if _get_demo_content_created(db, user_id):
        return False

    try:
        uid = str(uuid.uuid4())[:8]

        # 1. Демо-бот
        demo_bot = Bot(
            owner_id=user_id,
            title="Мой первый бот",
            username=f"demo_{user_id}_{uid}",
            token=f"demo_token_{uid}",
            is_active=False,
        )
        db.add(demo_bot)
        db.flush()

        # 2. Сценарии в демо-боте
        main_scenario = Scenario(
            user_id=user_id,
            bot_id=demo_bot.id,
            name="Главный",
            description="Главный сценарий — точка входа в бот",
            icon="Home",
            category="main",
            is_main=True,
            is_library=False,
            is_standard=False,
            content=DEFAULT_SCENARIO_CONTENT,
            published_content=DEFAULT_SCENARIO_CONTENT,
            status=SCENARIO_STATUS_PUBLISHED,
            order=0,
        )
        db.add(main_scenario)

        support_content = {
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
                            "settings": {},
                        },
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
                            "settings": {
                                "text": "Передаём вас оператору. Ожидайте ответа."
                            },
                        },
                    },
                ],
                "edges": [
                    {"id": "e1-2", "source": "start-1", "target": "msg-1", "type": "default"},
                ],
            }
        support_scenario = Scenario(
            user_id=user_id,
            bot_id=demo_bot.id,
            name="Поддержка",
            description="Сценарий связи с оператором",
            icon="Headphones",
            category="support",
            is_main=False,
            is_library=False,
            content=support_content,
            published_content=support_content,
            status=SCENARIO_STATUS_PUBLISHED,
            order=1,
        )
        db.add(support_scenario)

        # 3. Шаблоны (Template) с контентом сценариев
        template_lead = Template(
            user_id=user_id,
            name="Лидогенерация",
            description="Шаблон бота для сбора лидов и заявок",
            category="lead_gen",
            is_public=False,
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
                            "settings": {},
                        },
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
                            "settings": {
                                "text": "Оставьте контакт — мы перезвоним!"
                            },
                        },
                    },
                ],
                "edges": [
                    {"id": "e1-2", "source": "start-1", "target": "msg-1", "type": "default"},
                ],
            },
        )
        db.add(template_lead)

        template_support = Template(
            user_id=user_id,
            name="Поддержка клиентов",
            description="Шаблон бота для службы поддержки",
            category="support",
            is_public=False,
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
                            "settings": {},
                        },
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
                            "settings": {
                                "text": "Добрый день! Чем могу помочь?"
                            },
                        },
                    },
                ],
                "edges": [
                    {"id": "e1-2", "source": "start-1", "target": "msg-1", "type": "default"},
                ],
            },
        )
        db.add(template_support)

        db.commit()
        _set_demo_content_created(db, user_id)
        logger.info("Demo content created for user_id=%s", user_id)
        return True
    except Exception as e:
        logger.exception("Failed to create demo content for user_id=%s: %s", user_id, e)
        db.rollback()
        raise


def ensure_demo_content_created(db: Session, user_id: int) -> bool:
    """
    Убеждается, что демо-контент создан. Создаёт при необходимости.
    Возвращает True если контент был создан в этом вызове.
    """
    if _get_demo_content_created(db, user_id):
        return False
    return create_demo_content_for_user(db, user_id)
