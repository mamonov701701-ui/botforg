"""
Тесты API тарифов (Plans).
"""
import pytest

from backend.tests.conftest import register_and_get_token


def test_get_plans(client):
    """GET /plans — список тарифов (без авторизации); endpoint deprecated, контракт прежний."""
    res = client.get("/plans/")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 4
    assert len(data["items"]) >= 4
    codes = [p["code"] for p in data["items"]]
    assert "free" in codes
    assert "pro" in codes
    assert "team" in codes
    assert "developer" in codes
    free = next(p for p in data["items"] if p["code"] == "free")
    assert free["limits"]["max_bots"] == 1
    assert free["limits"]["can_publish"] is False
    dev = next(p for p in data["items"] if p["code"] == "developer")
    assert dev["limits"]["max_bots"] == 10
    assert dev["limits"]["can_publish_templates"] is True
    assert dev["limits"]["can_sell_templates"] is True
    assert dev["limits"]["can_view_marketplace_stats"] is True


def test_get_plans_route_marked_deprecated(client):
    """OpenAPI marks legacy GET /plans/ as deprecated."""
    schema = client.get("/openapi.json").json()
    path_item = schema["paths"].get("/plans/") or schema["paths"].get("/plans")
    assert path_item is not None
    assert path_item["get"].get("deprecated") is True


def test_me_has_plan_code(client):
    """GET /me — план пользователя в ответе."""
    auth = register_and_get_token(client)
    res = client.get("/me", headers={"Authorization": auth})
    assert res.status_code == 200
    assert res.json().get("plan_code") == "free"


def test_change_plan(client):
    """POST /me/plan — смена тарифа (mock)."""
    auth = register_and_get_token(client)
    res = client.post(
        "/me/plan",
        json={"plan_code": "pro"},
        headers={"Authorization": auth},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["plan_code"] == "pro"
    assert data["name"] == "Pro"
    assert data["limits"]["max_bots"] == 5

    res_me = client.get("/me", headers={"Authorization": auth})
    assert res_me.json()["plan_code"] == "pro"


def test_change_plan_requires_auth(client):
    """POST /me/plan — требует авторизации."""
    res = client.post("/me/plan", json={"plan_code": "pro"})
    assert res.status_code == 401


def test_change_plan_to_developer(client):
    """POST /me/plan — смена на тариф Developer."""
    auth = register_and_get_token(client)
    res = client.post(
        "/me/plan",
        json={"plan_code": "developer"},
        headers={"Authorization": auth},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["plan_code"] == "developer"
    assert data["name"] == "Developer"
    assert data["limits"]["max_bots"] == 10
    assert data["limits"]["can_publish_templates"] is True
    assert data["limits"]["can_sell_templates"] is True
    assert data["limits"]["can_view_marketplace_stats"] is True


def test_change_plan_invalid(client):
    """POST /me/plan — несуществующий тариф."""
    auth = register_and_get_token(client)
    res = client.post(
        "/me/plan",
        json={"plan_code": "invalid"},
        headers={"Authorization": auth},
    )
    assert res.status_code == 404
