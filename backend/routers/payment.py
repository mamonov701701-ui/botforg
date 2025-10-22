from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.payment import Payment
from backend.models.user import User
from backend.schemas.payment import PaymentCreate, PaymentOut

router = APIRouter(prefix="/payments", tags=["Payments"])


@router.post("/", response_model=PaymentOut)
def create_payment(
    payment_data: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Создание нового платежа"""
    payment = Payment(
        user_id=current_user.id,
        amount=payment_data.amount,
        currency=payment_data.currency,
        type=payment_data.type,
        payload=payment_data.payload,
        status="pending",
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


@router.get("/my-payments", response_model=List[PaymentOut])
def get_my_payments(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    """Получение списка платежей пользователя"""
    return db.query(Payment).filter(Payment.user_id == current_user.id).all()


@router.get("/{payment_id}", response_model=PaymentOut)
def get_payment(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Получение конкретного платежа"""
    payment = (
        db.query(Payment)
        .filter(Payment.id == payment_id, Payment.user_id == current_user.id)
        .first()
    )

    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    return payment
