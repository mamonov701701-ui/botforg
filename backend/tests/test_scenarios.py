"""
Tests for scenario CRUD endpoints.
"""
import uuid
from unittest.mock import Mock, patch

import pytest
from fastapi.testclient import TestClient

from conftest import create_test_bot, register_and_get_token


def test_get_bot_scenarios_includes_main(client: TestClient):
    """Get scenarios for bot: при подключении бота автоматически создаётся главный сценарий."""
    auth = register_and_get_token(client)
    bot_id = create_test_bot(client, auth)

    res = client.get(f"/scenarios/bot/{bot_id}", headers={"Authorization": auth})
    assert res.status_code == 200
    scenarios = res.json()
    # При /bots/connect создаётся главный сценарий
    assert len(scenarios) >= 1
    main = next((s for s in scenarios if s.get("is_main")), None)
    assert main is not None
    assert main["bot_id"] == bot_id
    assert main["status"] in ("draft", "published")


def test_create_scenario(client: TestClient):
    """Create scenario in bot."""
    auth = register_and_get_token(client)
    bot_id = create_test_bot(client, auth)

    res = client.post(
        "/scenarios/",
        json={
            "name": "Test Scenario",
            "icon": "FileText",
            "bot_id": bot_id,
            "content": {"nodes": [], "edges": []},
            "is_main": True,
        },
        headers={"Authorization": auth},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Test Scenario"
    assert data["status"] == "draft"
    assert data["bot_id"] == bot_id


def test_update_scenario(client: TestClient):
    """Update scenario content."""
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

    res = client.put(
        f"/scenarios/{scenario_id}",
        json={"content": {"nodes": [{"id": "1", "data": {"title": "Start"}}], "edges": []}},
        headers={"Authorization": auth},
    )
    assert res.status_code == 200
    assert res.json()["content"]["nodes"][0]["data"]["title"] == "Start"


def test_get_scenario_versions(client: TestClient):
    """Get scenario versions after update."""
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

    client.put(
        f"/scenarios/{scenario_id}",
        json={"content": {"nodes": [], "edges": []}},
        headers={"Authorization": auth},
    )

    res = client.get(f"/scenarios/{scenario_id}/versions", headers={"Authorization": auth})
    assert res.status_code == 200
    versions = res.json()
    assert isinstance(versions, list)
    assert len(versions) >= 1
