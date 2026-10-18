"""Public identity and account alert regressions for Stage 8."""

from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy.exc import IntegrityError

from backend.auth.rate_limit import rate_limit_store
from backend.models.auth import SecurityAuditEvent
from backend.models.notification import NotificationOutbox
from backend.models.user import User
from backend.security import get_password_hash
from backend.services.usernames import UsernameError, normalize_username
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token
from backend.tests.test_custom_block_marketplace import _listing, _published_version
from backend.tests.test_auth import _legal_acceptances, _registration_docs


@pytest.mark.parametrize("value,key", [
    ("Alex_777", "alex_777"),
    ("Александр.7", "александр.7"),
    ("Ёжик-3", "ёжик-3"),
])
def test_username_canonical_values(value, key):
    assert normalize_username(value) == (value, key)


@pytest.mark.parametrize("value", [
    "a", "admin", "админ", "аlex", "alех", "hello world", "user😀",
    "user\u200b", "user\n", "user..one", ".user", "user-", "ａｌｅｘ",
    "A\u030alex", "notallowed!", "a" * 31,
])
def test_username_rejects_ambiguous_and_unsafe_values(value):
    with pytest.raises(UsernameError):
        normalize_username(value)


def test_existing_account_claim_is_one_time_and_unique(client):
    first = {"Authorization": register_and_get_token(client)}
    second = {"Authorization": register_and_get_token(client)}
    assert client.get("/me", headers=first).json()["username"] is None
    assert client.post("/me/username", headers=first, json={"username": "Alex_777"}).status_code == 200
    assert client.post("/me/username", headers=first, json={"username": "Other_777"}).status_code == 409
    assert client.post("/me/username", headers=second, json={"username": "alex_777"}).status_code == 409
    response = client.post("/me/username", headers=second, json={"username": "Саша_777"})
    assert response.status_code == 200, response.text
    assert response.json()["username"] == "Саша_777"
    assert client.get("/me", headers=first).json()["username"] == "Alex_777"


def test_database_constraint_resolves_competing_claims():
    with TestingSessionLocal() as db:
        db.add_all([
            User(email="race-a@example.com", name="Same", username="Alex", username_key="alex"),
            User(email="race-b@example.com", name="Same", username="aLeX", username_key="alex"),
        ])
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


def test_concurrent_registration_only_one_username_wins(client, monkeypatch):
    revisions = _registration_docs()
    monkeypatch.setattr("backend.auth.email_routes.send_verification_email", lambda *_: "test_capture")

    def register(number: int) -> int:
        response = client.post("/auth/email/register", json={
            "email": f"race-registration-{number}@example.com", "name": "Same Name",
            "username": "ОбщийНик_7" if number == 1 else "общийник_7",
            "password": "SecretPass123!", "date_of_birth": "1990-10-09",
            "legal_revision_ids": revisions, **_legal_acceptances(),
        })
        return response.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(register, (1, 2)))
    assert sorted(statuses) == [200, 409]
    with TestingSessionLocal() as db:
        assert db.query(User).filter(User.username_key == "общийник_7").count() == 1


def test_concurrent_claim_cannot_replace_first_username(client):
    headers = {"Authorization": register_and_get_token(client)}

    def claim(value: str) -> int:
        return client.post("/me/username", headers=headers, json={"username": value}).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(claim, ("First_Nick", "Second_Nick")))
    assert sorted(statuses) == [200, 409]
    assert client.get("/me", headers=headers).json()["username"] in {"First_Nick", "Second_Nick"}


def test_availability_and_contact_identity_without_email_leak(client):
    first = {"Authorization": register_and_get_token(client)}
    other = {"Authorization": register_and_get_token(client)}
    assert client.post("/me/username", headers=first, json={"username": "Александр_7"}).status_code == 200
    assert client.get("/auth/email/username-availability", params={"username": "АЛЕКСАНДР_7"}).json()["available"] is False
    assert client.get("/auth/email/username-availability", params={"username": "new_user_7"}).json()["available"] is True
    response = client.get("/chat/users/search", params={"query": "@александр_7"}, headers=other)
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["username"] == "Александр_7"
    assert "email" not in items[0]


def test_marketplace_author_display_changes_without_ownership_change(client):
    owner_token = register_and_get_token(client)
    consumer_token = register_and_get_token(client)
    owner = {"Authorization": owner_token}
    consumer = {"Authorization": consumer_token}
    owner_id = get_user_id(client, owner_token)
    assert client.post("/me/username", headers=owner, json={"username": "Market_Author"}).status_code == 200
    version_id, _ = _published_version(client, owner_token, "-identity")
    listing_id = _listing(client, owner_token, version_id)
    before = client.get(f"/custom-block-marketplace/listings/{listing_id}", headers=consumer).json()
    assert before["author"] == {"id": owner_id, "name": "Tester", "username": "Market_Author"}
    assert client.patch("/me", headers=owner, json={"name": "Новое имя"}).status_code == 200
    after = client.get(f"/custom-block-marketplace/listings/{listing_id}", headers=consumer).json()
    assert after["author"] == {"id": owner_id, "name": "Новое имя", "username": "Market_Author"}
    assert after["id"] == before["id"] and after["version"] == before["version"]


def test_failed_login_alert_threshold_and_daily_cooldown(client):
    with TestingSessionLocal() as db:
        user = User(
            email="alert-owner@example.com", name="Alert Owner", username="alert_owner",
            username_key="alert_owner", hashed_password=get_password_hash("CorrectPass123!"),
            email_verified_at=datetime.utcnow(),
        )
        db.add(user)
        db.commit()
        user_id = user.id

    for index in range(4):
        wrong = client.post("/auth/email/login", json={"email": "alert-owner@example.com", "password": "WrongPass123!"})
        assert wrong.status_code == 401
        if index == 0:
            unknown = client.post("/auth/email/login", json={"email": "unknown@example.com", "password": "WrongPass123!"})
            assert unknown.status_code == 401
            assert wrong.json() == unknown.json()
        with TestingSessionLocal() as db:
            count = db.query(NotificationOutbox).filter_by(event_type="repeated_login_failures").count()
            assert count == (1 if index == 3 else 0)

    rate_limit_store.clear()  # simulate the next limiter window; no second daily email
    assert client.post("/auth/email/login", json={"email": "alert-owner@example.com", "password": "WrongPass123!"}).status_code == 401
    with TestingSessionLocal() as db:
        assert db.query(NotificationOutbox).filter_by(event_type="repeated_login_failures").count() == 1
        assert db.query(SecurityAuditEvent).filter_by(user_id=user_id, event_type="login_failed").count() == 5
