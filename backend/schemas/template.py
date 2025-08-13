from pydantic import BaseModel, constr, validator
from typing import Optional, List
from datetime import datetime
import re

class TemplateCreate(BaseModel):
    name: constr(min_length=1, max_length=200)
    description: Optional[constr(max_length=1000)] = None
    category: constr(min_length=1, max_length=50)
    is_public: bool = True
    
    @validator('name', 'description')
    def validate_no_html(cls, v):
        if v and re.search(r'<[^>]*>', v):
            raise ValueError('HTML tags are not allowed')
        return v

class TemplateOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    category: str
    is_public: bool
    created_at: datetime

    class Config:
        from_attributes = True

class TemplateUpdate(BaseModel):
    name: Optional[constr(min_length=1, max_length=200)] = None
    description: Optional[constr(max_length=1000)] = None
    category: Optional[constr(min_length=1, max_length=50)] = None
    is_public: Optional[bool] = None
    
    @validator('name', 'description')
    def validate_no_html(cls, v):
        if v and re.search(r'<[^>]*>', v):
            raise ValueError('HTML tags are not allowed')
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
