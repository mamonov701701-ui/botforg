"""
Гарантия актуальной схемы БД в локальной разработке.

Если SQLite-файл создан до появления новых колонок (например users.token_version),
без миграций вход даёт OperationalError и «500» на /auth/email/login.
Alembic upgrade head идемпотентен — безопасно вызывать при каждом старте uvicorn (SQLite + development).
"""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def _repo_root() -> Path:
    # backend/services/ensure_migrations.py -> repo root
    return Path(__file__).resolve().parents[2]


def ensure_dev_sqlite_migrations_applied() -> None:
    from backend.settings import settings

    if getattr(settings, "TESTING", False):
        return
    url = getattr(settings, "DATABASE_URL", "") or ""
    if not url.startswith("sqlite"):
        return
    if getattr(settings, "ENVIRONMENT", "development") != "development":
        return

    alembic_ini = _repo_root() / "alembic.ini"
    if not alembic_ini.is_file():
        logger.warning("ensure_migrations: alembic.ini not found at %s", alembic_ini)
        return

    try:
        from alembic import command
        from alembic.config import Config

        cfg = Config(str(alembic_ini))
        command.upgrade(cfg, "head")
        logger.info("ensure_migrations: alembic upgrade head completed (sqlite dev)")
    except Exception:
        logger.exception(
            "ensure_migrations: alembic upgrade failed; run from repo root: python -m alembic upgrade head"
        )
        raise
