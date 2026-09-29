from __future__ import annotations

import re
import secrets
from datetime import datetime, timezone
from typing import Any, Iterable

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.custom_block import (
    CUSTOM_BLOCK_ARCHIVED,
    CUSTOM_BLOCK_DRAFT,
    CUSTOM_BLOCK_PUBLISHED,
    CustomBlock,
    CustomBlockVersion,
)
from backend.models.scenario import Scenario
from backend.schemas.blocks import BlockCatalogItem, CustomBlockDraftPayload
from backend.services.custom_block_execution.contracts import ExecutionSpec


STATUS_LABELS = {
    CUSTOM_BLOCK_DRAFT: "Черновик",
    CUSTOM_BLOCK_PUBLISHED: "Опубликован",
    CUSTOM_BLOCK_ARCHIVED: "Архив",
}
WIZARD_STEP_NUMBERS = {
    "identity": 1,
    "when": 2,
    "inputs": 3,
    "connections": 4,
    "execution": 5,
    "limitations": 6,
    "examples": 7,
    "guide": 8,
    "review": 9,
}
_CODE_RE = re.compile(r"^[a-z][a-z0-9_]{2,63}$")
_RESERVED_ROUTE_KEYS = {"default", "terminal", "__proto__", "constructor", "prototype"}
_ROUTE_ALIASES = {
    "успех": "success", "ошибка": "error", "да": "yes", "нет": "no",
    "найдено": "found", "не найдено": "not_found", "повторить": "retry",
}


def _wizard_error(step: str, title: str, message: str) -> str:
    return f"Шаг {WIZARD_STEP_NUMBERS[step]} «{title}»: {message}"


def _execution_spec_validation_error(exc: ValidationError) -> str:
    details = exc.errors(include_url=False, include_context=False)
    location = tuple(details[0].get("loc") or ()) if details else ()
    if location and location[0] in {"inputs", "outputs"} and location[-1] == "name":
        entity = "входа" if location[0] == "inputs" else "выхода"
        index = int(location[1]) + 1 if len(location) > 1 and isinstance(location[1], int) else None
        suffix = f" {index}" if index is not None else ""
        return _wizard_error("execution", "Выполнение", f"некорректный машинный ключ {entity}{suffix}")
    if location and location[0] in {"inputs", "outputs"} and location[-1] == "display_name":
        entity = "входа" if location[0] == "inputs" else "выхода"
        index = int(location[1]) + 1 if len(location) > 1 and isinstance(location[1], int) else None
        suffix = f" {index}" if index is not None else ""
        error_type = str(details[0].get("type") or "")
        if error_type == "string_too_long":
            return _wizard_error(
                "inputs" if location[0] == "inputs" else "connections",
                "Входные данные" if location[0] == "inputs" else "Соединения",
                f"название {entity}{suffix} слишком длинное; максимум — 96 символов",
            )
        return _wizard_error(
            "inputs" if location[0] == "inputs" else "connections",
            "Входные данные" if location[0] == "inputs" else "Соединения",
            f"проверьте название {entity}{suffix}",
        )
    if location and location[0] == "runtime_profile":
        return _wizard_error("execution", "Выполнение", "некорректный идентификатор профиля выполнения")
    if location and location[0] == "language":
        return _wizard_error("execution", "Выполнение", "поддерживается только JavaScript")
    return _wizard_error(
        "execution",
        "Выполнение",
        "не удалось сохранить спецификацию выполнения; проверьте код, входы, выходы и настройки",
    )
_CYRILLIC_TRANSLITERATION = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch", "ъ": "",
    "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def _valid_route_key(value: str, occupied: set[str]) -> bool:
    return bool(_CODE_RE.fullmatch(value)) and value not in _RESERVED_ROUTE_KEYS and value not in occupied


def machine_route_key(display_name: str, occupied: Iterable[str] = ()) -> str:
    """Generate the same deterministic, machine-safe route key as the authoring UI."""
    normalized_display = display_name.strip().lower()
    base = _ROUTE_ALIASES.get(normalized_display)
    if base is None:
        transliterated = "".join(_CYRILLIC_TRANSLITERATION.get(char, char) for char in normalized_display)
        base = re.sub(r"[^a-z0-9]+", "_", transliterated).strip("_") or "route"
    if base[0].isdigit():
        base = f"route_{base}"
    if len(base) < 3:
        base = f"{base}_route"
    base = base[:64]
    used = set(occupied)
    if _valid_route_key(base, used):
        return base
    suffix = 2
    while True:
        ending = f"_{suffix}"
        candidate = f"{base[:64 - len(ending)]}{ending}"
        if _valid_route_key(candidate, used):
            return candidate
        suffix += 1


def normalized_connections(passport: dict[str, Any]) -> dict[str, Any]:
    """Read versioned connector facts, with the Stage 7.6 one-in/one-out fallback."""
    rules = dict(passport.get("connection_rules") or {})
    input_count = rules.get("input_count")
    if input_count not in {0, 1}:
        input_count = 1
    raw_outputs = passport.get("outputs") or []
    ports: list[dict[str, str]] = []
    for index, item in enumerate(raw_outputs if isinstance(raw_outputs, list) else []):
        if not isinstance(item, dict):
            continue
        raw_key = str(item.get("name") or "").strip()
        display_name = str(item.get("display_name") or raw_key or f"Выход {index + 1}").strip() or f"Выход {index + 1}"
        occupied = {port["name"] for port in ports}
        key = raw_key if _valid_route_key(raw_key, occupied) else machine_route_key(display_name, occupied)
        ports.append({"name": key, "display_name": display_name})
    # Older passports did not store output ports. Their declared single outgoing edge stays valid.
    if not ports and rules.get("output_count") is None:
        ports = [{"name": "success", "display_name": "Успех"}]
    return {
        "input_count": input_count,
        "output_count": len(ports),
        "max_inputs": input_count,
        "max_outputs": len(ports),
        "outputs": ports,
    }


def validate_connections(passport: dict[str, Any]) -> list[str]:
    contract = normalized_connections(passport)
    errors: list[str] = []
    if contract["input_count"] not in {0, 1}:
        errors.append(_wizard_error("connections", "Соединения", "выберите 0 или 1 вход"))
    if not 0 <= contract["output_count"] <= 32:
        errors.append(_wizard_error("connections", "Соединения", "выберите от 0 до 32 выходов"))
    names = [port["display_name"] for port in contract["outputs"]]
    keys = [port["name"] for port in contract["outputs"]]
    if any(not name.strip() for name in names):
        errors.append(_wizard_error("connections", "Соединения", "названия выходов не могут быть пустыми"))
    if len(names) != len(set(name.casefold() for name in names)):
        errors.append(_wizard_error("connections", "Соединения", "названия выходов должны быть уникальными"))
    if len(keys) != len(set(keys)):
        errors.append(_wizard_error("connections", "Соединения", "машинные ключи выходов должны быть уникальными"))
    for key in keys:
        if not _CODE_RE.fullmatch(key) or key in _RESERVED_ROUTE_KEYS:
            errors.append(_wizard_error("connections", "Соединения", f"недопустимый машинный ключ выхода «{key}»"))
    return errors


def _system_codes() -> set[str]:
    # Local import avoids coupling router import-time registration to this service.
    from backend.routers.blocks import load_blocks_catalog

    return {item.id for item in load_blocks_catalog()}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def is_admin(user: Any) -> bool:
    return str(getattr(user, "role", "")).strip().lower() in {"owner", "admin"}


def require_owner(version: CustomBlockVersion, user: Any) -> None:
    if version.block.owner_user_id != user.id and not is_admin(user):
        raise HTTPException(status_code=403, detail="Нельзя изменять чужой блок")


def build_passport(block: CustomBlock, version_number: int, payload: CustomBlockDraftPayload) -> dict[str, Any]:
    raw = {"connection_rules": payload.connection_rules, "outputs": payload.outputs}
    connections = normalized_connections(raw)
    return {
        "stable_block_id": block.stable_key,
        "version": version_number,
        "owner_user_id": block.owner_user_id,
        "title_ru": payload.title.strip(),
        "description": payload.description.strip(),
        "purpose": payload.purpose.strip(),
        "when_to_use": payload.when_to_use.strip(),
        "category": payload.category or "custom",
        "parameters": [item.model_dump(mode="json") for item in payload.config_schema],
        "config_schema": [item.model_dump(mode="json") for item in payload.config_schema],
        "inputs": payload.inputs,
        "outputs": connections["outputs"],
        "connection_rules": connections,
        "supported_channels": payload.supported_channels,
        "runtime_compatibility": payload.runtime_compatibility,
        "simulator_compatibility": payload.simulator_compatibility,
        "limitations": payload.limitations,
        "examples": payload.examples,
        "lifecycle_status": CUSTOM_BLOCK_DRAFT,
        "internal_code": block.stable_key,
        "wizard_step": payload.wizard_step,
    }


def _draft_execution_spec(payload: CustomBlockDraftPayload) -> tuple[str, dict[str, Any] | None, str | None]:
    """Validate and canonicalize the only new executable kind before persistence."""
    if payload.runtime_compatibility == "message":
        if payload.execution_spec is not None:
            raise HTTPException(status_code=422, detail=_wizard_error("execution", "Выполнение", "Message fallback не принимает спецификацию JavaScript"))
        return "message", None, None
    if payload.runtime_compatibility != "javascript":
        raise HTTPException(status_code=422, detail=_wizard_error("execution", "Выполнение", "неизвестный тип выполнения"))
    if payload.execution_spec is None:
        raise HTTPException(status_code=422, detail=_wizard_error("execution", "Выполнение", "для JavaScript нужна спецификация выполнения"))
    try:
        spec = ExecutionSpec.model_validate(payload.execution_spec)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=_execution_spec_validation_error(exc)) from exc
    contract = normalized_connections({"connection_rules": payload.connection_rules, "outputs": payload.outputs})
    if {port.name for port in spec.outputs} != {port["name"] for port in contract["outputs"]}:
        raise HTTPException(status_code=422, detail=_wizard_error("connections", "Соединения", "выходы JavaScript не совпадают с контрактом"))
    payload_input_keys = {str(item.get("name") or "") for item in payload.inputs if isinstance(item, dict)}
    if {port.name for port in spec.inputs} != payload_input_keys:
        raise HTTPException(status_code=422, detail=_wizard_error("inputs", "Входные данные", "входы JavaScript не совпадают с контрактом"))
    return "javascript", spec.model_dump(mode="json"), spec.artifact_hash()


def validate_version(version: CustomBlockVersion) -> dict[str, Any]:
    p = version.passport or {}
    guide = version.user_guide or {}
    errors: list[str] = []
    warnings: list[str] = []
    required = {
        "title_ru": "Укажите название блока",
        "description": "Добавьте краткое описание",
        "purpose": "Опишите назначение блока",
        "when_to_use": "Объясните, когда использовать блок",
    }
    for key, message in required.items():
        if not str(p.get(key) or "").strip():
            errors.append(message)
    errors.extend(validate_connections(p))
    code = p.get("internal_code")
    if code and not _CODE_RE.fullmatch(str(code)):
        errors.append("Внутренний код должен быть в lower_snake_case и содержать от 3 до 64 символов")
    system_codes = _system_codes()
    if code and code in system_codes:
        errors.append("Внутренний код конфликтует с системным блоком")
    if version.runtime_kind == "message":
        if p.get("runtime_compatibility") != "message":
            errors.append("Для legacy-блока нужен тип выполнения «Сообщение»")
        if normalized_connections(p)["output_count"] > 1:
            errors.append(_wizard_error("execution", "Выполнение", "Message fallback поддерживает не более одного выхода; для нескольких выходов включите JavaScript Runtime"))
    elif version.runtime_kind == "javascript":
        try:
            spec = ExecutionSpec.model_validate(version.execution_spec)
            if spec.artifact_hash() != version.execution_artifact_hash:
                errors.append("Контрольная сумма исполняемого артефакта не совпадает")
            passport_routes = {str(item.get("name") or "") for item in (p.get("outputs") or []) if isinstance(item, dict)}
            spec_routes = {port.name for port in spec.outputs}
            if passport_routes != spec_routes:
                errors.append(_wizard_error("connections", "Соединения", "выходы паспорта и спецификации выполнения не совпадают"))
            if len(spec.outputs) > 1 and "return" not in spec.source:
                errors.append(_wizard_error("execution", "Выполнение", "функция run(envelope) должна вернуть route для нескольких выходов"))
            if not re.search(r"function\s+run\s*\(", spec.source):
                errors.append(_wizard_error("execution", "Выполнение", "определите функцию run(envelope)"))
            if not re.search(r"return\s*\{", spec.source):
                errors.append(_wizard_error("execution", "Выполнение", "run(envelope) должна вернуть объект { outputs, route, logs }"))
            literal_routes = re.findall(r"route\s*:\s*['\"]([^'\"]+)['\"]", spec.source)
            if any(route not in spec_routes for route in literal_routes):
                errors.append(_wizard_error("execution", "Выполнение", f"route не соответствует выходу из шага {WIZARD_STEP_NUMBERS['connections']}"))
            if not spec_routes and literal_routes:
                errors.append(_wizard_error("execution", "Выполнение", "терминальный блок не может возвращать route"))
        except Exception:
            errors.append(_wizard_error("execution", "Выполнение", "некорректная спецификация JavaScript-выполнения"))
    else:
        errors.append("Неизвестный тип выполнения")
    config = p.get("config_schema") or []
    keys: set[str] = set()
    for field in config:
        key = str(field.get("name") or "")
        if not _CODE_RE.fullmatch(key):
            errors.append(f"Некорректный ключ параметра: {key or 'пустой ключ'}")
        if key in keys:
            errors.append(f"Ключ параметра повторяется: {key}")
        keys.add(key)
    if version.runtime_kind == "message" and "text" not in keys:
        errors.append("Исполняемому блоку нужен параметр «Текст сообщения» с ключом text")
    rules = p.get("connection_rules") or {}
    if version.runtime_kind == "message" and normalized_connections(p)["input_count"] not in {0, 1}:
        errors.append(_wizard_error("connections", "Соединения", "для типа «Сообщение» допустимы только 0 или 1 вход"))
    if not isinstance(p.get("simulator_compatibility"), bool) or not p.get("simulator_compatibility"):
        errors.append("Блок должен быть совместим с предпросмотром")
    if not (p.get("examples") or []):
        errors.append(_wizard_error("examples", "Примеры", "добавьте хотя бы один реальный пример"))
    if not str(guide.get("content") or "").strip():
        errors.append(_wizard_error("guide", "Пользовательская инструкция", "добавьте инструкцию"))
    if not (p.get("limitations") or []):
        warnings.append(
            _wizard_error(
                "limitations",
                "Ограничения",
                "рекомендуется явно описать ограничения",
            )
        )
    return {"valid": not errors, "errors": errors, "warnings": warnings}


def create_draft(db: Session, user: Any, payload: CustomBlockDraftPayload) -> CustomBlockVersion:
    code = (payload.internal_code or "").strip() or f"custom_{secrets.token_hex(8)}"
    if db.query(CustomBlock).filter(CustomBlock.stable_key == code).first():
        raise HTTPException(status_code=409, detail="Блок с таким внутренним кодом уже существует")
    if code in _system_codes():
        raise HTTPException(status_code=409, detail="Внутренний код занят системным блоком")
    block = CustomBlock(stable_key=code, owner_user_id=user.id, created_by_user_id=user.id)
    db.add(block)
    db.flush()
    runtime_kind, execution_spec, artifact_hash = _draft_execution_spec(payload)
    version = CustomBlockVersion(
        block=block,
        version=1,
        status=CUSTOM_BLOCK_DRAFT,
        title=payload.title.strip() or "Новый блок",
        description=payload.description.strip(),
        category=payload.category or "custom",
        passport=build_passport(block, 1, payload),
        user_guide=payload.user_guide,
        runtime_kind=runtime_kind,
        runtime_definition={**payload.runtime_definition, "kind": runtime_kind},
        execution_spec=execution_spec,
        execution_artifact_hash=artifact_hash,
    )
    db.add(version)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Конфликт внутреннего кода блока") from exc
    db.refresh(version)
    return version


def update_draft(version: CustomBlockVersion, payload: CustomBlockDraftPayload) -> None:
    if version.status != CUSTOM_BLOCK_DRAFT:
        raise HTTPException(status_code=409, detail="Опубликованную или архивную версию нельзя редактировать")
    version.title = payload.title.strip() or "Новый блок"
    version.description = payload.description.strip()
    version.category = payload.category or "custom"
    version.passport = build_passport(version.block, version.version, payload)
    version.user_guide = payload.user_guide
    runtime_kind, execution_spec, artifact_hash = _draft_execution_spec(payload)
    version.runtime_kind = runtime_kind
    version.runtime_definition = {**payload.runtime_definition, "kind": runtime_kind}
    version.execution_spec = execution_spec
    version.execution_artifact_hash = artifact_hash
    version.validation_result = None


def create_new_version(db: Session, source: CustomBlockVersion) -> CustomBlockVersion:
    if source.status not in {CUSTOM_BLOCK_PUBLISHED, CUSTOM_BLOCK_ARCHIVED}:
        raise HTTPException(status_code=409, detail="Новую версию можно создать только из опубликованной или архивной")
    existing_draft = db.query(CustomBlockVersion).filter(
        CustomBlockVersion.custom_block_id == source.custom_block_id,
        CustomBlockVersion.status == CUSTOM_BLOCK_DRAFT,
    ).first()
    if existing_draft:
        raise HTTPException(status_code=409, detail="У блока уже есть черновик новой версии")
    next_number = int(db.query(func.max(CustomBlockVersion.version)).filter(
        CustomBlockVersion.custom_block_id == source.custom_block_id
    ).scalar() or 0) + 1
    passport = dict(source.passport or {})
    passport.update({"version": next_number, "lifecycle_status": CUSTOM_BLOCK_DRAFT})
    draft = CustomBlockVersion(
        custom_block_id=source.custom_block_id,
        parent_version_id=source.id,
        version=next_number,
        status=CUSTOM_BLOCK_DRAFT,
        title=source.title,
        description=source.description,
        category=source.category,
        passport=passport,
        user_guide=dict(source.user_guide or {}),
        runtime_kind=source.runtime_kind,
        runtime_definition=dict(source.runtime_definition or {}),
        execution_spec=dict(source.execution_spec or {}) if source.execution_spec else None,
        execution_artifact_hash=source.execution_artifact_hash,
        execution_state="enabled",
    )
    db.add(draft)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Версия была создана параллельным запросом") from exc
    db.refresh(draft)
    return draft


def _content_uses_version(content: Any, version_id: int) -> bool:
    if not isinstance(content, dict):
        return False
    for node in content.get("nodes") or []:
        data = node.get("data") if isinstance(node, dict) else None
        if isinstance(data, dict) and data.get("customBlockVersionId") == version_id:
            return True
    return False


def content_version_ids(content: Any) -> set[int]:
    if not isinstance(content, dict):
        return set()
    result: set[int] = set()
    for node in content.get("nodes") or []:
        data = node.get("data") if isinstance(node, dict) else None
        value = data.get("customBlockVersionId") if isinstance(data, dict) else None
        if isinstance(value, int):
            result.add(value)
    return result


def validate_scenario_custom_block_references(
    db: Session, content: Any, *, previously_referenced: Iterable[int] = (), scenario_owner_id: int | None = None
) -> None:
    """Reject forged/stale custom references while allowing saved archived ones."""
    previous = set(previously_referenced)
    for version_id in content_version_ids(content):
        version = db.query(CustomBlockVersion).filter(CustomBlockVersion.id == version_id).first()
        if not version:
            raise HTTPException(status_code=422, detail="Сценарий ссылается на неизвестную версию блока")
        if scenario_owner_id is not None and version.block.owner_user_id != scenario_owner_id:
            raise HTTPException(status_code=403, detail="Сценарий не имеет права использовать чужую версию блока")
        if version.status == CUSTOM_BLOCK_DRAFT:
            raise HTTPException(status_code=422, detail="Черновик блока нельзя использовать в сценарии")
        if version.status == CUSTOM_BLOCK_ARCHIVED and version_id not in previous:
            raise HTTPException(status_code=422, detail="Архивную версию блока нельзя добавить в новый сценарий")
        matching_nodes = [
            node for node in (content.get("nodes") or [])
            if isinstance(node, dict)
            and isinstance(node.get("data"), dict)
            and node["data"].get("customBlockVersionId") == version_id
        ]
        for node in matching_nodes:
            data = node["data"]
            if data.get("customBlockStableId") != version.block.stable_key or data.get("customBlockVersion") != version.version:
                raise HTTPException(status_code=422, detail="Ссылка на версию кастомного блока повреждена")
            expected_block_id = "custom" if version.runtime_kind == "javascript" else "message"
            if data.get("blockId") != expected_block_id:
                raise HTTPException(status_code=422, detail="Исполняемый контракт кастомного блока не поддерживается")
            if version.runtime_kind == "javascript":
                declared_routes = {port["name"] for port in normalized_connections(version.passport or {})["outputs"]}
                outgoing = [
                    edge for edge in (content.get("edges") or [])
                    if isinstance(edge, dict) and str(edge.get("source")) == str(node.get("id"))
                ]
                route_handles = [str(edge.get("sourceHandle") or "") for edge in outgoing]
                if any(handle not in declared_routes for handle in route_handles):
                    raise HTTPException(status_code=422, detail="Связь использует неизвестный маршрут кастомного блока")
                if len(route_handles) != len(set(route_handles)):
                    raise HTTPException(status_code=422, detail="Один маршрут кастомного блока нельзя соединить с несколькими следующими блоками")


def usage_count(db: Session, version_id: int) -> int:
    return sum(
        1 for scenario in db.query(Scenario).all()
        if _content_uses_version(scenario.content, version_id)
        or _content_uses_version(scenario.published_content, version_id)
    )


def to_catalog_item(version: CustomBlockVersion) -> BlockCatalogItem:
    p = version.passport or {}
    schema = p.get("config_schema") or []
    return BlockCatalogItem(
        id=f"custom:{version.block.stable_key}:v{version.version}",
        title=version.title,
        category="custom",
        description=version.description,
        icon="🧩",
        color="#7c3aed",
        planAccess=["free", "pro", "enterprise"],
        permissions=["owner", "admin", "manager_template", "developer", "support", "viewer"],
        configSchema=schema,
        source="custom",
        stableBlockId=version.block.stable_key,
        blockVersionId=version.id,
        version=version.version,
        lifecycleStatus=version.status,
        runtimeBlockId="custom" if version.runtime_kind == "javascript" else "message",
        passport=p,
        userGuide=version.user_guide or {},
    )


def serialize_version(db: Session, version: CustomBlockVersion) -> dict[str, Any]:
    return {
        "id": version.id,
        "stable_block_id": version.block.stable_key,
        "owner_user_id": version.block.owner_user_id,
        "version": version.version,
        "parent_version_id": version.parent_version_id,
        "status": version.status,
        "status_label": STATUS_LABELS[version.status],
        "title": version.title,
        "description": version.description,
        "category": version.category,
        "passport": version.passport or {},
        "user_guide": version.user_guide or {},
        "runtime_kind": version.runtime_kind,
        "runtime_definition": version.runtime_definition or {},
        "execution_spec": version.execution_spec,
        "execution_artifact_hash": version.execution_artifact_hash,
        "execution_state": version.execution_state,
        "validation_result": version.validation_result,
        "usage_count": usage_count(db, version.id),
        "created_at": version.created_at,
        "updated_at": version.updated_at,
        "published_at": version.published_at,
        "archived_at": version.archived_at,
    }
