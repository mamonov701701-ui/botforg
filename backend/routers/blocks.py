import json
import os
from typing import List, Optional

from backend.schemas.blocks import (
    VALID_PLANS,
    VALID_ROLES,
    BlockCatalogItem,
)
from backend.dependencies.auth import get_current_user
from backend.models.user import User
from fastapi import APIRouter, HTTPException, Query, Depends

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

    return filtered_blocks


@router.get("/categories", response_model=List[str])
def get_categories(
    current_user: User = Depends(get_current_user),
):
    """
    Получение списка всех доступных категорий блоков.
    Требует авторизации.
    """
    blocks = load_blocks_catalog()
    categories = list(set(block.category for block in blocks))
    return sorted(categories)
