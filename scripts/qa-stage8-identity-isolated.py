"""Isolated Stage 8 browser QA API; never opens the development database."""

import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

db_path = (ROOT / "qa_artifacts" / f"identity_smoke_{uuid.uuid4().hex}.db").resolve()
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

from backend.database import SessionLocal
from backend.models.legal import LegalDocType
from backend.models.user import User
from backend.security import get_password_hash
from backend.services.legal_documents import create_draft, publish_revision
from backend.settings import settings

assert Path(settings.DATABASE_URL.removeprefix("sqlite:///")) == db_path
settings.TESTING = True  # No background maintenance; SMTP still uses loopback transport.
with SessionLocal() as db:
    owner = User(
        email="qa-owner@example.com", name="QA Owner", role="owner",
        hashed_password=get_password_hash("QaOwnerPass123!"),
        email_verified_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    contact = User(
        email="qa-contact@example.com", name="QA Owner", username="Contact_QA_7",
        username_key="contact_qa_7", role="user",
        hashed_password="not-for-login",
        email_verified_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add_all([owner, contact])
    db.flush()
    for kind in (LegalDocType.PUBLIC_OFFER.value, LegalDocType.PRIVACY_POLICY.value, LegalDocType.PERSONAL_DATA_CONSENT.value):
        document = create_draft(
            db, doc_type=kind, version="DEV-TEST-IDENTITY",
            title=f"[DEV TEST] {kind}", body_markdown=f"[DEV TEST] {kind}\nТолько для изолированной QA базы.",
            actor_user_id=owner.id, commit=False,
        )
        publish_revision(db, revision_id=document.id, actor_user_id=owner.id, commit=False)
    db.commit()

from backend.main import app
import uvicorn

print("ISOLATED_IDENTITY_API_READY database=qa_artifacts/identity_smoke_*.db", flush=True)
uvicorn.run(app, host="127.0.0.1", port=18001, access_log=False, log_level="warning")
