from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class BotInstanceCreate(BaseModel):
    token: str
    template_id: int

class BotInstanceOut(BaseModel):
    id: int
    user_id: int
    token: str
    username: Optional[str]
    template_id: int
    is_active: bool
    webhook_url: Optional[str]
    created_at: datetime

    class Config:
        orm_mode = True 