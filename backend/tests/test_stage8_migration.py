"""Stage 8 migration round trip on a separate temporary SQLite database."""

from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

from backend.settings import settings


def test_stage8_upgrade_downgrade_preserves_legacy_user(tmp_path, monkeypatch):
    root = Path(__file__).resolve().parents[2]
    db_path = tmp_path / "stage8_migration_test.db"
    assert db_path.resolve() != (root / "botforg.db").resolve()
    url = "sqlite:///" + db_path.as_posix()
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "backend" / "migrations").replace("\\", "/"))
    config.set_main_option("sqlalchemy.url", url)
    assert ScriptDirectory.from_config(config).get_heads() == ["user_identity_054"]

    command.upgrade(config, "custom_block_trust_schema_repair_052")
    engine = create_engine(url)
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id, public_id, email, name, hashed_password, role, token_version, plan_code) VALUES (909, 12345678, 'legacy@example.com', 'Legacy', 'legacy-hash', 'user', 0, 'free')"))
    engine.dispose()

    command.upgrade(config, "user_profile_security_053")
    engine = create_engine(url)
    columns = {column["name"] for column in inspect(engine).get_columns("users")}
    assert {"date_of_birth", "phone", "email_verification_required", "session_required"} <= columns
    with engine.connect() as conn:
        row = conn.execute(text("SELECT email, email_verification_required, session_required FROM users WHERE id=909")).one()
        assert row == ("legacy@example.com", 0, 0)
        assert conn.execute(text("SELECT public_id FROM reserved_user_public_ids WHERE public_id=12345678")).scalar_one() == 12345678
    engine.dispose()

    command.upgrade(config, "user_identity_054")
    engine = create_engine(url)
    with engine.begin() as conn:
        legacy = conn.execute(text("SELECT username, username_key FROM users WHERE id=909")).one()
        assert legacy == (None, None)
        conn.execute(text("UPDATE users SET username='Legacy_909', username_key='legacy_909' WHERE id=909"))
        assert conn.execute(text("SELECT username FROM users WHERE id=909")).scalar_one() == "Legacy_909"
    engine.dispose()

    command.downgrade(config, "user_profile_security_053")
    engine = create_engine(url)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT email FROM users WHERE id=909")).scalar_one() == "legacy@example.com"
    engine.dispose()

    command.downgrade(config, "custom_block_trust_schema_repair_052")
    engine = create_engine(url)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT email FROM users WHERE id=909")).scalar_one() == "legacy@example.com"
    engine.dispose()
