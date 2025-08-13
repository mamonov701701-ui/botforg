from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class PaymentCreate(BaseModel):
    template_id: int
    provider: str  # 'telegram', 'yookassa', 'stripe', 'sbp' и т.п.
    amount: int  # в копейках

class PaymentOut(BaseModel):
    id: int
    user_id: int
    template_id: int
    provider: str
    amount: int
    status: str
    created_at: datetime

    class Config:
        orm_mode = True 