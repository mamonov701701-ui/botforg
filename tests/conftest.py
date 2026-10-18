import os
import sys
import uuid
from pathlib import Path

import pytest

# Добавляем корень проекта в sys.path для корректного импорта backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

_root = Path(__file__).resolve().parents[1]
_qa_dir = (_root / "qa_artifacts").resolve()
_qa_dir.mkdir(exist_ok=True)
_test_db = (_qa_dir / f"root_pytest_{uuid.uuid4().hex}.db").resolve()
if _test_db.parent != _qa_dir or _test_db == (_root / "botforg.db").resolve():
    raise RuntimeError("Root pytest database is not isolated")
os.environ["DATABASE_URL"] = f"sqlite:///{_test_db.as_posix()}"
os.environ["ENVIRONMENT"] = "development"
os.environ["TESTING"] = "true"

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402

_alembic = Config(str(_root / "alembic.ini"))
_alembic.set_main_option("script_location", str(_root / "backend" / "migrations"))
command.upgrade(_alembic, "head")


@pytest.fixture(scope="session", autouse=True)
def published_test_legal_revisions():
    """Only the isolated root-suite DB gets explicitly marked test revisions."""
    from backend.database import SessionLocal
    from backend.models.legal import LegalDocType
    from backend.models.user import User
    from backend.services.legal_documents import create_draft, publish_revision

    with SessionLocal() as db:
        owner = User(email="root-suite-owner@example.com", name="Root Suite Owner", role="owner",
                     hashed_password="not-for-login")
        db.add(owner)
        db.flush()
        for kind in (LegalDocType.PUBLIC_OFFER.value, LegalDocType.PRIVACY_POLICY.value,
                     LegalDocType.PERSONAL_DATA_CONSENT.value):
            revision = create_draft(
                db, doc_type=kind, version="DEV-TEST-ROOT-SUITE",
                title=f"[DEV TEST] {kind}", body_markdown=f"[DEV TEST] {kind}",
                actor_user_id=owner.id, commit=False,
            )
            publish_revision(db, revision_id=revision.id, actor_user_id=owner.id, commit=False)
        db.commit()


def register_verified_test_user(client, *, email: str, password: str, name: str):
    """Use the real registration contract, then confirm only this test DB account."""
    from backend.database import SessionLocal
    from backend.models.user import User
    from backend.services.account_security import utcnow

    docs = client.get("/legal/documents").json()
    revisions = {row["doc_type"]: row["id"] for row in docs}
    response = client.post("/auth/email/register", json={
        "email": email, "password": password, "name": name,
        "username": f"root_{uuid.uuid4().hex[:16]}", "date_of_birth": "1990-10-09",
        "legal_revision_ids": revisions, "terms_accepted": True,
        "privacy_acknowledged": True, "personal_data_consent_accepted": True,
    })
    assert response.status_code == 200, response.text
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).one()
        user.email_verified_at = utcnow()
        db.commit()
    return response
