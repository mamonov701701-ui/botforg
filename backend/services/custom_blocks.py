from __future__ import annotations

import re
import secrets
from datetime import datetime, timezone
from typing import Any, Iterable

from fastapi import HTTPException
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


STATUS_LABELS = {
    CUSTOM_BLOCK_DRAFT: "Черновик",
    CUSTOM_BLOCK_PUBLISHED: "Опубликован",
    CUSTOM_BLOCK_ARCHIVED: "Архив",
}
_CODE_RE = re.compile(r"^[a-z][a-z0-9_]{2,63}$")


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
        "outputs": payload.outputs,
        "connection_rules": payload.connection_rules,
        "supported_channels": payload.supported_channels,
        "runtime_compatibility": payload.runtime_compatibility,
        "simulator_compatibility": payload.simulator_compatibility,
        "limitations": payload.limitations,
        "examples": payload.examples,
        "lifecycle_status": CUSTOM_BLOCK_DRAFT,
        "internal_code": block.stable_key,
    }


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
    code = p.get("internal_code")
    if code and not _CODE_RE.fullmatch(str(code)):
        errors.append("Внутренний код должен быть в lower_snake_case и содержать от 3 до 64 символов")
    system_codes = _system_codes()
    if code and code in system_codes:
        errors.append("Внутренний код конфликтует с системным блоком")
    if version.runtime_kind != "message" or p.get("runtime_compatibility") != "message":
        errors.append("Сейчас безопасно поддерживается только выполнение типа «Сообщение»")
    config = p.get("config_schema") or []
    keys: set[str] = set()
    for field in config:
        key = str(field.get("name") or "")
        if not _CODE_RE.fullmatch(key):
            errors.append(f"Некорректный ключ параметра: {key or 'пустой ключ'}")
        if key in keys:
            errors.append(f"Ключ параметра повторяется: {key}")
        keys.add(key)
    if "text" not in keys:
        errors.append("Исполняемому блоку нужен параметр «Текст сообщения» с ключом text")
    rules = p.get("connection_rules") or {}
    if rules.get("max_outputs") != 1 or int(rules.get("max_inputs", 1)) < 0:
        errors.append("Для типа «Сообщение» разрешена ровно одна исходящая связь")
    if not isinstance(p.get("simulator_compatibility"), bool) or not p.get("simulator_compatibility"):
        errors.append("Блок должен быть совместим с предпросмотром")
    if not (p.get("examples") or []):
        errors.append("Добавьте хотя бы один пример")
    if not str(guide.get("content") or "").strip():
        errors.append("Добавьте пользовательскую инструкцию")
    if not (p.get("limitations") or []):
        warnings.append("Рекомендуется явно описать ограничения")
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
    version = CustomBlockVersion(
        block=block,
        version=1,
        status=CUSTOM_BLOCK_DRAFT,
        title=payload.title.strip() or "Новый блок",
        description=payload.description.strip(),
        category=payload.category or "custom",
        passport=build_passport(block, 1, payload),
        user_guide=payload.user_guide,
        runtime_kind="message",
        runtime_definition={"kind": "message", **payload.runtime_definition},
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
    version.runtime_kind = "message"
    version.runtime_definition = {"kind": "message", **payload.runtime_definition}
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
    db: Session, content: Any, *, previously_referenced: Iterable[int] = ()
) -> None:
    """Reject forged/stale custom references while allowing saved archived ones."""
    previous = set(previously_referenced)
    for version_id in content_version_ids(content):
        version = db.query(CustomBlockVersion).filter(CustomBlockVersion.id == version_id).first()
        if not version:
            raise HTTPException(status_code=422, detail="Сценарий ссылается на неизвестную версию блока")
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
            if data.get("blockId") != "message" or version.runtime_kind != "message":
                raise HTTPException(status_code=422, detail="Исполняемый контракт кастомного блока не поддерживается")


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
        runtimeBlockId="message",
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
        "validation_result": version.validation_result,
        "usage_count": usage_count(db, version.id),
        "created_at": version.created_at,
        "updated_at": version.updated_at,
        "published_at": version.published_at,
        "archived_at": version.archived_at,
    }
