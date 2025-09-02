from pydantic import BaseModel
from datetime import datetime

class CommentCreate(BaseModel):
    template_id: int
    content: str

class CommentOut(BaseModel):
    id: int
    user_id: int
    template_id: int
    content: str
    created_at: datetime

    class Config:
        orm_mode = True 
