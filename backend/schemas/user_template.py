from pydantic import BaseModel, constr, validator
from typing import Optional
from datetime import datetime
import re

class UserTemplateBase(BaseModel):
    title: constr(min_length=1, max_length=200)
    description: Optional[constr(max_length=1000)] = None
    template_id: Optional[int] = None
    
    @validator('title')
    def validate_title(cls, v):
        if re.search(r'<[^>]*>', v):
            raise ValueError('HTML tags are not allowed in title')
        return v
    
    @validator('description')
    def validate_description(cls, v):
        if v and re.search(r'<[^>]*>', v):
            raise ValueError('HTML tags are not allowed in description')
        return v

class UserTemplateCreate(UserTemplateBase):
    pass

class UserTemplateUpdate(BaseModel):
    title: Optional[constr(min_length=1, max_length=200)] = None
    description: Optional[constr(max_length=1000)] = None
    template_id: Optional[int] = None
    is_active: Optional[bool] = None
    
    @validator('title')
    def validate_title(cls, v):
        if v and re.search(r'<[^>]*>', v):
            raise ValueError('HTML tags are not allowed in title')
        return v
    
    @validator('description')
    def validate_description(cls, v):
        if v and re.search(r'<[^>]*>', v):
            raise ValueError('HTML tags are not allowed in description')
        return v

class UserTemplateOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    template_id: Optional[int] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class UserTemplateListOut(BaseModel):
    total: int
    items: list[UserTemplateOut]

