from datetime import datetime

from pydantic import BaseModel, ConfigDict


class PurchaseCreate(BaseModel):
    template_id: int
    price: int


class PurchaseOut(BaseModel):
    id: int
    user_id: int
    template_id: int
    price: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
