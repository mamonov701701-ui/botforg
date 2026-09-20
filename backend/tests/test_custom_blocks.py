from copy import deepcopy

from backend.models.custom_block import CustomBlockVersion
from backend.models.scenario import Scenario
from backend.tests.conftest import TestingSessionLocal, register_and_get_token


def _headers(client):
    return {"Authorization": register_and_get_token(client)}


def _valid_payload(title="Подтверждение заказа"):
    return {
        "title": title,
        "description": "Отправляет понятное подтверждение клиенту.",
        "purpose": "Подтвердить, что заказ принят.",
        "when_to_use": "После заполнения заказа.",
        "category": "custom",
        "inputs": [{"name": "order_id"}],
        "outputs": [{"name": "message_sent"}],
        "config_schema": [{"name": "text", "type": "text", "label": "Текст сообщения", "required": True}],
        "connection_rules": {"max_inputs": 1, "max_outputs": 1},
        "runtime_compatibility": "message",
        "simulator_compatibility": True,
        "supported_channels": ["telegram"],
        "limitations": ["Один исходящий переход"],
        "examples": ["После ввода показать подтверждение"],
        "user_guide": {"content": "Добавьте блок, заполните текст и соедините со следующим шагом."},
        "runtime_definition": {"kind": "message"},
    }


def _create(client, headers, payload=None):
    response = client.post("/blocks/custom/drafts", headers=headers, json=payload or _valid_payload())
    assert response.status_code == 201, response.text
    return response.json()


def test_custom_block_draft_update_validate_publish_and_immutable(client):
    headers = _headers(client)
    draft = _create(client, headers)
    assert draft["status_label"] == "Черновик"
    changed = _valid_payload("Подтверждение оплаты")
    updated = client.put(f"/blocks/custom/{draft['id']}", headers=headers, json=changed)
    assert updated.status_code == 200
    validation = client.post(f"/blocks/custom/{draft['id']}/validate", headers=headers, json={})
    assert validation.json() == {"valid": True, "errors": [], "warnings": []}
    published = client.post(f"/blocks/custom/{draft['id']}/publish", headers=headers, json={})
    assert published.status_code == 200
    assert published.json()["passport"]["lifecycle_status"] == "published"
    assert client.put(f"/blocks/custom/{draft['id']}", headers=headers, json=_valid_payload()).status_code == 409


def test_invalid_draft_cannot_publish(client):
    headers = _headers(client)
    payload = _valid_payload()
    payload.update({"purpose": "", "examples": [], "user_guide": {"content": ""}, "config_schema": []})
    draft = _create(client, headers, payload)
    response = client.post(f"/blocks/custom/{draft['id']}/publish", headers=headers, json={})
    assert response.status_code == 422
    assert "Блок не прошёл проверку" in response.text


def test_owner_only_and_system_code_collision(client):
    owner = _headers(client)
    draft = _create(client, owner)
    stranger = _headers(client)
    assert client.put(f"/blocks/custom/{draft['id']}", headers=stranger, json=_valid_payload()).status_code == 403
    collision = _valid_payload()
    collision["internal_code"] = "message"
    assert client.post("/blocks/custom/drafts", headers=owner, json=collision).status_code == 409


def test_version_archive_restore_and_catalog_selection(client):
    headers = _headers(client)
    v1 = _create(client, headers)
    assert client.post(f"/blocks/custom/{v1['id']}/publish", headers=headers, json={}).status_code == 200
    catalog = client.get("/blocks", headers=headers).json()
    custom = next(item for item in catalog if item.get("source") == "custom")
    assert custom["blockVersionId"] == v1["id"]
    assert custom["runtimeBlockId"] == "message"

    v2 = client.post(f"/blocks/custom/{v1['id']}/versions", headers=headers, json={}).json()
    changed = _valid_payload("Подтверждение заказа — новая версия")
    changed["user_guide"] = {"content": "Инструкция только для версии 2."}
    assert client.put(f"/blocks/custom/{v2['id']}", headers=headers, json=changed).status_code == 200
    assert client.post(f"/blocks/custom/{v2['id']}/publish", headers=headers, json={}).status_code == 200
    original = client.get(f"/blocks/custom/{v1['id']}", headers=headers).json()
    assert original["title"] == "Подтверждение заказа"
    assert "Добавьте блок" in original["user_guide"]["content"]
    catalog = client.get("/blocks", headers=headers).json()
    custom = next(item for item in catalog if item.get("source") == "custom")
    assert custom["blockVersionId"] == v2["id"]

    assert client.post(f"/blocks/custom/{v2['id']}/archive", headers=headers, json={}).status_code == 200
    catalog = client.get("/blocks", headers=headers).json()
    assert next(item for item in catalog if item.get("source") == "custom")["blockVersionId"] == v1["id"]
    restored = client.post(f"/blocks/custom/{v2['id']}/restore", headers=headers, json={})
    assert restored.status_code == 200
    assert restored.json()["status_label"] == "Опубликован"


def test_archiving_only_published_version_removes_it_from_new_block_catalog(client):
    headers = _headers(client)
    version = _create(client, headers)
    assert client.post(f"/blocks/custom/{version['id']}/publish", headers=headers, json={}).status_code == 200
    assert any(item.get("blockVersionId") == version["id"] for item in client.get("/blocks", headers=headers).json())

    assert client.post(f"/blocks/custom/{version['id']}/archive", headers=headers, json={}).status_code == 200
    assert all(item.get("blockVersionId") != version["id"] for item in client.get("/blocks", headers=headers).json())


def test_archived_version_remains_referenced_by_existing_scenario(client):
    headers = _headers(client)
    v1 = _create(client, headers)
    client.post(f"/blocks/custom/{v1['id']}/publish", headers=headers, json={})
    node = {"id": "custom-node", "type": "default", "data": {"blockId": "message", "customBlockVersionId": v1["id"], "customBlockStableId": v1["stable_block_id"], "customBlockVersion": 1, "settings": {"text": "Заказ принят"}}}
    scenario = client.post("/scenarios/", headers=headers, json={"name": "Сценарий", "content": {"nodes": [node], "edges": []}})
    assert scenario.status_code == 201
    client.post(f"/blocks/custom/{v1['id']}/archive", headers=headers, json={})
    with TestingSessionLocal() as db:
        saved = db.query(Scenario).filter(Scenario.id == scenario.json()["id"]).one()
        assert saved.content["nodes"][0]["data"]["customBlockVersionId"] == v1["id"]
    assert client.put(f"/scenarios/{scenario.json()['id']}", headers=headers, json={"content": {"nodes": [node], "edges": []}}).status_code == 200
    assert client.post("/scenarios/", headers=headers, json={"name": "Новый", "content": {"nodes": [node], "edges": []}}).status_code == 422
    assert client.get(f"/blocks/custom/{v1['id']}", headers=headers).json()["user_guide"]["content"]


def test_safe_delete_only_unused_draft(client):
    headers = _headers(client)
    draft = _create(client, headers)
    assert client.delete(f"/blocks/custom/{draft['id']}", headers=headers).status_code == 204
    published = _create(client, headers)
    client.post(f"/blocks/custom/{published['id']}/publish", headers=headers, json={})
    assert client.delete(f"/blocks/custom/{published['id']}", headers=headers).status_code == 409


def test_admin_catalog_requires_admin_and_lists_owner(client):
    headers = _headers(client)
    _create(client, headers)
    with TestingSessionLocal() as db:
        from backend.models.user import User
        user = db.query(User).first()
        user.role = "viewer"
        db.commit()
    assert client.get("/blocks/custom/admin", headers=headers).status_code == 403
    with TestingSessionLocal() as db:
        from backend.models.user import User
        user = db.query(User).first()
        user.role = "admin"
        db.commit()
    response = client.get("/blocks/custom/admin", headers=headers)
    assert response.status_code == 200
    assert response.json()[0]["owner_user_id"]
