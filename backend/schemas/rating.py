from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RatingCreate(BaseModel):
    template_id: int
    score: int


class RatingOut(BaseModel):
    id: int
    user_id: int
    template_id: int
    score: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
