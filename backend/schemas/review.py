from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ReviewCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    text: Optional[str] = None


class ReviewOut(BaseModel):
    id: int
    template_id: int
    user_id: int
    rating: int
    text: Optional[str]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
