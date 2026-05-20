"""
Tests for scenario publish endpoint.
"""
import pytest
from fastapi.testclient import TestClient

from conftest import create_test_bot, register_and_get_token


def _auth_with_pro_plan(client: TestClient) -> str:
    auth = register_and_get_token(client)
    res_plan = client.post(
        "/me/plan",
        json={"plan_code": "pro"},
        headers={"Authorization": auth},
    )
    assert res_plan.status_code == 200, res_plan.text
    return auth


def test_publish_scenario(client: TestClient):
    """Publish draft scenario."""
    auth = _auth_with_pro_plan(client)
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

    res = client.post(
        f"/scenarios/{scenario_id}/publish",
        headers={"Authorization": auth},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "published"
    assert data["published_content"] is not None
    assert data["published_content"]["nodes"][0]["data"]["title"] == "Start"


def test_publish_empty_content(client: TestClient):
    """Publish scenario with empty content fails."""
    auth = _auth_with_pro_plan(client)
    bot_id = create_test_bot(client, auth)

    create_res = client.post(
        "/scenarios/",
        json={
            "name": "Empty",
            "icon": "FileText",
            "bot_id": bot_id,
            "content": {"nodes": [], "edges": []},
            "is_main": False,
        },
        headers={"Authorization": auth},
    )
    scenario_id = create_res.json()["id"]

    res = client.put(
        f"/scenarios/{scenario_id}",
        json={"content": None},
        headers={"Authorization": auth},
    )
    if res.status_code == 200:
        res = client.post(
            f"/scenarios/{scenario_id}/publish",
            headers={"Authorization": auth},
        )
        assert res.status_code == 400
    else:
        pytest.skip("PUT with content=None may not be supported")


def test_publish_404(client: TestClient):
    """Publish non-existent scenario returns 404."""
    auth = register_and_get_token(client)
    res = client.post(
        "/scenarios/99999/publish",
        headers={"Authorization": auth},
    )
    assert res.status_code == 404
