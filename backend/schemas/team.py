from pydantic import BaseModel
from datetime import datetime

class TeamMemberCreate(BaseModel):
    user_id: int
    role: str

class TeamMemberOut(BaseModel):
    id: int
    user_id: int
    owner_id: int
    role: str
    created_at: datetime

    class Config:
        orm_mode = True 
