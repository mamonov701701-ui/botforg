import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator
from pydantic.config import ConfigDict


class UserTemplateBase(BaseModel):
    title: str
    description: Optional[str] = None
    template_id: Optional[int] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v):
        if len(v) < 1 or len(v) > 200:
            raise ValueError("Title must be between 1 and 200 characters")
        if re.search(r"<[^>]*>", v):
            raise ValueError("HTML tags are not allowed in title")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v):
        if v:
            if len(v) > 1000:
                raise ValueError("Description must be less than 1000 characters")
            if re.search(r"<[^>]*>", v):
                raise ValueError("HTML tags are not allowed in description")
        return v


class UserTemplateCreate(UserTemplateBase):
    pass


class UserTemplateUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    template_id: Optional[int] = None
    is_active: Optional[bool] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v):
        if v:
            if len(v) < 1 or len(v) > 200:
                raise ValueError("Title must be between 1 and 200 characters")
            if re.search(r"<[^>]*>", v):
                raise ValueError("HTML tags are not allowed in title")
        return v

    @field_validator("description")
    @classmethod
    def validate_description(cls, v):
        if v:
            if len(v) > 1000:
                raise ValueError("Description must be less than 1000 characters")
            if re.search(r"<[^>]*>", v):
                raise ValueError("HTML tags are not allowed in description")
        return v


class UserTemplateOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    template_id: Optional[int] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserTemplateListOut(BaseModel):
    total: int
    items: list[UserTemplateOut]
