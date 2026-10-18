"""One-off local QA server; never imports BotForg before choosing an isolated DB."""

import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

db_path = (ROOT / "qa_artifacts" / f"reset_smoke_{uuid.uuid4().hex}.db").resolve()
assert db_path.parent == (ROOT / "qa_artifacts").resolve()
assert db_path != (ROOT / "botforg.db").resolve()
db_path.parent.mkdir(parents=True, exist_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
os.environ["ENVIRONMENT"] = "development"
os.environ["SMTP_HOST"] = "127.0.0.1"
os.environ["SMTP_PORT"] = "1025"
os.environ["SMTP_USE_TLS"] = "false"
os.environ["EMAIL_FROM"] = "BotForg QA <qa@example.invalid>"
os.environ["FRONTEND_URL"] = "http://127.0.0.1:5173"
os.environ.pop("TESTING", None)

from alembic import command
from alembic.config import Config

cfg = Config(str(ROOT / "alembic.ini"))
cfg.set_main_option("script_location", str(ROOT / "backend" / "migrations"))
command.upgrade(cfg, "head")

from backend.auth.password import hash_password
from backend.database import SessionLocal
from backend.models.user import User
from backend.settings import settings

assert Path(settings.DATABASE_URL.removeprefix("sqlite:///")) == db_path
settings.TESTING = True  # Disables unrelated background maintenance, not SMTP transport.
with SessionLocal() as db:
    value = hash_password("QaOriginal123!")
    db.add(User(
        email="stage8-reset-qa@example.com", name="Reset QA",
        hashed_password=value, password_hash=value,
        email_verified_at=datetime.now(timezone.utc).replace(tzinfo=None),
        email_verification_required=True,
    ))
    db.commit()

from backend.main import app
import uvicorn

print("ISOLATED_RESET_API_READY database=qa_artifacts/reset_smoke_*.db", flush=True)
uvicorn.run(app, host="127.0.0.1", port=18001, access_log=False, log_level="warning")
