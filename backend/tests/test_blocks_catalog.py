"""Access and visibility contracts for the block catalogs."""
from __future__ import annotations

from backend.models.user import User
from backend.tests.conftest import TestingSessionLocal, get_user_id, register_and_get_token


def _session():
    return TestingSessionLocal()


def test_user_catalog_requires_auth_and_hides_disabled(client):
    assert client.get("/blocks").status_code == 401

    auth = register_and_get_token(client)
    response = client.get("/blocks", headers={"Authorization": auth})

    assert response.status_code == 200
    assert response.json()
    assert all(item["disabled"] is False for item in response.json())


def test_admin_catalog_is_protected_and_returns_full_source(client):
    auth = register_and_get_token(client)
    user_id = get_user_id(client, auth)
    headers = {"Authorization": auth}

    db = _session()
    try:
        user = db.query(User).filter(User.id == user_id).one()
        user.role = "user"
        db.commit()
    finally:
        db.close()

    assert client.get("/blocks/admin-catalog", headers=headers).status_code == 403

    db = _session()
    try:
        user = db.query(User).filter(User.id == user_id).one()
        user.role = "owner"
        db.commit()
    finally:
        db.close()

    response = client.get("/blocks/admin-catalog", headers=headers)
    assert response.status_code == 200
    ids = {item["id"] for item in response.json()}
    assert {"start", "message", "input", "condition", "set_variable", "end"} <= ids
    assert {"variable", "action"} <= ids
