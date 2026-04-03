"""Юнит-тесты блока input (scenario_flow) без БД."""

from backend.services.scenario_flow.input_block import (
    normalize_input_settings,
    validate_input_answer,
    pick_success_target_id,
    pick_error_target_id,
)


def test_normalize_migrates_legacy():
    raw = {"text": "Q?", "variableName": "user_name"}
    out = normalize_input_settings(raw)
    assert out["question_text"] == "Q?"
    assert out["variable_key"] == "user_name"
    assert out["validation"]["type"] == "string"


def test_validate_email_ok():
    ok, msg, val = validate_input_answer(
        {"validation": {"type": "email"}, "required": True},
        "a@b.co",
    )
    assert ok and msg is None and val == "a@b.co"


def test_validate_email_fail():
    ok, msg, val = validate_input_answer(
        {"validation": {"type": "email"}, "required": True, "error_message": "bad"},
        "not-an-email",
    )
    assert not ok and msg == "bad" and val is None


def test_pick_success_prefers_handle():
    edges = [
        {"source": "n1", "target": "ok", "sourceHandle": "success"},
        {"source": "n1", "target": "bad", "sourceHandle": "error"},
    ]
    assert pick_success_target_id(edges, "n1") == "ok"
    assert pick_error_target_id(edges, "n1") == "bad"


def test_pick_success_fallback_first_non_error():
    edges = [{"source": "n1", "target": "x", "sourceHandle": None}]
    assert pick_success_target_id(edges, "n1") == "x"
