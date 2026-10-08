"""Isolated verification of the idempotent 051 schema repair."""
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

from backend.settings import settings


REVISIONS = (
    "custom_block_review_schema_repair_046",
    "custom_block_marketplace_047",
    "custom_block_marketplace_chat_048",
    "custom_block_marketplace_library_049",
    "custom_block_distribution_050",
    "custom_block_free_paid_trust_051",
    "custom_block_trust_schema_repair_052",
)


def test_051_repair_clean_noop_and_missing_objects(tmp_path, monkeypatch):
    root = Path(__file__).resolve().parents[2]
    dev_db = (root / "botforg.db").resolve()
    temp_db = (tmp_path / "repair_validation.db").resolve()
    assert temp_db != dev_db and temp_db.parent == tmp_path.resolve()
    url = f"sqlite:///{temp_db.as_posix()}"
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "backend" / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url)
    engine = create_engine(url)
    assert Path(engine.url.database).resolve() == temp_db
    print(f"Isolated migration DB: {temp_db}")

    def revision():
        with engine.connect() as conn:
            return conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()

    def schema_snapshot():
        with engine.connect() as conn:
            return conn.execute(text(
                "SELECT type, name, sql FROM sqlite_master "
                "WHERE name NOT LIKE 'sqlite_%' AND name != 'alembic_version' "
                "ORDER BY type, name"
            )).all()

    for target in REVISIONS:
        command.upgrade(cfg, target)
        assert revision() == target
    inspector = inspect(engine)
    assert "trust_safety_reports" in inspector.get_table_names()
    assert {"price_amount", "price_currency"}.issubset(
        {column["name"] for column in inspector.get_columns("custom_block_marketplace_listings")}
    )
    correct_snapshot = schema_snapshot()

    command.downgrade(cfg, REVISIONS[-2])
    assert revision() == REVISIONS[-2]
    assert schema_snapshot() == correct_snapshot  # 052 downgrade preserves 051-owned data/schema.
    command.upgrade(cfg, REVISIONS[-1])
    assert schema_snapshot() == correct_snapshot  # Already-correct 051 is a no-op.

    command.downgrade(cfg, REVISIONS[-2])
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE trust_safety_reports"))
        conn.execute(text("DROP TABLE trust_safety_audit_events"))
        conn.execute(text("DROP INDEX ix_marketplace_disputes_status"))
    command.upgrade(cfg, REVISIONS[-1])
    assert revision() == REVISIONS[-1]
    repaired = inspect(engine)
    assert {"trust_safety_reports", "trust_safety_audit_events"}.issubset(set(repaired.get_table_names()))
    assert "ix_marketplace_disputes_status" in {
        index["name"] for index in repaired.get_indexes("marketplace_disputes")
    }
    assert schema_snapshot() == correct_snapshot
    engine.dispose()
