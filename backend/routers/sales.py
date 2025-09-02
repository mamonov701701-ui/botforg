from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_, func
from datetime import date, datetime
from typing import Optional, List
from backend.database import SessionLocal
from backend.models.payment import Payment
from backend.models.template import Template
from backend.models.user import User
from backend.schemas.template import TemplateOut
from backend.schemas.user import UserOut
from backend.dependencies.auth import get_current_user
from backend.dependencies.roles import require_role
from pydantic import BaseModel

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class BuyerOut(BaseModel):
    id: int
    name: Optional[str]
    email: str

class SaleTemplateOut(BaseModel):
    id: int
    name: str

class SaleOut(BaseModel):
    id: int
    template: SaleTemplateOut
    buyer: BuyerOut
    amount: int
    currency: str
    method: str
    status: str
    created_at: datetime

class SaleListOut(BaseModel):
    total: int
    items: List[SaleOut]

@router.get("/my-sales", response_model=SaleListOut)
def get_my_sales(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["owner", "admin", "manager_template"])),
    status: Optional[str] = Query(None),
    method: Optional[str] = Query(None),
    template_id: Optional[int] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    q = db.query(Payment).join(Template).join(User, Payment.user_id == User.id)
    q = q.filter(Template.user_id == current_user.id)
    if status:
        q = q.filter(Payment.status == status)
    if method:
        q = q.filter(Payment.provider == method)
    if template_id:
        q = q.filter(Payment.template_id == template_id)
    if start_date:
        q = q.filter(Payment.created_at >= datetime.combine(start_date, datetime.min.time()))
    if end_date:
        q = q.filter(Payment.created_at <= datetime.combine(end_date, datetime.max.time()))
    total = q.count()
    payments = q.order_by(Payment.created_at.desc()).offset(offset).limit(limit).all()
    items = []
    for p in payments:
        items.append(SaleOut(
            id=p.id,
            template=SaleTemplateOut(id=p.template.id, name=p.template.name),
            buyer=BuyerOut(id=p.user.id, name=p.user.name, email=p.user.email),
            amount=p.amount,
            currency=p.currency,
            method=p.provider,
            status=p.status,
            created_at=p.created_at,
        ))
    return SaleListOut(total=total, items=items) 
