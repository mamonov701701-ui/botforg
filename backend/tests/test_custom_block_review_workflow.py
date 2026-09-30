from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect, text

from backend.migrations.versions import custom_block_review_schema_repair_046
from backend.models.custom_block import (
    CustomBlockReviewDecision,
    CustomBlockSecurityReport,
    CustomBlockVersion,
)
from backend.settings import settings
from backend.models.user import User
from backend.tests.conftest import TestingSessionLocal, register_and_get_token


def _headers(client):
    return {"Authorization": register_and_get_token(client)}


def _payload():
    return {
        "title": "Проверяемый блок", "description": "Описание", "purpose": "Цель",
        "when_to_use": "После события", "inputs": [{"name": "order_id"}],
        "outputs": [{"name": "success", "display_name": "Успех"}],
        "config_schema": [{"name": "text", "type": "text", "label": "Текст", "required": True}],
        "connection_rules": {"input_count": 1, "output_count": 1}, "runtime_compatibility": "message",
        "simulator_compatibility": True, "supported_channels": ["telegram"],
        "limitations": ["Ограничение"], "examples": ["Пример"],
        "user_guide": {"content": "Инструкция"}, "runtime_definition": {"kind": "message"},
    }


def _draft(client, headers):
    response = client.post("/blocks/custom/drafts", headers=headers, json=_payload())
    assert response.status_code == 201
    return response.json()


def _make_admin():
    with TestingSessionLocal() as db:
        db.query(User).filter(User.id == 1).one().role = "admin"
        db.commit()


def _make_viewer():
    with TestingSessionLocal() as db:
        db.query(User).filter(User.id == 1).one().role = "viewer"
        db.commit()


def test_review_schema_repair_converges_early_045_database(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'partial-review-045.db'}")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        connection.execute(text("CREATE TABLE custom_block_versions (id INTEGER PRIMARY KEY)"))
        connection.execute(text(
            "CREATE TABLE custom_block_security_reports ("
            "id INTEGER PRIMARY KEY, custom_block_version_id INTEGER NOT NULL, "
            "artifact_hash VARCHAR(64), report_kind VARCHAR(32) NOT NULL, "
            "findings JSON NOT NULL, summary VARCHAR(512) NOT NULL, created_at DATETIME NOT NULL)"
        ))
        context = MigrationContext.configure(connection)
        original_op = custom_block_review_schema_repair_046.op
        custom_block_review_schema_repair_046.op = Operations(context)
        try:
            custom_block_review_schema_repair_046.upgrade()
            custom_block_review_schema_repair_046.upgrade()
        finally:
            custom_block_review_schema_repair_046.op = original_op

        inspector = inspect(connection)
        report_columns = {
            column["name"]
            for column in inspector.get_columns("custom_block_security_reports")
        }
        assert {"status", "provider_code", "error_code"} <= report_columns
        assert "custom_block_review_events" in inspector.get_table_names()
        event_indexes = {
            index["name"]
            for index in inspector.get_indexes("custom_block_review_events")
        }
        assert event_indexes == {
            "ix_custom_block_review_events_actor_user_id",
            "ix_custom_block_review_events_custom_block_version_id",
        }


def test_create_and_list_draft_serialize_empty_review_workflow(client):
    headers = _headers(client)
    created = client.post("/blocks/custom/drafts", headers=headers, json=_payload())
    assert created.status_code == 201
    body = created.json()
    assert body["review_state"] == "draft"
    assert body["latest_security_report"] is None
    assert body["review_history"] == []
    assert body["review_events"] == []

    mine = client.get("/blocks/custom/mine", headers=headers)
    assert mine.status_code == 200
    listed = next(item for item in mine.json() if item["id"] == body["id"])
    assert listed["review_state"] == "draft"
    assert listed["latest_security_report"] is None
    assert listed["review_history"] == []
    assert listed["review_events"] == []


def test_publish_fails_closed_until_exact_version_is_reviewed_and_approved(client):
    headers = _headers(client)
    draft = _draft(client, headers)
    assert client.post(f"/blocks/custom/{draft['id']}/publish", headers=headers, json={}).status_code == 409
    submitted = client.post(f"/blocks/custom/{draft['id']}/submit-review", headers=headers, json={})
    assert submitted.status_code == 200
    assert submitted.json()["review_state"] == "admin_review_pending"
    assert submitted.json()["latest_security_report"]["artifact_hash"] is None
    assert client.post(f"/blocks/custom/{draft['id']}/publish", headers=headers, json={}).status_code == 409
    _make_viewer()
    assert client.post(f"/blocks/custom/{draft['id']}/admin-review", headers=headers, json={"decision": "approve"}).status_code == 403
    _make_admin()
    approved = client.post(f"/blocks/custom/{draft['id']}/admin-review", headers=headers, json={"decision": "approve", "comment": "OK"})
    assert approved.status_code == 200
    assert approved.json()["review_state"] == "approved"
    listed = client.get("/blocks/custom/mine", headers=headers).json()
    assert next(item for item in listed if item["id"] == draft["id"])["review_state"] == "approved"
    assert client.post(f"/blocks/custom/{draft['id']}/submit-review", headers=headers, json={}).status_code == 409
    assert [event["event_type"] for event in approved.json()["review_events"]] == [
        "review_submitted", "automated_validation_completed", "ai_security_review_created",
        "admin_review_pending", "admin_approve",
    ]
    assert client.post(f"/blocks/custom/{draft['id']}/publish", headers=headers, json={}).status_code == 200


def test_review_records_are_append_only_and_new_version_never_inherits_approval(client):
    headers = _headers(client)
    first = _draft(client, headers)
    assert client.post(f"/blocks/custom/{first['id']}/submit-review", headers=headers, json={}).status_code == 200
    _make_admin()
    assert client.post(f"/blocks/custom/{first['id']}/admin-review", headers=headers, json={"decision": "approve"}).status_code == 200
    assert client.post(f"/blocks/custom/{first['id']}/publish", headers=headers, json={}).status_code == 200
    second = client.post(f"/blocks/custom/{first['id']}/versions", headers=headers, json={}).json()
    assert second["review_state"] == "draft"
    assert second["review_history"] == []
    assert second["latest_security_report"] is None
    assert client.post(f"/blocks/custom/{second['id']}/publish", headers=headers, json={}).status_code == 409
    with TestingSessionLocal() as db:
        assert db.query(CustomBlockReviewDecision).filter_by(custom_block_version_id=first["id"]).count() == 1
        assert db.query(CustomBlockSecurityReport).filter_by(custom_block_version_id=first["id"]).count() == 1


def test_needs_changes_requires_resubmission_and_admin_queue_is_protected(client):
    headers = _headers(client)
    draft = _draft(client, headers)
    assert client.post(f"/blocks/custom/{draft['id']}/submit-review", headers=headers, json={}).status_code == 200
    _make_viewer()
    assert client.get("/blocks/custom/admin/review-queue", headers=headers).status_code == 403
    _make_admin()
    queue = client.get("/blocks/custom/admin/review-queue", headers=headers)
    assert [row["id"] for row in queue.json()] == [draft["id"]]
    changed = client.post(f"/blocks/custom/{draft['id']}/admin-review", headers=headers, json={"decision": "needs_changes", "comment": "Уточните ограничения"})
    assert changed.json()["review_state"] == "needs_changes"
    assert client.post(f"/blocks/custom/{draft['id']}/admin-review", headers=headers, json={"decision": "approve"}).status_code == 409
    revised_payload = _payload()
    revised_payload["description"] = "Исправленное описание"
    updated = client.put(f"/blocks/custom/{draft['id']}", headers=headers, json=revised_payload)
    assert updated.json()["review_state"] == "draft"
    assert len(updated.json()["review_history"]) == 1
    assert updated.json()["review_events"][-1]["event_type"] == "review_invalidated"


def test_identical_autosave_and_validation_preserve_active_or_approved_review(client):
    headers = _headers(client)
    draft = _draft(client, headers)
    submitted = client.post(f"/blocks/custom/{draft['id']}/submit-review", headers=headers, json={})
    assert submitted.status_code == 200

    identical = client.put(f"/blocks/custom/{draft['id']}", headers=headers, json=_payload())
    assert identical.status_code == 200
    assert identical.json()["review_state"] == "admin_review_pending"
    assert [event["event_type"] for event in identical.json()["review_events"]].count("review_invalidated") == 0
    assert client.post(f"/blocks/custom/{draft['id']}/validate", headers=headers).status_code == 200

    _make_admin()
    queue = client.get("/blocks/custom/admin/review-queue", headers=headers)
    assert [item["id"] for item in queue.json()] == [draft["id"]]
    approved = client.post(
        f"/blocks/custom/{draft['id']}/admin-review",
        headers=headers,
        json={"decision": "approve"},
    )
    assert approved.status_code == 200
    identical_after_approval = client.put(
        f"/blocks/custom/{draft['id']}", headers=headers, json={**_payload(), "wizard_step": 8}
    )
    assert identical_after_approval.status_code == 200
    assert identical_after_approval.json()["review_state"] == "approved"
    assert identical_after_approval.json()["review_events"][-1]["event_type"] == "admin_approve"
    assert client.post(f"/blocks/custom/{draft['id']}/publish", headers=headers, json={}).status_code == 200


def test_security_agent_failure_is_audited_and_blocks_admin_decision(client, monkeypatch):
    headers = _headers(client)
    draft = _draft(client, headers)
    monkeypatch.setattr(settings, "CUSTOM_BLOCK_SECURITY_AGENT_PROVIDER", "unavailable")
    submitted = client.post(f"/blocks/custom/{draft['id']}/submit-review", headers=headers, json={})
    assert submitted.status_code == 200
    body = submitted.json()
    assert body["review_state"] == "security_review_failed"
    assert body["latest_security_report"]["status"] == "failed"
    assert body["latest_security_report"]["error_code"] == "security_agent_unavailable"
    _make_admin()
    assert client.post(f"/blocks/custom/{draft['id']}/admin-review", headers=headers, json={"decision": "approve"}).status_code == 409
    assert client.post(f"/blocks/custom/{draft['id']}/publish", headers=headers, json={}).status_code == 409
