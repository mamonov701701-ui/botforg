"""EditorV2 graph shape (type=default + data.blockId) in channel_runtime."""
from __future__ import annotations

from backend.services.channel_runtime import _find_start_node, resolve_node_kind


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
