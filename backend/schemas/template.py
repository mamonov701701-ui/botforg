from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: str
    is_public: bool = True

class TemplateOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    category: str
    is_public: bool
    created_at: datetime

    class Config:
        orm_mode = True

class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    is_public: Optional[bool] = None
    created_at: Optional[datetime] = None

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
