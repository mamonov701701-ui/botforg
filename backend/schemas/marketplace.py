from typing import List, Optional

from backend.schemas.comment import CommentOut
from backend.schemas.tag import TagOut
from pydantic import BaseModel


class MarketplaceTemplateOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    category: str
    tags: List[TagOut]
    average_rating: float
    price: int
    is_purchased: bool


class MarketplaceTemplateDetailOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    category: str
    tags: List[TagOut]
    average_rating: float
    comments: List[CommentOut]
    rating_count: int
    price: int
    is_purchased: bool
