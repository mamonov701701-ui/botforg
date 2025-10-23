import json
import os
from typing import List, Optional

from backend.schemas.blocks import (
    VALID_PLANS,
    VALID_ROLES,
    BlockCatalogItem,
)
from fastapi import APIRouter, HTTPException, Query

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
):
    """
    Получение каталога блоков с фильтрацией по тарифу и роли.

    - **plan**: фильтр по тарифу (free, pro, enterprise)
    - **role**: фильтр по роли (owner, admin, manager_template, developer, support, viewer)

    Если фильтры не указаны, возвращаются все блоки.
    Если указаны оба фильтра, применяются оба (AND логика).
    """
    # Загружаем каталог
    blocks = load_blocks_catalog()

    # Применяем фильтры
    filtered_blocks = blocks

    if plan:
        # Фильтруем по плану: блок доступен, если plan входит в planAccess
        filtered_blocks = [
            block for block in filtered_blocks if plan in block.planAccess
        ]

    if role:
        # Фильтруем по роли: блок доступен, если role входит в permissions
        filtered_blocks = [
            block for block in filtered_blocks if role in block.permissions
        ]

    return filtered_blocks


@router.get("/categories", response_model=List[str])
def get_categories():
    """
    Получение списка всех доступных категорий блоков.
    """
    blocks = load_blocks_catalog()
    categories = list(set(block.category for block in blocks))
    return sorted(categories)
