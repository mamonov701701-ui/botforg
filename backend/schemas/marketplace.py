from pydantic import BaseModel
from typing import Optional, List
from backend.schemas.tag import TagOut
from backend.schemas.comment import CommentOut

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
