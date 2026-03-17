"""
Tests for Draft/Published isolation.
Runtime uses only published_content; draft changes don't affect bot execution.
"""
import pytest
from unittest.mock import MagicMock

from backend.models.scenario import Scenario, SCENARIO_STATUS_DRAFT, SCENARIO_STATUS_PUBLISHED
from backend.services.scenario_runtime import ScenarioRuntime


def test_runtime_uses_published_content():
    """Runtime returns published_content when available."""
    db = MagicMock()
    scenario = MagicMock(spec=Scenario)
    scenario.published_content = {"nodes": [{"id": "1", "data": {"blockId": "start"}}], "edges": []}
    scenario.content = {"nodes": [{"id": "2", "data": {"blockId": "message"}}], "edges": []}
    scenario.status = SCENARIO_STATUS_PUBLISHED

    runtime = ScenarioRuntime(db)
    content = runtime._get_execution_content(scenario)
    assert content == scenario.published_content
    assert content["nodes"][0]["data"]["blockId"] == "start"


def test_runtime_draft_changes_ignored():
    """Draft (content) changes don't affect runtime when published_content exists."""
    db = MagicMock()
    scenario = MagicMock(spec=Scenario)
    scenario.published_content = {"nodes": [{"id": "p1"}], "edges": []}
    scenario.content = {"nodes": [{"id": "d1", "data": {"title": "Draft only"}}], "edges": []}
    scenario.status = SCENARIO_STATUS_PUBLISHED

    runtime = ScenarioRuntime(db)
    content = runtime._get_execution_content(scenario)
    assert "d1" not in str(content)
    assert "p1" in str(content)


def test_runtime_no_published_returns_none_for_draft():
    """When status is draft and no published_content, runtime returns None."""
    db = MagicMock()
    scenario = MagicMock(spec=Scenario)
    scenario.published_content = None
    scenario.content = {"nodes": [], "edges": []}
    scenario.status = SCENARIO_STATUS_DRAFT

    runtime = ScenarioRuntime(db)
    content = runtime._get_execution_content(scenario)
    assert content is None


def test_get_start_node_uses_published():
    """get_start_node uses published content."""
    db = MagicMock()
    scenario = MagicMock(spec=Scenario)
    scenario.published_content = {
        "nodes": [
            {"id": "start-1", "data": {"blockId": "start", "title": "Start"}},
            {"id": "msg-1", "data": {"blockId": "message"}},
        ],
        "edges": [],
    }
    scenario.content = None
    scenario.status = SCENARIO_STATUS_PUBLISHED

    runtime = ScenarioRuntime(db)
    start = runtime.get_start_node(scenario)
    assert start is not None
    assert start["data"]["blockId"] == "start"
