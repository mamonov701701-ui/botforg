from pydantic import BaseModel
from datetime import datetime

class PurchaseCreate(BaseModel):
    template_id: int
    price: int

class PurchaseOut(BaseModel):
    id: int
    user_id: int
    template_id: int
    price: int
    created_at: datetime

    class Config:
        orm_mode = True 
