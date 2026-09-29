from copy import deepcopy
import os
import json
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time

import httpx
import pytest

from backend.models.custom_block import CustomBlockVersion
from backend.models.scenario import Scenario
from backend.services.custom_block_execution.contracts import RunnerResponse
from backend.services.custom_block_execution.provider import RunnerFailure, RunnerProvider
from backend.settings import settings
from backend.services.custom_block_execution.service import (
    ControlledExecutionFailure, execute_version, resolve_authorized_version,
)
from backend.services.custom_blocks import normalized_connections
from backend.tests.conftest import TestingSessionLocal, register_and_get_token


PROFILE = {"wall_clock_ms": 750, "cpu_ms": 500, "memory_mb": 32, "max_source_bytes": 32768,
           "max_input_bytes": 16384, "max_output_bytes": 16384, "max_log_entries": 20,
           "max_log_entry_bytes": 512, "max_log_bytes": 4096}
CAPS = {"network": False, "filesystem": False, "secrets": False, "database": False,
        "persistence": False, "dependencies": False, "subprocess": False, "platform_api": False}


def executable_payload():
    return {
        "title": "Маршрутизатор", "description": "Тестовый исполняемый блок", "purpose": "Проверка",
        "when_to_use": "В тесте", "inputs": [], "outputs": [{"name": "success", "type": "json"}],
        "config_schema": [], "connection_rules": {"max_inputs": 1, "max_outputs": 1},
        "runtime_compatibility": "javascript", "simulator_compatibility": True,
        "supported_channels": ["telegram"], "limitations": ["Нет сети"], "examples": ["Тест"],
        "user_guide": {"content": "Тест"}, "runtime_definition": {"kind": "javascript"},
        "execution_spec": {"schema_version": 1, "language": "javascript", "runtime_profile": "quickjs-wasm-v1",
            "source": "function run(envelope) { return { outputs: {}, route: 'success', logs: [] }; }",
            "inputs": [], "outputs": [{"name": "success", "type": "json"}], "settings_schema": [],
            "capabilities": CAPS, "resource_profile": PROFILE},
    }


class FakeRunner(RunnerProvider):
    def __init__(self, result=None, failure=None): self.result, self.failure = result, failure
    def execute(self, request):
        if self.failure: raise RunnerFailure(self.failure)
        return RunnerResponse.model_validate(self.result or {"result": {"outputs": {}, "route": "success", "logs": []}, "duration_ms": 1, "runner_profile": "test"})


def _headers(client): return {"Authorization": register_and_get_token(client)}


def _published(client):
    headers = _headers(client)
    draft = client.post("/blocks/custom/drafts", headers=headers, json=executable_payload()).json()
    assert client.post(f"/blocks/custom/{draft['id']}/publish", headers=headers, json={}).status_code == 200
    return headers, draft


def _free_local_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


@pytest.fixture(scope="module")
def live_quickjs_runner():
    node = shutil.which("node")
    runner_dir = Path(__file__).resolve().parents[2] / "custom-runner"
    if not node or not (runner_dir / "node_modules" / "quickjs-emscripten").exists():
        pytest.skip("Local Node/QuickJS Development Runner is not installed")
    port = _free_local_port()
    token = "botforg-integration-test-runner-token"
    env = os.environ.copy()
    env.pop("BOTFORG_RUNNER_TEST_MODE", None)
    env.update({
        "CUSTOM_BLOCK_RUNNER_HOST": "127.0.0.1",
        "CUSTOM_BLOCK_RUNNER_PORT": str(port),
        "CUSTOM_BLOCK_RUNNER_SHARED_TOKEN": token,
    })
    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    process = subprocess.Popen(
        [node, "server.mjs"], cwd=runner_dir, env=env,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=creationflags,
    )
    url = f"http://127.0.0.1:{port}"
    try:
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            if process.poll() is not None:
                pytest.fail("Development Runner exited before becoming healthy")
            try:
                if httpx.get(f"{url}/healthz", timeout=0.5).json().get("status") == "ok":
                    break
            except (httpx.HTTPError, ValueError):
                time.sleep(0.1)
        else:
            pytest.fail("Development Runner did not become healthy")
        yield url, token
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def _configure_live_runner(monkeypatch, url, token, timeout=2.0):
    monkeypatch.setattr(settings, "CUSTOM_BLOCK_EXECUTION_ENABLED", True)
    monkeypatch.setattr(settings, "CUSTOM_BLOCK_RUNNER_URL", url)
    monkeypatch.setattr(settings, "CUSTOM_BLOCK_RUNNER_SHARED_TOKEN", token)
    monkeypatch.setattr(settings, "CUSTOM_BLOCK_RUNNER_TIMEOUT_SECONDS", timeout)


def test_canonical_backend_wrapper_propagates_runner_config_to_reload_child(tmp_path):
    root = Path(__file__).resolve().parents[2]
    wrapper = root / "scripts" / "dev-backend-runtime-env.cmd"
    probe = root / "backend" / "tests" / "helpers" / "runtime_env_probe.py"
    token_file = tmp_path / "runner-token"
    token_file.write_text("ephemeral-test-token", encoding="utf-8")
    env = os.environ.copy()
    env["CUSTOM_BLOCK_RUNNER_TOKEN_FILE"] = str(token_file)
    completed = subprocess.run(
        ["cmd.exe", "/d", "/c", "call", str(wrapper), sys.executable, str(probe)],
        cwd=root,
        env=env,
        check=True,
        capture_output=True,
        text=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    result = json.loads(completed.stdout.strip())
    assert result == {
        "enabled": True,
        "url": "http://127.0.0.1:8090",
        "token_configured": True,
    }
    assert "ephemeral-test-token" not in completed.stdout


def test_live_development_runner_health_reports_quickjs_profile(live_quickjs_runner):
    url, _token = live_quickjs_runner
    response = httpx.get(f"{url}/healthz", timeout=1)
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "runner_profile": "quickjs-wasm-v1"}


def test_development_runtime_status_reports_actual_worker_config_without_token(
    client, monkeypatch,
):
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    monkeypatch.setattr(settings, "CUSTOM_BLOCK_EXECUTION_ENABLED", True)
    monkeypatch.setattr(settings, "CUSTOM_BLOCK_RUNNER_URL", "http://127.0.0.1:8090")
    monkeypatch.setattr(settings, "CUSTOM_BLOCK_RUNNER_SHARED_TOKEN", "safe-test-token")
    response = client.get("/dev/custom-block-runtime/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["process_id"] > 0
    assert payload["feature_enabled"] is True
    assert payload["runner_url_configured"] is True
    assert payload["runner_host"] == "127.0.0.1"
    assert payload["runner_port"] == 8090
    assert payload["token_configured"] is True
    assert len(payload["token_fingerprint"]) == 12
    assert "safe-test-token" not in response.text


def test_development_runtime_diagnostics_are_not_available_in_production(client, monkeypatch):
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    assert client.get("/dev/custom-block-runtime/status").status_code == 404
    assert client.post("/dev/custom-block-runtime/probe").status_code == 404


def test_development_runtime_probe_uses_authenticated_live_runner(
    client, monkeypatch, live_quickjs_runner,
):
    url, token = live_quickjs_runner
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    _configure_live_runner(monkeypatch, url, token)
    response = client.post("/dev/custom-block-runtime/probe")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["route"] == "success"
    assert payload["runner_profile"] == "quickjs-wasm-v1"


def test_development_runtime_probe_maps_auth_mismatch_without_token(
    client, monkeypatch, live_quickjs_runner,
):
    url, _token = live_quickjs_runner
    monkeypatch.setattr(settings, "ENVIRONMENT", "development")
    _configure_live_runner(monkeypatch, url, "wrong-token")
    response = client.post("/dev/custom-block-runtime/probe")
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "auth_mismatch"
    assert "wrong-token" not in response.text


def test_canonical_launcher_kills_tree_before_root_and_handles_orphan_workers():
    root = Path(__file__).resolve().parents[2]
    source = (root / "scripts" / "dev-backend.ps1").read_text(encoding="utf-8-sig")
    assert "Get-OrphanUvicornWorkers" in source
    tree_kill = source.index("taskkill.exe /T /F /PID $rootPid")
    orphan_kill = source.index("Stop-Process -Id $worker.ProcessId")
    assert tree_kill < orphan_kill


def test_javascript_artifact_is_hashed_immutable_and_runs_through_provider(client):
    headers, draft = _published(client)
    with TestingSessionLocal() as db:
        version = db.query(CustomBlockVersion).filter_by(id=draft["id"]).one()
        assert version.execution_artifact_hash and len(version.execution_artifact_hash) == 64
        result = execute_version(db, version=version, mode="runtime", input_data={}, settings_data={}, provider=FakeRunner())
        assert result.route == "success"


def test_preview_api_executes_exact_version_in_live_quickjs_runner(
    client, monkeypatch, live_quickjs_runner,
):
    url, token = live_quickjs_runner
    _configure_live_runner(monkeypatch, url, token)
    payload = executable_payload()
    payload["outputs"] = [
        {
            "name": "success" if index == 0 else f"route_{index + 1}",
            "display_name": "Успех" if index == 0 else f"Маршрут {index + 1}",
            "type": "json",
        }
        for index in range(15)
    ]
    payload["connection_rules"] = {"input_count": 1, "output_count": 15}
    payload["execution_spec"] = deepcopy(payload["execution_spec"])
    payload["execution_spec"]["outputs"] = deepcopy(payload["outputs"])
    headers = _headers(client)
    draft = client.post("/blocks/custom/drafts", headers=headers, json=payload).json()
    assert client.post(f"/blocks/custom/{draft['id']}/publish", headers=headers, json={}).status_code == 200
    response = client.post(
        f"/blocks/custom/{draft['id']}/preview-execution",
        headers=headers,
        json={
            "stableBlockId": draft["stable_block_id"],
            "version": draft["version"],
            "input": {},
            "settings": {},
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["route"] == "success"


def test_preview_api_reports_live_runner_authentication_failure(
    client, monkeypatch, live_quickjs_runner,
):
    url, _token = live_quickjs_runner
    _configure_live_runner(monkeypatch, url, "wrong-token")
    headers, draft = _published(client)
    response = client.post(
        f"/blocks/custom/{draft['id']}/preview-execution",
        headers=headers,
        json={"stableBlockId": draft["stable_block_id"], "version": draft["version"]},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "runner_authentication_failed"
    assert "token" not in response.text.lower()
    assert url not in response.text


def test_preview_api_reports_live_runner_timeout(client, monkeypatch, live_quickjs_runner):
    url, token = live_quickjs_runner
    _configure_live_runner(monkeypatch, url, token, timeout=2.0)
    payload = executable_payload()
    payload["execution_spec"] = deepcopy(payload["execution_spec"])
    payload["execution_spec"]["source"] = (
        "function run() { while (true) {} return { outputs: {}, route: 'success', logs: [] }; }"
    )
    headers = _headers(client)
    draft = client.post("/blocks/custom/drafts", headers=headers, json=payload).json()
    assert client.post(f"/blocks/custom/{draft['id']}/publish", headers=headers, json={}).status_code == 200
    response = client.post(
        f"/blocks/custom/{draft['id']}/preview-execution",
        headers=headers,
        json={"stableBlockId": draft["stable_block_id"], "version": draft["version"]},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "timeout"


def test_preview_api_reports_runner_unavailable_without_internal_details(client, monkeypatch):
    url = "http://127.0.0.1:1"
    _configure_live_runner(monkeypatch, url, "test-token", timeout=0.2)
    def unavailable(*_args, **_kwargs):
        raise httpx.ConnectError("connection refused")
    monkeypatch.setattr("backend.services.custom_block_execution.provider.httpx.post", unavailable)
    headers, draft = _published(client)
    response = client.post(
        f"/blocks/custom/{draft['id']}/preview-execution",
        headers=headers,
        json={"stableBlockId": draft["stable_block_id"], "version": draft["version"]},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "runner_connection_refused"
    assert url not in response.text


@pytest.mark.parametrize(
    ("enabled", "url", "category"),
    [
        (False, "http://127.0.0.1:8090", "runner_feature_disabled"),
        (True, "", "runner_url_missing"),
    ],
)
def test_preview_api_distinguishes_disabled_feature_and_missing_url(
    client, monkeypatch, enabled, url, category,
):
    monkeypatch.setattr(settings, "CUSTOM_BLOCK_EXECUTION_ENABLED", enabled)
    monkeypatch.setattr(settings, "CUSTOM_BLOCK_RUNNER_URL", url)
    headers, draft = _published(client)
    response = client.post(
        f"/blocks/custom/{draft['id']}/preview-execution",
        headers=headers,
        json={"stableBlockId": draft["stable_block_id"], "version": draft["version"]},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == category


@pytest.mark.parametrize("failure", ["timeout", "resource_limit", "policy_violation", "runner_unavailable"])
def test_runner_failures_are_controlled_and_audited(client, failure):
    headers, draft = _published(client)
    with TestingSessionLocal() as db:
        version = db.query(CustomBlockVersion).filter_by(id=draft["id"]).one()
        with pytest.raises(ControlledExecutionFailure, match=failure):
            execute_version(db, version=version, mode="simulator", input_data={}, settings_data={}, provider=FakeRunner(failure=failure))


def test_invalid_route_output_and_tampered_hash_fail_closed(client):
    published_headers, draft = _published(client)
    with TestingSessionLocal() as db:
        version = db.query(CustomBlockVersion).filter_by(id=draft["id"]).one()
        with pytest.raises(ControlledExecutionFailure, match="invalid_output"):
            execute_version(db, version=version, mode="runtime", input_data={}, settings_data={}, provider=FakeRunner({"result": {"outputs": {}, "route": "forged", "logs": []}, "duration_ms": 1, "runner_profile": "test"}))
        version.execution_artifact_hash = "0" * 64
        with pytest.raises(ControlledExecutionFailure, match="validation_error"):
            execute_version(db, version=version, mode="runtime", input_data={}, settings_data={}, provider=FakeRunner())


def test_foreign_draft_and_archived_authorization_rules(client):
    headers, draft = _published(client)
    with TestingSessionLocal() as db:
        version = db.query(CustomBlockVersion).filter_by(id=draft["id"]).one()
        with pytest.raises(ControlledExecutionFailure, match="authorization_error"):
            resolve_authorized_version(db, scenario_owner_id=999999, version_id=version.id, stable_id=version.block.stable_key, version_number=version.version, existing_reference=True)
        version.status = "draft"
        with pytest.raises(ControlledExecutionFailure, match="authorization_error"):
            resolve_authorized_version(db, scenario_owner_id=version.block.owner_user_id, version_id=version.id, stable_id=version.block.stable_key, version_number=version.version, existing_reference=True)
        version.status = "archived"
        assert resolve_authorized_version(db, scenario_owner_id=version.block.owner_user_id, version_id=version.id, stable_id=version.block.stable_key, version_number=version.version, existing_reference=True).id == version.id


def test_oversized_source_and_output_are_rejected(client):
    payload = executable_payload()
    payload["execution_spec"] = deepcopy(payload["execution_spec"])
    payload["execution_spec"]["source"] = "x" * 32769
    assert client.post("/blocks/custom/drafts", headers=_headers(client), json=payload).status_code == 422
    published_headers, draft = _published(client)
    with TestingSessionLocal() as db:
        version = db.query(CustomBlockVersion).filter_by(id=draft["id"]).one()
        huge = {"result": {"outputs": {"success": "x" * 17000}, "route": "success", "logs": []}, "duration_ms": 1, "runner_profile": "test"}
        with pytest.raises(ControlledExecutionFailure, match="resource_limit"):
            execute_version(db, version=version, mode="runtime", input_data={}, settings_data={}, provider=FakeRunner(huge))


def test_multi_output_requires_a_declared_route_and_keeps_exact_contract(client):
    payload = executable_payload()
    payload["outputs"] = [{"name": "success", "display_name": "Успех"}, {"name": "error", "display_name": "Ошибка"}]
    payload["connection_rules"] = {"input_count": 1, "output_count": 2, "max_inputs": 1, "max_outputs": 2}
    payload["execution_spec"] = deepcopy(payload["execution_spec"])
    payload["execution_spec"]["outputs"] = deepcopy(payload["outputs"])
    headers = _headers(client)
    draft = client.post("/blocks/custom/drafts", headers=headers, json=payload).json()
    assert client.post(f"/blocks/custom/{draft['id']}/publish", headers=headers, json={}).status_code == 200
    with TestingSessionLocal() as db:
        version = db.query(CustomBlockVersion).filter_by(id=draft["id"]).one()
        missing_route = {"result": {"outputs": {}, "logs": []}, "duration_ms": 1, "runner_profile": "test"}
        with pytest.raises(ControlledExecutionFailure, match="invalid_output"):
            execute_version(db, version=version, mode="runtime", input_data={}, settings_data={}, provider=FakeRunner(missing_route))
        assert execute_version(db, version=version, mode="runtime", input_data={}, settings_data={}, provider=FakeRunner({"result": {"outputs": {}, "route": "error", "logs": []}, "duration_ms": 1, "runner_profile": "test"})).route == "error"


def test_javascript_catalog_and_scenario_keep_exact_named_routes(client):
    payload = executable_payload()
    payload["outputs"] = [
        {"name": "success", "display_name": "Успех"},
        {"name": "retry", "display_name": "Повторить"},
    ]
    payload["connection_rules"] = {"input_count": 1, "output_count": 2}
    payload["execution_spec"] = deepcopy(payload["execution_spec"])
    payload["execution_spec"]["outputs"] = deepcopy(payload["outputs"])
    headers = _headers(client)
    draft = client.post("/blocks/custom/drafts", headers=headers, json=payload).json()
    assert client.post(f"/blocks/custom/{draft['id']}/publish", headers=headers, json={}).status_code == 200
    catalog_item = next(
        item for item in client.get("/blocks", headers=headers).json()
        if item.get("blockVersionId") == draft["id"]
    )
    assert catalog_item["runtimeBlockId"] == "custom"
    assert catalog_item["passport"]["outputs"] == payload["outputs"]

    node = {"id": "router", "type": "default", "data": {
        "blockId": "custom", "customBlockVersionId": draft["id"],
        "customBlockStableId": draft["stable_block_id"], "customBlockVersion": 1,
        "customBlockPassport": catalog_item["passport"], "settings": {},
    }}
    content = {"nodes": [node], "edges": [{"id": "route", "source": "router", "target": "next", "sourceHandle": "retry"}]}
    created = client.post("/scenarios/", headers=headers, json={"name": "Маршрутизация", "content": content})
    assert created.status_code == 201, created.text
    forged = deepcopy(content)
    forged["edges"][0]["sourceHandle"] = "forged"
    rejected = client.post("/scenarios/", headers=headers, json={"name": "Подделка", "content": forged})
    assert rejected.status_code == 422
    assert "неизвестный маршрут" in rejected.text


def test_terminal_contract_accepts_no_route(client):
    payload = executable_payload()
    payload["outputs"] = []
    payload["connection_rules"] = {"input_count": 0, "output_count": 0, "max_inputs": 0, "max_outputs": 0}
    payload["execution_spec"] = deepcopy(payload["execution_spec"])
    payload["execution_spec"]["outputs"] = []
    payload["execution_spec"]["source"] = "function run(envelope) { return { outputs: {}, logs: [] }; }"
    headers = _headers(client)
    draft = client.post("/blocks/custom/drafts", headers=headers, json=payload).json()
    assert client.post(f"/blocks/custom/{draft['id']}/publish", headers=headers, json={}).status_code == 200
    with TestingSessionLocal() as db:
        version = db.query(CustomBlockVersion).filter_by(id=draft["id"]).one()
        assert execute_version(db, version=version, mode="runtime", input_data={}, settings_data={}, provider=FakeRunner({"result": {"outputs": {}, "logs": []}, "duration_ms": 1, "runner_profile": "test"})).route is None


def test_legacy_connection_contract_normalizes_without_rewriting_a_version():
    assert normalized_connections({"connection_rules": {}}) == {
        "input_count": 1, "output_count": 1, "max_inputs": 1, "max_outputs": 1,
        "outputs": [{"name": "success", "display_name": "Успех"}],
    }


@pytest.mark.parametrize("count", [0, 1, 6, 7, 32])
def test_execution_spec_accepts_up_to_32_output_routes(count):
    from backend.services.custom_block_execution.contracts import ExecutionSpec
    spec = executable_payload()["execution_spec"]
    spec["outputs"] = [{"name": f"route_{index:02d}", "display_name": f"Route {index}"} for index in range(count)]
    ExecutionSpec.model_validate(spec)


def test_execution_spec_rejects_33_output_routes():
    from backend.services.custom_block_execution.contracts import ExecutionSpec
    spec = executable_payload()["execution_spec"]
    spec["outputs"] = [{"name": f"route_{index:02d}"} for index in range(33)]
    with pytest.raises(Exception):
        ExecutionSpec.model_validate(spec)
