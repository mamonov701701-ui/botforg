"""
Гарантия актуальной схемы БД в локальной разработке.

Если SQLite-файл создан до появления новых колонок (например users.token_version),
без миграций вход даёт OperationalError и «500» на /auth/email/login.
Alembic upgrade head идемпотентен — безопасно вызывать при каждом старте uvicorn (SQLite + development).

Не заменяет ручной `alembic revision` для новых фич: autogenerate часто предлагает drop_index /
drop_constraint — такие правки вручную отфильтровывают, см. задачи по миграциям.
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def _repo_root() -> Path:
    # backend/services/ensure_migrations.py -> repo root
    return Path(__file__).resolve().parents[2]


# Таблицы, без которых типичный dev-путь (логин, сценарии, редактор шаблонов, BF-команда) ломается на ORM.
_SQLITE_REQUIRED_TABLES = (
    "users",
    "scenarios",
    "scenario_versions",
    "nodes",
    "edges",
    "scenario_events",
    "user_sessions",
    "bf_team_members",
)

_USERS_REQUIRED_COLUMNS = ("token_version", "plan_code", "public_id")


def _verify_sqlite_schema_after_upgrade() -> None:
    """Проверка наличия ключевых таблиц и колонок users (без изменения данных)."""
    from sqlalchemy import inspect

    from backend.database import engine

    insp = inspect(engine)

    missing_tables = [t for t in _SQLITE_REQUIRED_TABLES if not insp.has_table(t)]
    if missing_tables:
        logger.error(
            "ensure_migrations: после upgrade отсутствуют таблицы %s. "
            "Из корня репозитория: python -m alembic upgrade head",
            missing_tables,
        )
        raise RuntimeError(f"SQLite schema incomplete: missing tables {missing_tables}")

    cols = {c["name"] for c in insp.get_columns("users")}
    missing_cols = [c for c in _USERS_REQUIRED_COLUMNS if c not in cols]
    if missing_cols:
        logger.error(
            "ensure_migrations: в users не хватает колонок %s после upgrade. "
            "Из корня репозитория: python -m alembic upgrade head",
            missing_cols,
        )
        raise RuntimeError(f"SQLite schema incomplete: users missing columns {missing_cols}")

    logger.info(
        "ensure_migrations: проверка схемы OK (таблицы ORM + users.%s)",
        ", ".join(_USERS_REQUIRED_COLUMNS),
    )


def ensure_dev_sqlite_migrations_applied() -> None:
    from backend.settings import settings

    if getattr(settings, "TESTING", False):
        logger.info("ensure_migrations: пропуск (TESTING=true)")
        return

    url = getattr(settings, "DATABASE_URL", "") or ""
    if not url.startswith("sqlite"):
        logger.info(
            "ensure_migrations: пропуск (не SQLite): DATABASE_URL начинается не с sqlite://"
        )
        return

    env = getattr(settings, "ENVIRONMENT", "development")
    if env != "development":
        logger.info(
            "ensure_migrations: пропуск (ENVIRONMENT=%s, авто-migrate только для development)",
            env,
        )
        return

    alembic_ini = _repo_root() / "alembic.ini"
    if not alembic_ini.is_file():
        logger.error("ensure_migrations: не найден alembic.ini: %s", alembic_ini)
        raise RuntimeError(f"alembic.ini not found at {alembic_ini}")

    logger.info(
        "ensure_migrations: запуск alembic upgrade head (development, SQLite)"
    )

    try:
        from alembic import command
        from alembic.config import Config

        cfg = Config(str(alembic_ini))
        command.upgrade(cfg, "head")
        logger.info("ensure_migrations: alembic upgrade head завершён успешно")
    except Exception:
        logger.exception(
            "ensure_migrations: ошибка alembic upgrade head; из корня репозитория: python -m alembic upgrade head"
        )
        raise

    try:
        _verify_sqlite_schema_after_upgrade()
    except Exception:
        logger.exception("ensure_migrations: проверка схемы SQLite после upgrade не прошла")
        raise
