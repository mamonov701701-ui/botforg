"""Regression coverage for runtime SQLite foreign key enforcement."""

import pytest
from sqlalchemy.exc import IntegrityError

from backend.database import engine


def test_runtime_connections_enforce_foreign_keys():
    if engine.dialect.name != "sqlite":
        pytest.skip("SQLite-only connection setting")

    with engine.connect() as connection:
        assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
        connection.exec_driver_sql(
            "CREATE TEMP TABLE fk_parent (id INTEGER PRIMARY KEY)"
        )
        connection.exec_driver_sql(
            "CREATE TEMP TABLE fk_child (parent_id INTEGER REFERENCES fk_parent(id))"
        )
        try:
            with pytest.raises(IntegrityError):
                connection.exec_driver_sql("INSERT INTO fk_child (parent_id) VALUES (61)")
        finally:
            connection.exec_driver_sql("DROP TABLE fk_child")
            connection.exec_driver_sql("DROP TABLE fk_parent")
