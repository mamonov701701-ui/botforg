"""
Системные определения переменных конструктора (ключи в snake_case).

Вызывать после создания записи ctor_bots, например из сервиса создания бота
или одноразово миграцией данных.

Не трогает существующие таблицы users / bots платформы.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from backend.models.constructor_core import CtorBotVariableDefinition

# (key, label, data_type, scope, description)
SYSTEM_VARIABLE_DEFINITIONS: tuple[tuple[str, str, str, str, str], ...] = (
    (
        "user_name",
        "Имя пользователя",
        "string",
        "user",
        "Подстановка из профиля собеседника или введённого имени.",
    ),
    (
        "phone",
        "Телефон",
        "string",
        "user",
        "Номер телефона из канала или ввода.",
    ),
    (
        "email",
        "Электронная почта",
        "string",
        "user",
        "Адрес электронной почты из профиля или ввода.",
    ),
    (
        "last_input",
        "Последний ввод",
        "string",
        "session",
        "Последний свободный текстовый ответ в текущем сеансе.",
    ),
)


def ensure_system_variable_definitions(db: Session, bot_id: int) -> int:
    """
    Создаёт недостающие системные ctor_bot_variable_definitions для bot_id.
    Возвращает число вставленных строк.
    """
    inserted = 0
    for key, label, data_type, scope, description in SYSTEM_VARIABLE_DEFINITIONS:
        exists = (
            db.query(CtorBotVariableDefinition)
            .filter(
                CtorBotVariableDefinition.bot_id == bot_id,
                CtorBotVariableDefinition.key == key,
            )
            .first()
        )
        if exists:
            continue
        db.add(
            CtorBotVariableDefinition(
                bot_id=bot_id,
                key=key,
                label=label,
                data_type=data_type,
                scope=scope,
                description=description,
                is_system=True,
            )
        )
        inserted += 1
    if inserted:
        db.flush()
    return inserted


def seed_system_variables_for_all_ctor_bots(db: Session) -> dict[int, int]:
    """Для каждого ctor_bots.id добавляет системные переменные. Сводка: bot_id -> число вставок."""
    from backend.models.constructor_core import CtorBot

    result: dict[int, int] = {}
    for bot in db.query(CtorBot.id).all():
        bid = bot.id
        n = ensure_system_variable_definitions(db, bid)
        if n:
            result[bid] = n
    if any(result.values()):
        db.commit()
    return result
