import json
import os
from datetime import datetime, timezone
from typing import List, Optional

from backend.schemas.blocks import (
    VALID_PLANS,
    VALID_ROLES,
    BlockCatalogItem,
    CustomBlockDraftPayload,
    CustomBlockValidationOut,
    CustomBlockReviewDecisionPayload,
    CustomBlockVersionOut,
)
from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.dependencies.tariff_admin import require_tariff_admin
from backend.models.user import User
from backend.models.custom_block import (
    CUSTOM_BLOCK_ARCHIVED,
    CUSTOM_BLOCK_DRAFT,
    CUSTOM_BLOCK_PUBLISHED,
    CUSTOM_BLOCK_REVIEW_APPROVED,
    CustomBlockVersion,
)
from backend.services.custom_blocks import (
    create_draft,
    create_new_version,
    require_owner,
    serialize_version,
    submit_for_review,
    record_manual_decision,
    to_catalog_item,
    update_draft,
    usage_count,
    validate_version,
)
from backend.services.custom_block_execution.service import (
    ControlledExecutionFailure, execute_version, resolve_authorized_version,
)
from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.orm import Session

router = APIRouter(prefix="/blocks", tags=["Blocks"])

# Путь к файлу каталога блоков
BLOCKS_CATALOG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "data", "editor_blocks.json"
)


def load_blocks_catalog() -> List[BlockCatalogItem]:
    """Загрузка каталога блоков из JSON файла"""
    try:
        with open(BLOCKS_CATALOG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Валидация через Pydantic
            return [BlockCatalogItem(**block) for block in data]
    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail=f"Blocks catalog file not found: {BLOCKS_CATALOG_PATH}",
        )
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=500, detail=f"Invalid JSON in blocks catalog: {str(e)}"
        )
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error loading blocks catalog: {str(e)}"
        )


@router.get("/learn-catalog", response_model=List[BlockCatalogItem])
def get_blocks_learn_catalog():
    """
    Полный каталог блоков для страницы «Возможности» / обучения.
    Без авторизации — только описания и схемы полей из публичного JSON.
    """
    return [b for b in load_blocks_catalog() if not b.disabled]


@router.get("/admin-catalog", response_model=List[BlockCatalogItem])
def get_blocks_admin_catalog(
    _admin: User = Depends(require_tariff_admin),
):
    """Полный read-only каталог для платформенного управления блоками.

    В отличие от пользовательского каталога, возвращает также отключённые
    записи, чтобы администратор видел фактический источник конфигурации. Секретов
    и пользовательских данных каталог не содержит.
    """
    return load_blocks_catalog()


def _version_or_404(db: Session, version_id: int) -> CustomBlockVersion:
    version = db.query(CustomBlockVersion).filter(CustomBlockVersion.id == version_id).first()
    if not version:
        raise HTTPException(status_code=404, detail="Версия блока не найдена")
    return version


@router.get("/custom/mine", response_model=List[CustomBlockVersionOut])
def get_my_custom_blocks(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    rows = (
        db.query(CustomBlockVersion)
        .join(CustomBlockVersion.block)
        .filter(CustomBlockVersion.block.has(owner_user_id=current_user.id))
        .order_by(CustomBlockVersion.updated_at.desc())
        .all()
    )
    return [serialize_version(db, row) for row in rows]


@router.get("/custom/admin", response_model=List[CustomBlockVersionOut])
def get_all_custom_blocks_admin(
    db: Session = Depends(get_db), _admin: User = Depends(require_tariff_admin)
):
    rows = db.query(CustomBlockVersion).order_by(CustomBlockVersion.updated_at.desc()).all()
    return [serialize_version(db, row) for row in rows]


@router.get("/custom/admin/review-queue", response_model=List[CustomBlockVersionOut])
def get_custom_block_review_queue(
    db: Session = Depends(get_db), _admin: User = Depends(require_tariff_admin)
):
    """Admin-only queue; reports and decisions are returned with their exact version."""
    from backend.models.custom_block import CUSTOM_BLOCK_REVIEW_ADMIN_PENDING
    rows = (db.query(CustomBlockVersion)
            .filter(CustomBlockVersion.status == CUSTOM_BLOCK_DRAFT,
                    CustomBlockVersion.review_state == CUSTOM_BLOCK_REVIEW_ADMIN_PENDING)
            .order_by(CustomBlockVersion.updated_at.asc()).all())
    return [serialize_version(db, row) for row in rows]


@router.post("/custom/drafts", response_model=CustomBlockVersionOut, status_code=201)
def create_custom_block_draft(
    payload: CustomBlockDraftPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return serialize_version(db, create_draft(db, current_user, payload))


@router.get("/custom/{version_id}", response_model=CustomBlockVersionOut)
def get_custom_block_version(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    version = _version_or_404(db, version_id)
    require_owner(version, current_user)
    return serialize_version(db, version)


@router.put("/custom/{version_id}", response_model=CustomBlockVersionOut)
def update_custom_block_draft(
    version_id: int,
    payload: CustomBlockDraftPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    version = _version_or_404(db, version_id)
    require_owner(version, current_user)
    update_draft(version, payload, actor_user_id=current_user.id, db=db)
    db.commit()
    db.refresh(version)
    return serialize_version(db, version)


@router.post("/custom/{version_id}/validate", response_model=CustomBlockValidationOut)
def validate_custom_block(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    version = _version_or_404(db, version_id)
    require_owner(version, current_user)
    result = validate_version(version)
    version.validation_result = result
    db.commit()
    return result


@router.post("/custom/{version_id}/submit-review", response_model=CustomBlockVersionOut)
def submit_custom_block_review(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    version = _version_or_404(db, version_id)
    require_owner(version, current_user)
    return submit_for_review(db, version, actor_user_id=current_user.id)


@router.post("/custom/{version_id}/admin-review", response_model=CustomBlockVersionOut)
def decide_custom_block_review(
    version_id: int,
    payload: CustomBlockReviewDecisionPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(require_tariff_admin),
):
    version = _version_or_404(db, version_id)
    return record_manual_decision(db, version, admin, payload.decision, payload.comment)


@router.post("/custom/{version_id}/publish", response_model=CustomBlockVersionOut)
def publish_custom_block(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    version = _version_or_404(db, version_id)
    require_owner(version, current_user)
    if version.status != CUSTOM_BLOCK_DRAFT:
        raise HTTPException(status_code=409, detail="Опубликованную версию нельзя изменить или опубликовать повторно")
    if version.review_state != CUSTOM_BLOCK_REVIEW_APPROVED:
        raise HTTPException(status_code=409, detail="Публикация возможна только после одобрения администратором")
    result = validate_version(version)
    version.validation_result = result
    if not result["valid"]:
        db.commit()
        raise HTTPException(status_code=422, detail={"message": "Блок не прошёл проверку", **result})
    from backend.models.custom_block import CustomBlockReviewDecision
    approval = (db.query(CustomBlockReviewDecision)
                .filter(CustomBlockReviewDecision.custom_block_version_id == version.id,
                        CustomBlockReviewDecision.decision == "approve",
                        CustomBlockReviewDecision.artifact_hash == version.execution_artifact_hash)
                .order_by(CustomBlockReviewDecision.id.desc()).first())
    if approval is None:
        raise HTTPException(status_code=409, detail="Одобрение этой версии отсутствует или устарело")
    from backend.models.custom_block import CustomBlockSecurityReport
    report = (db.query(CustomBlockSecurityReport)
              .filter(CustomBlockSecurityReport.custom_block_version_id == version.id,
                      CustomBlockSecurityReport.artifact_hash == version.execution_artifact_hash,
                      CustomBlockSecurityReport.status == "succeeded")
              .order_by(CustomBlockSecurityReport.id.desc()).first())
    if report is None:
        raise HTTPException(status_code=409, detail="AI Security Agent отчёт для текущего артефакта отсутствует или недоступен")
    version.status = CUSTOM_BLOCK_PUBLISHED
    version.published_at = datetime.now(timezone.utc)
    passport = dict(version.passport or {})
    passport["lifecycle_status"] = CUSTOM_BLOCK_PUBLISHED
    version.passport = passport
    from backend.services.custom_blocks import _record_review_event
    _record_review_event(db, version, event_type="publish_completed", previous_state=version.review_state,
                         resulting_state=version.review_state, actor_type="author",
                         actor_user_id=current_user.id)
    db.commit()
    db.refresh(version)
    return serialize_version(db, version)


@router.post("/custom/{version_id}/versions", response_model=CustomBlockVersionOut, status_code=201)
def new_custom_block_version(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    source = _version_or_404(db, version_id)
    require_owner(source, current_user)
    return serialize_version(db, create_new_version(db, source))


@router.post("/custom/{version_id}/archive", response_model=CustomBlockVersionOut)
def archive_custom_block(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    version = _version_or_404(db, version_id)
    require_owner(version, current_user)
    if version.status != CUSTOM_BLOCK_PUBLISHED:
        raise HTTPException(status_code=409, detail="Архивировать можно только опубликованную версию")
    version.status = CUSTOM_BLOCK_ARCHIVED
    version.archived_at = datetime.now(timezone.utc)
    passport = dict(version.passport or {})
    passport["lifecycle_status"] = CUSTOM_BLOCK_ARCHIVED
    version.passport = passport
    db.commit()
    db.refresh(version)
    return serialize_version(db, version)


@router.post("/custom/{version_id}/restore", response_model=CustomBlockVersionOut)
def restore_custom_block(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    version = _version_or_404(db, version_id)
    require_owner(version, current_user)
    if version.status != CUSTOM_BLOCK_ARCHIVED:
        raise HTTPException(status_code=409, detail="Восстановить можно только архивную версию")
    version.status = CUSTOM_BLOCK_PUBLISHED
    version.archived_at = None
    passport = dict(version.passport or {})
    passport["lifecycle_status"] = CUSTOM_BLOCK_PUBLISHED
    version.passport = passport
    db.commit()
    db.refresh(version)
    return serialize_version(db, version)


@router.delete("/custom/{version_id}", status_code=204)
def delete_custom_block_draft(
    version_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    version = _version_or_404(db, version_id)
    require_owner(version, current_user)
    if version.status != CUSTOM_BLOCK_DRAFT:
        raise HTTPException(status_code=409, detail="Опубликованные и архивные версии физически не удаляются")
    if usage_count(db, version.id):
        raise HTTPException(status_code=409, detail="Черновик используется в сценарии и не может быть удалён")
    has_children = db.query(CustomBlockVersion).filter(CustomBlockVersion.parent_version_id == version.id).first()
    if has_children:
        raise HTTPException(status_code=409, detail="Версия участвует в истории блока и не может быть удалена")
    block = version.block
    db.delete(version)
    db.flush()
    remaining = db.query(CustomBlockVersion).filter(CustomBlockVersion.custom_block_id == block.id).count()
    if remaining == 0:
        db.delete(block)
    db.commit()
    return None


@router.post("/custom/{version_id}/preview-execution")
def preview_custom_block_execution(
    version_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Server-side simulator path. It accepts no scenario graph or platform context."""
    try:
        version = resolve_authorized_version(
            db,
            scenario_owner_id=current_user.id,
            version_id=version_id,
            stable_id=str(payload.get("stableBlockId") or ""),
            version_number=int(payload.get("version") or 0),
            existing_reference=True,
        )
        result = execute_version(
            db, version=version, mode="simulator",
            input_data=payload.get("input") if isinstance(payload.get("input"), dict) else {},
            settings_data=payload.get("settings") if isinstance(payload.get("settings"), dict) else {},
        )
        return {"outputs": result.outputs, "route": result.route, "logs": [item.model_dump() for item in result.logs]}
    except ControlledExecutionFailure as exc:
        safe_messages = {
            "runner_feature_disabled": "Безопасное выполнение кастомных блоков не включено",
            "runner_url_missing": "Адрес сервиса безопасного выполнения не настроен",
            "runner_connection_refused": "Сервис безопасного выполнения не принимает соединение",
            "runner_unavailable": "Сервис безопасного выполнения временно недоступен",
            "runner_authentication_failed": "Сервис безопасного выполнения настроен неверно",
            "timeout": "Выполнение кастомного блока превысило допустимое время",
            "resource_limit": "Кастомный блок превысил допустимые лимиты ресурсов",
            "policy_violation": "Выполнение остановлено политикой безопасности",
            "runtime_error": "Пользовательский код завершился с ошибкой",
            "invalid_output": "Пользовательский код вернул некорректный результат",
            "validation_error": "Спецификация выполнения кастомного блока некорректна",
            "authorization_error": "Эта версия кастомного блока недоступна для выполнения",
        }
        raise HTTPException(
            status_code=422,
            detail={
                "code": exc.category,
                "message": safe_messages.get(
                    exc.category,
                    "Выполнение кастомного блока остановлено политикой безопасности",
                ),
            },
        ) from exc


@router.get("", response_model=List[BlockCatalogItem])
def get_blocks(
    plan: Optional[str] = Query(
        None,
        description=f"Filter by plan ({', '.join(VALID_PLANS)})",
        pattern=f"^({'|'.join(VALID_PLANS)})$",
    ),
    role: Optional[str] = Query(
        None,
        description=f"Filter by role ({', '.join(VALID_ROLES)})",
        pattern=f"^({'|'.join(VALID_ROLES)})$",
    ),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Получение каталога блоков с фильтрацией по тарифу и роли.
    Требует авторизации.

    - **plan**: фильтр по тарифу (free, pro, enterprise). Если не указан, используется "free" по умолчанию.
    - **role**: фильтр по роли. Если не указан, используется роль текущего пользователя.

    Блоки фильтруются автоматически по тарифу и роли пользователя.
    """
    # Загружаем каталог
    blocks = load_blocks_catalog()

    # Определяем plan пользователя (по умолчанию "free", можно расширить логику)
    user_plan = plan or "free"

    # Определяем role пользователя из его данных
    # Маппинг ролей из модели User в роли блоков
    role_mapping = {
        "owner": "owner",
        "admin": "admin",
        "developer": "developer",
        "templates_manager": "manager_template",
        "support": "support",
        "viewer": "viewer",
        "user": "viewer",  # Обычные пользователи имеют права viewer
    }
    user_role = role or role_mapping.get(current_user.role, "viewer")

    # Фильтруем блоки по плану пользователя
    filtered_blocks = [
        block for block in blocks if user_plan in block.planAccess
    ]

    # Фильтруем блоки по роли пользователя
    filtered_blocks = [
        block for block in filtered_blocks if user_role in block.permissions
    ]

    filtered_blocks = [b for b in filtered_blocks if not b.disabled]

    # Only the newest published version of each owned custom block is eligible
    # for new insertion. Archived versions remain resolvable by saved scenarios.
    custom_rows = (
        db.query(CustomBlockVersion)
        .join(CustomBlockVersion.block)
        .filter(
            CustomBlockVersion.block.has(owner_user_id=current_user.id),
            CustomBlockVersion.status == CUSTOM_BLOCK_PUBLISHED,
        )
        .order_by(CustomBlockVersion.custom_block_id, CustomBlockVersion.version.desc())
        .all()
    )
    newest = {}
    for row in custom_rows:
        newest.setdefault(row.custom_block_id, row)
    return [*filtered_blocks, *(to_catalog_item(row) for row in newest.values())]


@router.get("/categories", response_model=List[str])
def get_categories(
    current_user: User = Depends(get_current_user),
):
    """
    Получение списка всех доступных категорий блоков.
    Требует авторизации.
    """
    blocks = [b for b in load_blocks_catalog() if not b.disabled]
    categories = list(set(block.category for block in blocks))
    return sorted(categories)
