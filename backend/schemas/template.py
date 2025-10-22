import re
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, field_validator
from pydantic.config import ConfigDict


class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: str
    is_public: bool = True

    @field_validator("name", "description")
    @classmethod
    def validate_no_html(cls, v):
        if v and re.search(r"<[^>]*>", v):
            raise ValueError("HTML tags are not allowed")
        return v

    @field_validator("name")
    @classmethod
    def validate_name_length(cls, v):
        if len(v) < 1 or len(v) > 200:
            raise ValueError("Name must be between 1 and 200 characters")
        return v

    @field_validator("description")
    @classmethod
    def validate_description_length(cls, v):
        if v and len(v) > 1000:
            raise ValueError("Description must be less than 1000 characters")
        return v

    @field_validator("category")
    @classmethod
    def validate_category_length(cls, v):
        if len(v) < 1 or len(v) > 50:
            raise ValueError("Category must be between 1 and 50 characters")
        return v


class TemplateOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    category: str
    is_public: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    is_public: Optional[bool] = None

    @field_validator("name", "description")
    @classmethod
    def validate_no_html(cls, v):
        if v and re.search(r"<[^>]*>", v):
            raise ValueError("HTML tags are not allowed")
        return v

    @field_validator("name")
    @classmethod
    def validate_name_length(cls, v):
        if v and (len(v) < 1 or len(v) > 200):
            raise ValueError("Name must be between 1 and 200 characters")
        return v

    @field_validator("description")
    @classmethod
    def validate_description_length(cls, v):
        if v and len(v) > 1000:
            raise ValueError("Description must be less than 1000 characters")
        return v

    @field_validator("category")
    @classmethod
    def validate_category_length(cls, v):
        if v and (len(v) < 1 or len(v) > 50):
            raise ValueError("Category must be between 1 and 50 characters")
        return v


class TemplateListOut(BaseModel):
    total: int
    items: List[TemplateOut]


class TemplateWithRatingOut(BaseModel):
    id: int
    name: str
    category: str
    is_public: bool
    average_rating: float


class TemplateWithRatingListOut(BaseModel):
    total: int
    items: List[TemplateWithRatingOut]
