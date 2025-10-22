import pytest
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

@pytest.fixture(scope="module")
def test_user():
    return {"email": "testuser@example.com", "password": "testpass", "name": "Test User"}

def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200

def test_register_and_login(test_user):
    # Register
    resp = client.post("/auth/register", json={"email": test_user["email"], "password": test_user["password"], "name": test_user["name"], "role": "user"})
    print("🔍 REGISTER STATUS:", resp.status_code)
    print("🔍 REGISTER RESPONSE:", resp.text)
    assert resp.status_code == 200 or resp.status_code == 400  # Может быть уже зарегистрирован
    # Login — отправляем form-data
    resp = client.post(
        "/auth/login",
        data={"username": test_user["email"], "password": test_user["password"]},
        headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    assert resp.status_code == 200
    token = resp.json().get("access_token")
    assert token
    test_user["token"] = token

def test_templates_crud(test_user):
    headers = {"Authorization": f"Bearer {test_user['token']}"}
    resp = client.get("/templates", headers=headers)
    assert resp.status_code == 200
    tpl = {"name": "Тестовый шаблон", "description": "desc", "category": "test", "is_public": False}
    resp = client.post("/templates", json=tpl, headers=headers)
    assert resp.status_code == 200
    tpl_id = resp.json()["id"]
    resp = client.patch(f"/templates/{tpl_id}", json={"description": "updated"}, headers=headers)
    assert resp.status_code == 200

def test_bots_connect(test_user):
    headers = {"Authorization": f"Bearer {test_user['token']}"}
    data = {"token": "123:mocktoken", "template_id": 1}
    resp = client.post("/bots/connect", json=data, headers=headers)
    assert resp.status_code in (200, 400)

def test_review(test_user):
    headers = {"Authorization": f"Bearer {test_user['token']}"}
    # Делаем шаблон публичным
    resp = client.patch("/templates/1", json={"is_public": True}, headers=headers)
    # POST /templates/{id}/review
    resp = client.post("/templates/1/review", json={"rating": 5, "text": "Отлично!"}, headers=headers)
    assert resp.status_code in (200, 400)  # 400 если уже есть отзыв

def test_import_export(test_user):
    headers = {"Authorization": f"Bearer {test_user['token']}"}
    tpl = {"nodes": [], "edges": []}
    resp = client.post("/templates/import", json=tpl, headers=headers)
    assert resp.status_code == 201
    tpl_id = resp.json()["id"]
    resp = client.get(f"/templates/{tpl_id}", headers=headers)
    assert resp.status_code == 200 