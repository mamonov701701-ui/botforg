from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from backend.database import SessionLocal
from backend.models.purchase import Purchase
from backend.schemas.purchase import PurchaseCreate, PurchaseOut
from backend.dependencies.auth import get_current_user
from backend.models.user import User as UserModel

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/purchases", response_model=PurchaseOut)
def create_purchase(purchase: PurchaseCreate, db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    db_purchase = Purchase(user_id=current_user.id, template_id=purchase.template_id, price=purchase.price)
    db.add(db_purchase)
    db.commit()
    db.refresh(db_purchase)
    return db_purchase

@router.get("/my-purchases", response_model=List[PurchaseOut])
def get_my_purchases(db: Session = Depends(get_db), current_user: UserModel = Depends(get_current_user)):
    return db.query(Purchase).filter(Purchase.user_id == current_user.id).all()

@router.get("/templates/{template_id}/purchases", response_model=List[PurchaseOut])
def get_template_purchases(template_id: int, db: Session = Depends(get_db)):
    return db.query(Purchase).filter(Purchase.template_id == template_id).all() 
