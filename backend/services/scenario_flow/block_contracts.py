"""Static core contracts for scenario blocks; this is deliberately not a registry."""
from __future__ import annotations

from enum import StrEnum
from typing import Any
from backend.services.constructor.validation import validate_snake_case_key


class ScenarioFormat(StrEnum):
    CANONICAL = "canonical"
    LEGACY = "legacy"
    MIXED_UNSAFE = "mixed_unsafe"


CANONICAL_BLOCK_CODES = frozenset({"start", "message", "input", "condition", "set_variable", "end"})
LEGACY_ALIASES = {"variable": "set_variable", "button": "message", "action": "action"}
CONDITION_HANDLES = frozenset({"condition_yes", "condition_no"})

BLOCK_CONTRACTS = {
    "start": {"terminal": False, "incoming_max": 0, "outgoing_max": 1, "handles": frozenset(), "required_settings": frozenset(), "reads": frozenset(), "writes": frozenset()},
    "message": {"terminal": False, "incoming_max": None, "outgoing_max": None, "handles": frozenset(), "required_settings": frozenset(), "reads": frozenset({"interpolation"}), "writes": frozenset()},
    "input": {"terminal": False, "incoming_max": None, "outgoing_max": None, "handles": frozenset({"success", "error"}), "required_settings": frozenset({"variable_key"}), "reads": frozenset(), "writes": frozenset({"variable"})},
    "condition": {"terminal": False, "incoming_max": None, "outgoing_max": 2, "handles": CONDITION_HANDLES, "required_settings": frozenset({"variable", "operator"}), "reads": frozenset({"variable"}), "writes": frozenset()},
    "set_variable": {"terminal": False, "incoming_max": None, "outgoing_max": 1, "handles": frozenset(), "required_settings": frozenset({"key", "value"}), "reads": frozenset(), "writes": frozenset({"variable"})},
    "end": {"terminal": True, "incoming_max": None, "outgoing_max": 0, "handles": frozenset(), "required_settings": frozenset(), "reads": frozenset(), "writes": frozenset()},
}


def normalize_block_code(code: Any) -> str | None:
    value = str(code or "").strip().lower()
    if value in CANONICAL_BLOCK_CODES:
        return value
    return LEGACY_ALIASES.get(value)


def classify_scenario_content(content: dict[str, Any] | None) -> ScenarioFormat:
    nodes = (content or {}).get("nodes")
    if not isinstance(nodes, list) or not nodes:
        return ScenarioFormat.LEGACY
    canonical = legacy = False
    for node in nodes:
        if not isinstance(node, dict):
            return ScenarioFormat.MIXED_UNSAFE
        data = node.get("data")
        if isinstance(data, dict) and data.get("blockId"):
            canonical = True
        elif node.get("type"):
            legacy = True
        else:
            legacy = True
    if canonical and legacy:
        return ScenarioFormat.MIXED_UNSAFE
    return ScenarioFormat.CANONICAL if canonical else ScenarioFormat.LEGACY


def discover_start_node(content: dict[str, Any] | None) -> tuple[dict[str, Any] | None, str | None]:
    """Resolve an execution entry point without guessing unsafe canonical content.

    The tuple is ``(node, diagnostic_code)``.  Legacy documents retain their
    historical first-node fallback; canonical and mixed documents never do.
    """
    nodes = (content or {}).get("nodes")
    if not isinstance(nodes, list) or not nodes:
        return None, "missing_start"

    scenario_format = classify_scenario_content(content)
    if scenario_format is ScenarioFormat.MIXED_UNSAFE:
        return None, "mixed_unsafe"

    canonical_starts = [
        node
        for node in nodes
        if isinstance(node, dict)
        and str((node.get("data") or {}).get("blockId", "")).lower() == "start"
    ]
    if scenario_format is ScenarioFormat.CANONICAL:
        if len(canonical_starts) != 1:
            return None, "missing_start" if not canonical_starts else "duplicate_start"
        return canonical_starts[0], None

    # Compatibility path for legacy graphs only.
    if canonical_starts:
        return canonical_starts[0], None
    for node in nodes:
        if isinstance(node, dict) and (node.get("data") or {}).get("is_start") is True:
            return node, None
    return next((node for node in nodes if isinstance(node, dict)), None), None


def validate_canonical_graph(content: dict[str, Any]) -> list[str]:
    """Return stable diagnostic codes; callers choose save/publish presentation."""
    if classify_scenario_content(content) is not ScenarioFormat.CANONICAL:
        return ["mixed_unsafe" if classify_scenario_content(content) is ScenarioFormat.MIXED_UNSAFE else "legacy_content"]
    nodes = content.get("nodes", [])
    edges = content.get("edges", []) if isinstance(content.get("edges"), list) else []
    codes = [str((n.get("data") or {}).get("blockId", "")).lower() for n in nodes if isinstance(n, dict)]
    result: list[str] = []
    if codes.count("start") == 0: result.append("missing_start")
    if codes.count("start") > 1: result.append("duplicate_start")
    unknown = [code for code in codes if code not in CANONICAL_BLOCK_CODES]
    if unknown: result.append("unknown_block")
    by_id = {str(n.get("id")): str((n.get("data") or {}).get("blockId", "")).lower() for n in nodes if isinstance(n, dict)}
    outgoing: dict[str, list[dict[str, Any]]] = {}
    incoming: dict[str, int] = {}
    for edge in edges:
        if not isinstance(edge, dict): continue
        source, target = str(edge.get("source")), str(edge.get("target"))
        outgoing.setdefault(source, []).append(edge); incoming[target] = incoming.get(target, 0) + 1
    for node_id, code in by_id.items():
        contract = BLOCK_CONTRACTS.get(code)
        if not contract: continue
        out = outgoing.get(node_id, [])
        if contract["incoming_max"] == 0 and incoming.get(node_id, 0): result.append("start_incoming")
        if contract["outgoing_max"] is not None and len(out) > contract["outgoing_max"]: result.append(f"{code}_outgoing")
        if code == "condition":
            handles = [str(e.get("sourceHandle") or "") for e in out]
            if any(h not in CONDITION_HANDLES for h in handles): result.append("condition_handle")
            if len(handles) != len(set(handles)): result.append("condition_duplicate_handle")
            settings = next((n.get("data", {}).get("settings") for n in nodes if str(n.get("id")) == node_id), {})
            if not isinstance(settings, dict) or str(settings.get("operator") or "") not in {
                "equals", "notEquals", "contains", "greaterThan", "lessThan", "isEmpty", "isNotEmpty"
            }:
                result.append("condition_operator")
        if code == "input":
            settings = next((n.get("data", {}).get("settings") for n in nodes if str(n.get("id")) == node_id), {})
            if not isinstance(settings, dict) or not settings.get("variable_key"):
                result.append("input_variable_key")
            elif validate_snake_case_key(str(settings["variable_key"])):
                result.append("input_variable_key")
            validation = settings.get("validation") if isinstance(settings, dict) else None
            if not isinstance(validation, dict) or validation.get("type", "string") not in {"string", "number", "email", "phone", "date"}:
                result.append("input_validation_type")
        if code == "set_variable":
            from backend.services.scenario_flow.set_variable import validate_set_variable_settings
            settings = next((n.get("data", {}).get("settings") for n in nodes if str(n.get("id")) == node_id), None)
            result.extend(f"set_variable_{error}" for error in validate_set_variable_settings(settings))
    return result
