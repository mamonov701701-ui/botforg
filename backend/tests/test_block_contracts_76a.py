from backend.services.scenario_flow.block_contracts import *
from backend.services.channel_runtime import _find_start_node
from backend.services.scenario_runtime import ScenarioRuntime, ScenarioRuntimeError
from backend.services import channel_runtime
from backend.channels.base import NormalizedUpdate
from backend.services.scenario_flow.set_variable import (
    SetVariableSettingsError, convert_value, settings_from_node, validate_set_variable_settings,
)
from unittest.mock import MagicMock

def node(id, code): return {"id": id, "data": {"blockId": code}}

def test_codes_aliases_and_metadata():
    assert normalize_block_code("variable") == "set_variable"
    assert normalize_block_code("unknown") is None
    assert BLOCK_CONTRACTS["end"]["terminal"] and BLOCK_CONTRACTS["condition"]["handles"] == CONDITION_HANDLES

def test_classifies_canonical_legacy_and_unsafe_mixed_content():
    assert classify_scenario_content({"nodes": [node("1", "start")]}) is ScenarioFormat.CANONICAL
    assert classify_scenario_content({"nodes": [{"id":"1", "type":"message"}]}) is ScenarioFormat.LEGACY
    assert classify_scenario_content({"nodes": [node("1", "start"), {"id":"2", "type":"message"}]}) is ScenarioFormat.MIXED_UNSAFE

def test_canonical_start_unknown_and_connection_rules():
    content={"nodes":[node("s","start"),node("e","end"),node("c","condition")],"edges":[{"source":"s","target":"e"},{"source":"e","target":"c"},{"source":"c","target":"e","sourceHandle":"bad"}]}
    errors=validate_canonical_graph(content)
    assert "end_outgoing" in errors and "condition_handle" in errors
    assert "missing_start" in validate_canonical_graph({"nodes":[node("x","message")],"edges":[]})
    assert "unknown_block" in validate_canonical_graph({"nodes":[node("s","start"),node("x","future")],"edges":[]})


def test_start_discovery_is_canonical_strict_and_legacy_compatible():
    canonical = {"nodes": [node("s", "start"), node("m", "message")]}
    assert discover_start_node(canonical) == (canonical["nodes"][0], None)
    assert discover_start_node({"nodes": [node("m", "message")]})[1] == "missing_start"
    assert discover_start_node({"nodes": [node("s1", "start"), node("s2", "start")]})[1] == "duplicate_start"
    mixed = {"nodes": [node("s", "start"), {"id": "legacy", "type": "message"}]}
    assert discover_start_node(mixed)[1] == "mixed_unsafe"
    legacy = {"nodes": [{"id": "first", "type": "message"}, {"id": "second", "type": "message"}]}
    assert discover_start_node(legacy) == (legacy["nodes"][0], None)
    assert _find_start_node(mixed["nodes"]) is None


def test_general_runtime_start_and_end_are_explicit():
    db = MagicMock()
    runtime = ScenarioRuntime(db)
    scenario = MagicMock()
    scenario.published_content = {
        "nodes": [node("s", "start"), node("e", "end"), node("after", "message")],
        "edges": [{"source": "e", "target": "after"}],
    }
    scenario.status = "published"
    assert runtime.get_start_node(scenario)["id"] == "s"
    assert runtime.get_next_node(scenario, scenario.published_content["nodes"][1]) is None
    legacy = MagicMock()
    legacy.published_content = {"nodes": [{"id": "old", "type": "message"}], "edges": []}
    legacy.status = "published"
    assert runtime.get_start_node(legacy)["id"] == "old"
    assert runtime.get_next_node(legacy, legacy.published_content["nodes"][0]) is None
    invalid = MagicMock()
    invalid.published_content = {"nodes": [node("m", "message")], "edges": []}
    invalid.status = "published"
    try:
        runtime.get_start_node(invalid)
    except ScenarioRuntimeError as exc:
        assert "missing_start" in str(exc)
    else:
        raise AssertionError("canonical graph without Start must fail closed")


def test_channel_runtime_end_never_follows_persisted_outgoing_edge(monkeypatch):
    db = MagicMock()
    bot = MagicMock(id=10)
    scenario = MagicMock(id=5)
    scenario.published_content = {
        "nodes": [node("end", "end"), node("after", "message")],
        "edges": [{"source": "end", "target": "after"}],
    }
    scenario.status = "published"
    user = MagicMock(id=42)
    variables = MagicMock()
    variables.get_user_variable_by_key.return_value = MagicMock(
        ok=True, data=MagicMock(value_text="end")
    )
    monkeypatch.setattr(channel_runtime, "ensure_ctor_bot_id", lambda *_: 10)
    monkeypatch.setattr(channel_runtime, "get_or_create_bot_user", lambda *_, **__: user)
    monkeypatch.setattr(channel_runtime, "_find_scenario_for_bot", lambda *_: scenario)
    monkeypatch.setattr(channel_runtime, "VariableService", lambda _: variables)
    send = MagicMock()
    monkeypatch.setattr(channel_runtime, "_send_node", send)

    channel_runtime.process_channel_update(
        db,
        bot=bot,
        conn=MagicMock(),
        adapter=MagicMock(),
        normalized=NormalizedUpdate(channel="telegram", chat_id="chat", user_id="user"),
    )

    send.assert_not_called()
    variables.set_user_variable.assert_called_once_with(42, channel_runtime.STATE_NODE_KEY, "", commit=True)


def test_set_variable_contract_types_aliases_and_validation():
    def settings(value, value_type="string", **extra):
        return {"key": "order_total", "value": value, "value_type": value_type, **extra}

    assert convert_value(settings_from_node("set_variable", settings("42", "number"))) == 42
    assert convert_value(settings_from_node("set_variable", settings("true", "boolean"))) is True
    assert convert_value(settings_from_node("set_variable", settings('{"a": 1}', "json"))) == {"a": 1}
    assert convert_value(settings_from_node("variable", {"name": "legacy_value", "value": "x"})) == "x"
    assert settings_from_node("action", {"setVariable": "safe_value", "value": "x"}) is not None
    assert settings_from_node("action", {"setVariable": "safe_value", "value": "x", "text": "also send"}) is None
    assert validate_set_variable_settings({"key": "Bad key", "value": "1"}) == ["invalid_key"]
    assert validate_set_variable_settings(settings("nope", "number")) == ["invalid_number"]
    assert validate_set_variable_settings(settings("yes", "boolean")) == ["invalid_boolean"]
    assert validate_set_variable_settings(settings("{bad", "json")) == ["invalid_json"]


def test_set_variable_publish_rules_include_settings_and_outgoing_limit():
    valid = {"nodes": [node("s", "start"), node("v", "set_variable")], "edges": [{"source": "s", "target": "v"}]}
    valid["nodes"][1]["data"]["settings"] = {"key": "flag", "value": "false", "value_type": "boolean"}
    assert validate_canonical_graph(valid) == []
    valid["edges"].append({"source": "v", "target": "s"})
    valid["edges"].append({"source": "v", "target": "s"})
    assert "set_variable_outgoing" in validate_canonical_graph(valid)
