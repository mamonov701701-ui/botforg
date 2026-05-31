"""Единый runtime для channel_webhooks (prod-каналы)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy.orm import Session

from backend.channels.base import ChannelAdapter, NormalizedUpdate
from backend.models.bot import Bot
from backend.models.bot_channel import BotChannelConnection
from backend.models.scenario import SCENARIO_STATUS_PUBLISHED, Scenario
from backend.services.bot_crm.crm_service import get_or_create_bot_user
from backend.services.constructor.tag_service import TagService
from backend.services.constructor.validation import validate_snake_case_key, validate_tag_key
from backend.services.constructor.variable_service import VariableService
from backend.services.message_template.runtime_outbound import render_outbound_message_text
from backend.services.bot_crm.overview_aggregate_service import mark_crm_overview_dirty
from backend.services.scenario_flow.input_block import (
    apply_input_success_to_ctor_user,
    pick_error_target_id,
    pick_success_target_id,
)
from backend.utils.ctor_bot_resolve import ensure_ctor_bot_id, resolve_ctor_bot_id

STATE_NODE_KEY = "sys_runtime_node_id"
STATE_SCENARIO_KEY = "sys_runtime_scenario_id"


def _parse_credentials(conn: BotChannelConnection) -> dict[str, Any]:
    import json

    if not conn.credentials_json:
        return {}
    try:
        data = json.loads(conn.credentials_json)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _resolve_content(scenario: Scenario) -> Optional[dict[str, Any]]:
    if scenario.published_content:
        return scenario.published_content
    if scenario.status == SCENARIO_STATUS_PUBLISHED:
        return scenario.content
    return None


def _find_scenario_for_bot(db: Session, bot_id: int) -> Optional[Scenario]:
    main = (
        db.query(Scenario)
        .filter(Scenario.bot_id == bot_id, Scenario.is_main == True)
        .order_by(Scenario.id.asc())
        .first()
    )
    if main:
        return main
    return db.query(Scenario).filter(Scenario.bot_id == bot_id).order_by(Scenario.id.asc()).first()


def resolve_node_kind(node: dict[str, Any]) -> str:
    """Тип блока сценария: EditorV2 (data.blockId) или legacy (top-level type)."""
    data = node.get("data") or {}
    if not isinstance(data, dict):
        data = {}
    block_id = data.get("blockId")
    if block_id:
        return str(block_id).lower()
    node_type = node.get("type")
    if node_type and str(node_type).lower() != "default":
        return str(node_type).lower()
    return ""


def _find_start_node(nodes: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    for node in nodes:
        data = node.get("data") or {}
        if not isinstance(data, dict):
            data = {}
        if str(data.get("blockId", "")).lower() == "start":
            return node
    for node in nodes:
        data = node.get("data") or {}
        if not isinstance(data, dict):
            data = {}
        if data.get("is_start") is True:
            return node
    return nodes[0] if nodes else None


def _edge_label(edge: dict[str, Any]) -> str:
    return str(((edge.get("data") or {}).get("label") or "")).strip()


def _next_edges(edges: list[dict[str, Any]], node_id: str) -> list[dict[str, Any]]:
    return [e for e in edges if str(e.get("source")) == node_id]


def _find_node(nodes: list[dict[str, Any]], node_id: str) -> Optional[dict[str, Any]]:
    return next((n for n in nodes if str(n.get("id")) == node_id), None)


def _has_real_user_input(normalized: NormalizedUpdate) -> bool:
    text = str(normalized.text or "").strip()
    if text:
        return True
    raw = normalized.raw if isinstance(normalized.raw, dict) else {}
    # Единый критерий user input: callback/button press из входящего апдейта.
    callback_data = (
        raw.get("callback_data")
        or raw.get("data")
        or ((raw.get("callback_query") or {}).get("data") if isinstance(raw.get("callback_query"), dict) else None)
    )
    if isinstance(callback_data, str) and callback_data.strip():
        return True
    return False


def _send_node(
    db: Session,
    *,
    adapter: ChannelAdapter,
    conn: BotChannelConnection,
    chat_id: str,
    node: dict[str, Any],
    ctor_user_id: int,
) -> None:
    settings = (node.get("data") or {}).get("settings") or {}
    text = str(settings.get("text") or (node.get("data") or {}).get("label") or "").strip()
    if text and "{{" in text:
        text = render_outbound_message_text(
            db,
            bot_user_id=ctor_user_id,
            template_text=text,
            session_id=None,
        )
    if not text:
        text = " "
    credentials = _parse_credentials(conn)
    adapter.send_text(chat_id=chat_id, text=text, credentials=credentials, buttons=None)


def _apply_action(
    db: Session,
    *,
    ctor_user_id: int,
    settings: dict[str, Any],
    last_input_text: str,
) -> None:
    mode = str(settings.get("mode") or "").strip()
    if not mode:
        return
    vs = VariableService(db)
    ts = TagService(db)

    def resolve_template(raw: Any) -> str:
        base = raw if isinstance(raw, str) else str(raw or "")
        if "{{" not in base:
            return base.replace("{{input}}", last_input_text)
        rendered = render_outbound_message_text(
            db,
            bot_user_id=ctor_user_id,
            template_text=base,
            session_id=None,
        )
        return rendered

    if mode == "field":
        action = str(settings.get("fieldAction") or "").strip()
        field = str(settings.get("fieldKey") or "").strip()
        if not field or validate_snake_case_key(field):
            return
        if action == "set":
            value = resolve_template(settings.get("fieldValue"))
            vs.set_user_variable(ctor_user_id, field, value, commit=True)
        elif action == "clear":
            vs.set_user_variable(ctor_user_id, field, "", commit=True)
        return

    if mode == "tag":
        action = str(settings.get("tagAction") or "").strip()
        tag = str(settings.get("tag") or "").strip()
        if not tag or validate_tag_key(tag):
            return
        if action == "add":
            ts.add_tag_to_user(ctor_user_id, tag, assigned_by="channel_runtime", commit=True)
        elif action == "remove":
            ts.remove_tag_from_user(ctor_user_id, tag, commit=True)
        return

    if mode == "status":
        action = str(settings.get("statusAction") or "").strip()
        if action == "set":
            status_value = resolve_template(settings.get("status")).strip()
            if status_value:
                user = vs._repo.get_bot_user(ctor_user_id)
                if user:
                    user.status = status_value
                    db.commit()
                    mark_crm_overview_dirty(user.bot_id, user.environment)
        elif action == "clear":
            user = vs._repo.get_bot_user(ctor_user_id)
            if user:
                user.status = "active"
                db.commit()
                mark_crm_overview_dirty(user.bot_id, user.environment)


def process_channel_update(
    db: Session,
    *,
    bot: Bot,
    conn: BotChannelConnection,
    adapter: ChannelAdapter,
    normalized: NormalizedUpdate,
) -> None:
    ctor_bot_id = ensure_ctor_bot_id(db, bot.id) or resolve_ctor_bot_id(db, bot.id)
    if not ctor_bot_id:
        return
    external_user_id = str(normalized.chat_id or normalized.user_id or "").strip()
    chat_id = str(normalized.chat_id or "").strip()
    if not external_user_id or not chat_id:
        return
    user = get_or_create_bot_user(
        db,
        ctor_bot_id=ctor_bot_id,
        channel=normalized.channel,
        external_user_id=external_user_id,
        environment="prod",
        username=str(normalized.user_id) if normalized.user_id else None,
        commit=True,
    )
    if _has_real_user_input(normalized):
        user.last_message_at = datetime.now(timezone.utc)
        db.commit()
        mark_crm_overview_dirty(ctor_bot_id, "prod")

    scenario = _find_scenario_for_bot(db, bot.id)
    if not scenario:
        return
    content = _resolve_content(scenario)
    if not content:
        return
    nodes = content.get("nodes") or []
    edges = content.get("edges") or []
    if not nodes:
        return

    vs = VariableService(db)
    node_var = vs.get_user_variable_by_key(user.id, STATE_NODE_KEY)
    cur_node_id = node_var.data.value_text if node_var.ok and node_var.data else None
    current = _find_node(nodes, str(cur_node_id)) if cur_node_id else None
    if current is None:
        current = _find_start_node(nodes)
        if current is None:
            return
        _send_node(db, adapter=adapter, conn=conn, chat_id=chat_id, node=current, ctor_user_id=user.id)
        vs.set_user_variable(user.id, STATE_NODE_KEY, str(current.get("id")), commit=True)
        vs.set_user_variable(user.id, STATE_SCENARIO_KEY, str(scenario.id), commit=True)
        return

    user_text = str(normalized.text or "").strip()
    button_label = user_text
    next_node: Optional[dict[str, Any]] = None
    current_kind = resolve_node_kind(current)
    outgoing = _next_edges(edges, str(current.get("id")))

    if current_kind == "input":
        settings = (current.get("data") or {}).get("settings") or {}
        if not user_text:
            return
        save_res = apply_input_success_to_ctor_user(
            db,
            bot_id=ctor_bot_id,
            bot_user_id=user.id,
            settings=settings,
            raw_answer=user_text,
            commit=True,
        )
        if not save_res.ok:
            err_target_id = pick_error_target_id(outgoing, str(current.get("id")))
            if err_target_id:
                next_node = _find_node(nodes, err_target_id)
            else:
                return
        else:
            success_target_id = pick_success_target_id(outgoing, str(current.get("id")))
            if success_target_id:
                next_node = _find_node(nodes, success_target_id)
            elif outgoing:
                next_node = _find_node(nodes, str(outgoing[0].get("target")))
    elif current_kind == "button":
        selected = next((e for e in outgoing if _edge_label(e) == button_label), None)
        if selected is None and outgoing:
            selected = outgoing[0]
        if selected:
            next_node = _find_node(nodes, str(selected.get("target")))
    else:
        if outgoing:
            next_node = _find_node(nodes, str(outgoing[0].get("target")))

    # Автоматическое выполнение service-цепочки.
    while next_node and resolve_node_kind(next_node) == "action":
        _apply_action(
            db,
            ctor_user_id=user.id,
            settings=((next_node.get("data") or {}).get("settings") or {}),
            last_input_text=user_text,
        )
        out2 = _next_edges(edges, str(next_node.get("id")))
        next_node = _find_node(nodes, str(out2[0].get("target"))) if out2 else None

    if next_node is None:
        vs.set_user_variable(user.id, STATE_NODE_KEY, "", commit=True)
        return

    _send_node(db, adapter=adapter, conn=conn, chat_id=chat_id, node=next_node, ctor_user_id=user.id)
    vs.set_user_variable(user.id, STATE_NODE_KEY, str(next_node.get("id")), commit=True)
    vs.set_user_variable(user.id, STATE_SCENARIO_KEY, str(scenario.id), commit=True)
