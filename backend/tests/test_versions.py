"""
Tests for scenario versions API.
"""
import pytest
from fastapi.testclient import TestClient

from conftest import create_test_bot, register_and_get_token


def test_get_versions_empty(client: TestClient):
    """New scenario has one version."""
    auth = register_and_get_token(client)
    bot_id = create_test_bot(client, auth)

    create_res = client.post(
        "/scenarios/",
        json={
            "name": "Scenario",
            "icon": "FileText",
            "bot_id": bot_id,
            "content": {"nodes": [], "edges": []},
            "is_main": True,
        },
        headers={"Authorization": auth},
    )
    scenario_id = create_res.json()["id"]

    res = client.get(f"/scenarios/{scenario_id}/versions", headers={"Authorization": auth})
    assert res.status_code == 200
    versions = res.json()
    assert len(versions) >= 1
    assert versions[0]["is_active"] is True


def test_versions_404(client: TestClient):
    """Non-existent scenario returns 404."""
    auth = register_and_get_token(client)
    res = client.get("/scenarios/99999/versions", headers={"Authorization": auth})
    assert res.status_code == 404


def test_restore_version(client: TestClient):
    """Restore scenario from version."""
    auth = register_and_get_token(client)
    bot_id = create_test_bot(client, auth)

    create_res = client.post(
        "/scenarios/",
        json={
            "name": "Scenario",
            "icon": "FileText",
            "bot_id": bot_id,
            "content": {"nodes": [{"id": "1", "data": {"title": "Start"}}], "edges": []},
            "is_main": True,
        },
        headers={"Authorization": auth},
    )
    scenario_id = create_res.json()["id"]

    versions_res = client.get(
        f"/scenarios/{scenario_id}/versions", headers={"Authorization": auth}
    )
    versions = versions_res.json()
    version_id = versions[0]["id"]

    client.put(
        f"/scenarios/{scenario_id}",
        json={"content": {"nodes": [], "edges": []}},
        headers={"Authorization": auth},
    )

    res = client.post(
        f"/scenarios/{scenario_id}/restore/{version_id}",
        headers={"Authorization": auth},
    )
    assert res.status_code == 200
    assert len(res.json()["content"]["nodes"]) == 1
