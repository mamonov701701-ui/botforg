"""Development legal text is usable locally and never grants production registration."""

import pytest

from backend.models.legal import Consent, LegalDocType
from backend.models.user import User
from backend.services.legal_documents import (
    DEV_TEST_MARKER,
    LegalDocumentError,
    create_draft,
    get_published_by_type,
    list_public_documents,
    publish_revision,
)
from backend.services.legal_launch import required_docs_published
from backend.settings import settings
from backend.tests.conftest import TestingSessionLocal


def _documents():
    with TestingSessionLocal() as db:
        actor = User(email="qa-legal-actor@example.com", name="QA Legal Actor", role="owner", hashed_password="not-for-login")
        db.add(actor)
        db.flush()
        revisions = {}
        for doc_type in (
            LegalDocType.PUBLIC_OFFER.value,
            LegalDocType.PRIVACY_POLICY.value,
            LegalDocType.PERSONAL_DATA_CONSENT.value,
        ):
            is_test = doc_type == LegalDocType.PRIVACY_POLICY.value
            rev = create_draft(
                db, doc_type=doc_type,
                version="DEV-TEST-20261010" if is_test else "1.0",
                title=f"{DEV_TEST_MARKER} Тестовая политика" if is_test else doc_type,
                body_markdown=f"{DEV_TEST_MARKER} Только для локальной разработки." if is_test else f"# {doc_type}",
                actor_user_id=actor.id, commit=False,
            )
            publish_revision(db, revision_id=rev.id, actor_user_id=actor.id, commit=False)
            revisions[doc_type] = rev.id
        db.commit()
        return revisions, actor.id


def test_dev_test_revision_preserves_registration_and_consent_contract(client, monkeypatch):
    revisions, _ = _documents()
    monkeypatch.setattr("backend.auth.email_routes.send_verification_email", lambda *_: "smtp_accepted")
    response = client.post("/auth/email/register", json={
        "email": "dev-legal-qa@example.com", "name": "QA Adult", "username": "dev_legal_qa", "password": "SecretPass123!",
        "date_of_birth": "1990-10-09", "legal_revision_ids": revisions,
        "terms_accepted": True, "privacy_acknowledged": True,
        "personal_data_consent_accepted": True,
    })
    assert response.status_code == 200, response.text
    assert "access_token" not in response.json()
    with TestingSessionLocal() as db:
        user = db.query(User).filter(User.email == "dev-legal-qa@example.com").one()
        consents = {row.doc_type: row.confirmation_result for row in db.query(Consent).filter(Consent.user_id == user.id)}
        assert consents == {
            LegalDocType.PUBLIC_OFFER.value: "accepted",
            LegalDocType.PRIVACY_POLICY.value: "acknowledged",
            LegalDocType.PERSONAL_DATA_CONSENT.value: "accepted",
        }


def test_production_rejects_test_revision_for_registration_and_launch(client, monkeypatch):
    revisions, actor_id = _documents()
    with TestingSessionLocal() as db:
        unpublished = create_draft(
            db, doc_type=LegalDocType.PRIVACY_POLICY.value,
            version="DEV-TEST-UNPUBLISHED", title=f"{DEV_TEST_MARKER} QA",
            body_markdown=f"{DEV_TEST_MARKER} QA", actor_user_id=actor_id,
        )
        unpublished_id = unpublished.id
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    monkeypatch.setattr("backend.auth.email_routes.check_account_rate_limit", lambda *_, **__: None)
    with TestingSessionLocal() as db:
        assert get_published_by_type(db, LegalDocType.PRIVACY_POLICY.value) is None
        assert LegalDocType.PRIVACY_POLICY.value in required_docs_published(db)[1]
        assert all(row.id != revisions[LegalDocType.PRIVACY_POLICY.value] for row in list_public_documents(db))
        with pytest.raises(LegalDocumentError) as error:
            create_draft(db, doc_type=LegalDocType.PRIVACY_POLICY.value,
                         version="DEV-TEST-NEW", title=f"{DEV_TEST_MARKER} QA",
                         body_markdown=f"{DEV_TEST_MARKER} QA", actor_user_id=actor_id,
                         commit=False)
        assert error.value.code == "test_revision_forbidden"
        with pytest.raises(LegalDocumentError) as publish_error:
            publish_revision(db, revision_id=unpublished_id, actor_user_id=actor_id, commit=False)
        assert publish_error.value.code == "test_revision_forbidden"
    response = client.post("/auth/email/register", json={
        "email": "prod-test-refused@example.com", "name": "QA Adult", "username": "prod_test_refused", "password": "SecretPass123!",
        "date_of_birth": "1990-10-09", "legal_revision_ids": revisions,
        "terms_accepted": True, "privacy_acknowledged": True,
        "personal_data_consent_accepted": True,
    })
    assert response.status_code == 503, response.text
    with TestingSessionLocal() as db:
        assert db.query(User).filter(User.email == "prod-test-refused@example.com").count() == 0
