from copy import deepcopy
import re

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


def _javascript_payload(output_count=15):
    payload = _valid_payload("Маршрутизатор заказа")
    outputs = [
        {
            "name": "success" if index == 0 else f"route_{index + 1}",
            "display_name": "Успех" if index == 0 else f"Маршрут {index + 1}",
            "type": "json",
        }
        for index in range(output_count)
    ]
    payload.update({
        "outputs": outputs,
        "config_schema": [],
        "connection_rules": {
            "input_count": 1,
            "output_count": output_count,
            "max_inputs": 1,
            "max_outputs": output_count,
        },
        "runtime_compatibility": "javascript",
        "runtime_definition": {"kind": "javascript"},
        "execution_spec": {
            "schema_version": 1,
            "language": "javascript",
            "runtime_profile": "quickjs-wasm-v1",
            "source": f"function run(envelope) {{ return {{ outputs: {{}}, route: '{outputs[0]['name']}', logs: [] }}; }}",
            "inputs": payload["inputs"],
            "outputs": outputs,
            "settings_schema": [],
            "capabilities": {
                "network": False,
                "filesystem": False,
                "secrets": False,
                "database": False,
                "persistence": False,
                "dependencies": False,
                "subprocess": False,
                "platform_api": False,
            },
            "resource_profile": {
                "wall_clock_ms": 750,
                "cpu_ms": 500,
                "memory_mb": 32,
                "max_source_bytes": 32768,
                "max_input_bytes": 16384,
                "max_output_bytes": 16384,
                "max_log_entries": 20,
                "max_log_entry_bytes": 512,
                "max_log_bytes": 4096,
            },
        },
    })
    return payload


def _create(client, headers, payload=None):
    response = client.post("/blocks/custom/drafts", headers=headers, json=payload or _valid_payload())
    assert response.status_code == 201, response.text
    return response.json()


def _publish(client, headers, version_id):
    """Stage 7.8 publication contract: submit, then an authorized admin approves."""
    assert client.post(f"/blocks/custom/{version_id}/submit-review", headers=headers, json={}).status_code == 200
    with TestingSessionLocal() as db:
        from backend.models.user import User
        db.query(User).filter(User.id == 1).one().role = "admin"
        db.commit()
    assert client.post(
        f"/blocks/custom/{version_id}/admin-review", headers=headers,
        json={"decision": "approve", "comment": "test approval"},
    ).status_code == 200
    return client.post(f"/blocks/custom/{version_id}/publish", headers=headers, json={})


def test_custom_block_draft_update_validate_publish_and_immutable(client):
    headers = _headers(client)
    draft = _create(client, headers)
    assert draft["status_label"] == "Черновик"
    changed = _valid_payload("Подтверждение оплаты")
    updated = client.put(f"/blocks/custom/{draft['id']}", headers=headers, json=changed)
    assert updated.status_code == 200
    validation = client.post(f"/blocks/custom/{draft['id']}/validate", headers=headers, json={})
    assert validation.json() == {"valid": True, "errors": [], "warnings": []}
    published = _publish(client, headers, draft['id'])
    assert published.status_code == 200
    assert published.json()["passport"]["lifecycle_status"] == "published"
    assert client.put(f"/blocks/custom/{draft['id']}", headers=headers, json=_valid_payload()).status_code == 409


def test_invalid_draft_cannot_publish(client):
    headers = _headers(client)
    payload = _valid_payload()
    payload.update({"purpose": "", "examples": [], "user_guide": {"content": ""}, "config_schema": []})
    draft = _create(client, headers, payload)
    response = client.post(f"/blocks/custom/{draft['id']}/submit-review", headers=headers, json={})
    assert response.status_code == 422
    assert "Блок не прошёл проверку" in response.text


def test_message_fallback_rejects_multiple_outputs(client):
    headers = _headers(client)
    payload = _valid_payload()
    payload["outputs"] = [
        {"name": "success", "display_name": "Успех"},
        {"name": "error", "display_name": "Ошибка"},
    ]
    payload["connection_rules"] = {"input_count": 1, "output_count": 2}
    draft = _create(client, headers, payload)
    validation = client.post(f"/blocks/custom/{draft['id']}/validate", headers=headers, json={})
    assert validation.status_code == 200
    assert validation.json()["valid"] is False
    assert any("Message fallback" in error for error in validation.json()["errors"])
    assert client.post(f"/blocks/custom/{draft['id']}/submit-review", headers=headers, json={}).status_code == 422


def test_javascript_mode_round_trip_validates_and_publishes_with_fifteen_outputs(client):
    headers = _headers(client)
    draft = _create(client, headers, _valid_payload())

    changed = client.put(
        f"/blocks/custom/{draft['id']}",
        headers=headers,
        json=_javascript_payload(),
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["runtime_kind"] == "javascript"
    assert changed.json()["runtime_definition"]["kind"] == "javascript"
    assert changed.json()["execution_spec"]["source"].startswith("function run")

    reloaded = client.get(f"/blocks/custom/{draft['id']}", headers=headers)
    assert reloaded.status_code == 200
    assert reloaded.json()["runtime_kind"] == "javascript"
    assert reloaded.json()["runtime_definition"]["kind"] == "javascript"
    assert len(reloaded.json()["execution_spec"]["outputs"]) == 15

    validation = client.post(f"/blocks/custom/{draft['id']}/validate", headers=headers, json={})
    assert validation.json() == {"valid": True, "errors": [], "warnings": []}
    published = _publish(client, headers, draft['id'])
    assert published.status_code == 200, published.text
    assert published.json()["runtime_kind"] == "javascript"


def test_draft_round_trip_preserves_multiline_javascript_and_wizard_step(client):
    headers = _headers(client)
    payload = _javascript_payload()
    source = """function run(envelope) {
  return {
    outputs: {},
    route: "success",
    logs: []
  };
}"""
    payload["execution_spec"]["source"] = source
    payload["wizard_step"] = 7
    draft = _create(client, headers, payload)
    assert draft["execution_spec"]["source"] == source
    assert draft["passport"]["wizard_step"] == 7
    reloaded = client.get(f"/blocks/custom/{draft['id']}", headers=headers).json()
    assert reloaded["execution_spec"]["source"] == source
    assert reloaded["passport"]["wizard_step"] == 7


def test_too_long_input_display_name_is_sanitized_in_russian(client):
    headers = _headers(client)
    payload = _javascript_payload()
    payload["inputs"][0]["display_name"] = "А" * 97
    payload["execution_spec"]["inputs"] = payload["inputs"]
    response = client.post("/blocks/custom/drafts", headers=headers, json=payload)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "слишком длинное" in detail
    assert "96" in detail
    assert "String should" not in detail


def test_execution_spec_rejects_invalid_input_identifier_without_raw_schema_error(client):
    headers = _headers(client)
    payload = _javascript_payload()
    payload["inputs"] = [{"name": "Текст сообщения", "display_name": "Текст сообщения"}]
    payload["execution_spec"]["inputs"] = payload["inputs"]

    response = client.post("/blocks/custom/drafts", headers=headers, json=payload)
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail == "Шаг 5 «Выполнение»: некорректный машинный ключ входа 1"
    assert "pattern" not in detail.lower()
    assert "^[a-z]" not in detail


def test_generated_execution_identifiers_match_backend_contract():
    payload = _javascript_payload()
    identifiers = [
        port["name"]
        for port in payload["execution_spec"]["inputs"] + payload["execution_spec"]["outputs"]
    ]
    assert identifiers
    assert all(re.fullmatch(r"[a-z][a-z0-9_]*", identifier) for identifier in identifiers)


def test_execution_mode_can_toggle_from_javascript_back_to_message(client):
    headers = _headers(client)
    draft = _create(client, headers, _javascript_payload())
    assert client.post(f"/blocks/custom/{draft['id']}/validate", headers=headers, json={}).json()["valid"] is True

    message_payload = _valid_payload("Снова сообщение")
    changed = client.put(f"/blocks/custom/{draft['id']}", headers=headers, json=message_payload)
    assert changed.status_code == 200, changed.text
    assert changed.json()["runtime_kind"] == "message"
    assert changed.json()["runtime_definition"]["kind"] == "message"
    assert changed.json()["execution_spec"] is None
    assert client.post(f"/blocks/custom/{draft['id']}/validate", headers=headers, json={}).json()["valid"] is True


def test_message_fallback_with_fifteen_outputs_stays_invalid(client):
    headers = _headers(client)
    payload = _valid_payload()
    payload["outputs"] = _javascript_payload()["outputs"]
    payload["connection_rules"] = {
        "input_count": 1,
        "output_count": 15,
        "max_inputs": 1,
        "max_outputs": 15,
    }
    draft = _create(client, headers, payload)
    validation = client.post(f"/blocks/custom/{draft['id']}/validate", headers=headers, json={}).json()
    assert validation["valid"] is False
    assert any("Message fallback" in error for error in validation["errors"])


def test_server_generates_safe_unique_machine_keys_from_russian_names(client):
    payload = _valid_payload()
    payload["outputs"] = [
        {"name": "Текст сообщения", "display_name": "Текст сообщения"},
        {"name": "Текст сообщения", "display_name": "Текст сообщения 2"},
    ]
    payload["runtime_compatibility"] = "javascript"
    payload["config_schema"] = []
    payload["runtime_definition"] = {"kind": "javascript"}
    payload["connection_rules"] = {"input_count": 1, "output_count": 2}
    payload["execution_spec"] = {
        "schema_version": 1,
        "language": "javascript",
        "runtime_profile": "quickjs-wasm-v1",
        "source": "function run(envelope) { return { outputs: {}, route: 'tekst_soobshcheniya', logs: [] }; }",
        "inputs": payload["inputs"],
        "outputs": [
            {"name": "tekst_soobshcheniya", "display_name": "Текст сообщения"},
            {"name": "tekst_soobshcheniya_2", "display_name": "Текст сообщения 2"},
        ],
        "settings_schema": [],
        "capabilities": {"network": False, "filesystem": False, "secrets": False, "database": False, "persistence": False, "dependencies": False, "subprocess": False, "platform_api": False},
        "resource_profile": {"wall_clock_ms": 750, "cpu_ms": 500, "memory_mb": 32, "max_source_bytes": 32768, "max_input_bytes": 16384, "max_output_bytes": 16384, "max_log_entries": 20, "max_log_entry_bytes": 512, "max_log_bytes": 4096},
    }
    draft = _create(client, _headers(client), payload)
    assert [port["name"] for port in draft["passport"]["outputs"]] == [
        "tekst_soobshcheniya", "tekst_soobshcheniya_2",
    ]


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
    assert _publish(client, headers, v1['id']).status_code == 200
    catalog = client.get("/blocks", headers=headers).json()
    custom = next(item for item in catalog if item.get("source") == "custom")
    assert custom["blockVersionId"] == v1["id"]
    assert custom["runtimeBlockId"] == "message"

    v2 = client.post(f"/blocks/custom/{v1['id']}/versions", headers=headers, json={}).json()
    changed = _valid_payload("Подтверждение заказа — новая версия")
    changed["user_guide"] = {"content": "Инструкция только для версии 2."}
    assert client.put(f"/blocks/custom/{v2['id']}", headers=headers, json=changed).status_code == 200
    assert _publish(client, headers, v2['id']).status_code == 200
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
    assert _publish(client, headers, version['id']).status_code == 200
    assert any(item.get("blockVersionId") == version["id"] for item in client.get("/blocks", headers=headers).json())

    assert client.post(f"/blocks/custom/{version['id']}/archive", headers=headers, json={}).status_code == 200
    assert all(item.get("blockVersionId") != version["id"] for item in client.get("/blocks", headers=headers).json())


def test_archived_version_remains_referenced_by_existing_scenario(client):
    headers = _headers(client)
    v1 = _create(client, headers)
    _publish(client, headers, v1['id'])
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
    _publish(client, headers, published['id'])
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
