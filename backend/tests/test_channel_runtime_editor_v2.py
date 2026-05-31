"""EditorV2 graph shape (type=default + data.blockId) in channel_runtime."""
from __future__ import annotations

from backend.services.channel_runtime import (
    _compare_condition,
    _find_start_node,
    _pick_condition_branch_targets,
    resolve_node_kind,
)


def test_resolve_node_kind_editor_v2_default_type():
    node = {"id": "n1", "type": "default", "data": {"blockId": "input", "settings": {}}}
    assert resolve_node_kind(node) == "input"


def test_resolve_node_kind_legacy_top_level_type():
    node = {"id": "n1", "type": "message", "data": {"settings": {"text": "hi"}}}
    assert resolve_node_kind(node) == "message"


def test_resolve_node_kind_block_id_overrides_default_type():
    node = {"id": "n1", "type": "default", "data": {"blockId": "action", "settings": {"mode": "tag"}}}
    assert resolve_node_kind(node) == "action"


def test_find_start_node_by_block_id():
    nodes = [
        {"id": "a", "type": "default", "data": {"blockId": "message"}},
        {"id": "b", "type": "default", "data": {"blockId": "start"}},
    ]
    start = _find_start_node(nodes)
    assert start is not None
    assert start["id"] == "b"


def test_find_start_node_by_is_start_when_no_start_block():
    nodes = [
        {"id": "a", "type": "input", "data": {"is_start": True, "settings": {}}},
        {"id": "b", "type": "message", "data": {}},
    ]
    start = _find_start_node(nodes)
    assert start is not None
    assert start["id"] == "a"


def test_find_start_node_fallback_first_node():
    nodes = [{"id": "only", "type": "default", "data": {"blockId": "message"}}]
    start = _find_start_node(nodes)
    assert start is not None
    assert start["id"] == "only"


# --- condition compare operators ---


def test_compare_condition_equals():
    assert _compare_condition("equals", "yes", "yes") is True
    assert _compare_condition("equals", "yes", "no") is False


def test_compare_condition_equals_numeric_coercion():
    assert _compare_condition("equals", "5", 5) is True
    assert _compare_condition("equals", " 5 ", "5") is True


def test_compare_condition_not_equals():
    assert _compare_condition("notEquals", "a", "b") is True
    assert _compare_condition("notEquals", "a", "a") is False


def test_compare_condition_contains():
    assert _compare_condition("contains", "hello world", "world") is True
    assert _compare_condition("contains", "hello", "xyz") is False


def test_compare_condition_is_empty():
    assert _compare_condition("isEmpty", "", None) is True
    assert _compare_condition("isEmpty", "   ", None) is True
    assert _compare_condition("isEmpty", "x", None) is False


def test_compare_condition_is_not_empty():
    assert _compare_condition("isNotEmpty", "x", None) is True
    assert _compare_condition("isNotEmpty", "", None) is False


def test_compare_condition_greater_less_numeric_and_fallback():
    assert _compare_condition("greaterThan", "10", "5") is True
    assert _compare_condition("lessThan", "3", "5") is True
    # нечисловое сравнение → безопасный False
    assert _compare_condition("greaterThan", "abc", "5") is False


# --- condition branch selection ---


def test_pick_branch_by_source_handle():
    outgoing = [
        {"id": "e1", "sourceHandle": "condition_no", "target": "NO"},
        {"id": "e2", "sourceHandle": "condition_yes", "target": "YES"},
    ]
    yes_t, no_t = _pick_condition_branch_targets(outgoing)
    assert yes_t == "YES"
    assert no_t == "NO"


def test_pick_branch_by_condition_branch_data():
    outgoing = [
        {"id": "e1", "data": {"conditionBranch": "false"}, "target": "NO"},
        {"id": "e2", "data": {"conditionBranch": "true"}, "target": "YES"},
    ]
    yes_t, no_t = _pick_condition_branch_targets(outgoing)
    assert yes_t == "YES"
    assert no_t == "NO"


def test_pick_branch_fallback_by_id_order():
    outgoing = [
        {"id": "b", "target": "SECOND"},
        {"id": "a", "target": "FIRST"},
    ]
    yes_t, no_t = _pick_condition_branch_targets(outgoing)
    assert yes_t == "FIRST"
    assert no_t == "SECOND"
