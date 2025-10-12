from datetime import datetime

from pydantic import BaseModel, ConfigDict


class CommentCreate(BaseModel):
    template_id: int
    content: str


class CommentOut(BaseModel):
    id: int
    user_id: int
    template_id: int
    content: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
