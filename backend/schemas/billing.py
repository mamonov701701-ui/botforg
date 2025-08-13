from pydantic import BaseModel, validator
from typing import Optional
from datetime import datetime
from decimal import Decimal

class BillingBase(BaseModel):
    user_id: int
    message_id: Optional[int] = None
    action: str
    direction: str
    is_paid: bool = False
    price: Decimal = Decimal("0.00")
    
    @validator('user_id')
    def validate_user_id(cls, v):
        if v <= 0:
            raise ValueError('User ID must be positive')
        return v
    
    @validator('message_id')
    def validate_message_id(cls, v):
        if v is not None and v <= 0:
            raise ValueError('Message ID must be positive')
        return v
    
    @validator('action')
    def validate_action(cls, v):
        if v not in ['message', 'purchase', 'subscription']:
            raise ValueError('Action must be one of: message, purchase, subscription')
        return v
    
    @validator('direction')
    def validate_direction(cls, v):
        if v not in ['incoming', 'outgoing']:
            raise ValueError('Direction must be either "incoming" or "outgoing"')
        return v
    
    @validator('price')
    def validate_price(cls, v):
        if v < 0:
            raise ValueError('Price cannot be negative')
        return v

class BillingCreate(BillingBase):
    pass

class BillingOut(BaseModel):
    id: int
    user_id: int
    message_id: Optional[int] = None
    direction: str
    action: str
    price: Decimal
    is_paid: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class BillingListOut(BaseModel):
    total: int
    items: list[BillingOut]

class UserQuotaOut(BaseModel):
    id: int
    user_id: int
    monthly_limit: int
    used_messages: int
    updated_at: datetime
    
    class Config:
        from_attributes = True

class UserQuotaUpdate(BaseModel):
    monthly_limit: Optional[int] = None
    used_messages: Optional[int] = None
    
    @validator('monthly_limit')
    def validate_monthly_limit(cls, v):
        if v is not None and v < 0:
            raise ValueError('Monthly limit cannot be negative')
        return v
    
    @validator('used_messages')
    def validate_used_messages(cls, v):
        if v is not None and v < 0:
            raise ValueError('Used messages cannot be negative')
        return v

