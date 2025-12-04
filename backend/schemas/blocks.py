from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, Field, field_validator

# Допустимые значения для планов и ролей
VALID_PLANS = ["free", "pro", "enterprise"]
VALID_ROLES = ["owner", "admin", "manager_template", "developer", "support", "viewer"]
VALID_FIELD_TYPES = [
    "string",
    "text",
    "number",
    "boolean",
    "select",
    "multiselect",
    "json",
    "image",
    "file",
    "datetime",
    "duration",
    "scenario_select",  # Выбор сценария из списка
    "node_select",      # Выбор блока внутри сценария
    "button_list",      # Список кнопок для сообщений
    "media_upload",     # Загрузка медиа-файла или URL
]


class SelectOption(BaseModel):
    """Опция для select с label и value"""
    value: str
    label: str


class FieldDependsOn(BaseModel):
    """Условие зависимости поля от другого"""
    field: str
    value: Any
    invert: Optional[bool] = Field(default=False, description="Инвертировать условие")


class BlockConfigField(BaseModel):
    """Поле конфигурации блока"""

    name: str = Field(..., description="Имя поля в settings")
    type: str = Field(..., description="Тип поля")
    label: str = Field(..., description="Отображаемое название")
    required: bool = Field(default=False, description="Обязательное ли поле")
    default: Optional[Any] = Field(default=None, description="Значение по умолчанию")
    description: Optional[str] = Field(default=None, description="Описание поля")
    placeholder: Optional[str] = Field(default=None, description="Placeholder для input")
    # Опции могут быть строками или объектами с value и label
    options: Optional[List[Union[str, SelectOption]]] = Field(
        default=None, description="Варианты для select/multiselect"
    )
    # Условная видимость поля
    dependsOn: Optional[FieldDependsOn] = Field(
        default=None, description="Условие зависимости от другого поля"
    )
    # Расширенная настройка (показывается в collapsible секции)
    isAdvanced: Optional[bool] = Field(
        default=False, description="Является ли поле расширенной настройкой"
    )

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        if v not in VALID_FIELD_TYPES:
            raise ValueError(
                f"Invalid field type: {v}. Must be one of {VALID_FIELD_TYPES}"
            )
        return v


class BlockCatalogItem(BaseModel):
    """Элемент каталога блоков"""

    id: str = Field(..., description="Уникальный идентификатор блока")
    title: str = Field(..., description="Отображаемое название")
    category: str = Field(..., description="Категория блока")
    description: str = Field(..., description="Описание функционала")
    icon: str = Field(..., description="Название иконки")
    color: str = Field(..., description="Цвет блока (hex)")
    planAccess: List[str] = Field(..., description="Доступ по тарифам")
    permissions: List[str] = Field(..., description="Доступ по ролям")
    configSchema: List[BlockConfigField] = Field(
        default_factory=list, description="Схема настроек"
    )

    @field_validator("planAccess")
    @classmethod
    def validate_plan_access(cls, v: List[str]) -> List[str]:
        for plan in v:
            if plan not in VALID_PLANS:
                raise ValueError(f"Invalid plan: {plan}. Must be one of {VALID_PLANS}")
        return v

    @field_validator("permissions")
    @classmethod
    def validate_permissions(cls, v: List[str]) -> List[str]:
        for role in v:
            if role not in VALID_ROLES:
                raise ValueError(f"Invalid role: {role}. Must be one of {VALID_ROLES}")
        return v


class BlockCatalogResponse(BaseModel):
    """Ответ API с каталогом блоков"""

    blocks: List[BlockCatalogItem]
    total: int
    filtered: bool = Field(default=False, description="Была ли применена фильтрация")
