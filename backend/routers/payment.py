from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from backend.dependencies.auth import get_current_user
from backend.database import SessionLocal
from backend.schemas.payment import PaymentCreate, PaymentOut
from backend.models.payment import Payment
from backend.models.template import Template
from typing import List
from backend.services.telegram_payments import create_telegram_invoice
from backend.services.yookassa_payments import create_yookassa_payment
from backend.services.stripe_payments import create_stripe_checkout_session
from backend.services.cloudpayments import create_cloudpayments_invoice

router = APIRouter(prefix="/payments", tags=["Payments"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/", response_model=PaymentOut)
def create_payment(payment_in: PaymentCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    template = db.query(Template).filter(Template.id == payment_in.template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    payment = Payment(
        user_id=current_user.id,
        template_id=payment_in.template_id,
        provider=payment_in.provider,
        amount=payment_in.amount,
        currency="RUB",  # по умолчанию, можно расширить
        status="pending"
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment

@router.get("/my-payments", response_model=List[PaymentOut])
def get_my_payments(db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return db.query(Payment).filter(Payment.user_id == current_user.id).all()

@router.get("/templates/{template_id}/payments", response_model=List[PaymentOut])
def get_template_payments(template_id: int, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if template.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner can view payments for this template")
    return db.query(Payment).filter(Payment.template_id == template_id).all()

@router.post("/telegram-invoice")
def get_telegram_invoice(template_id: int, current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    template = db.query(Template).filter(Template.id == template_id, Template.is_public == True).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found or not available")
    # Создать платёж в БД
    payment = Payment(
        user_id=current_user.id,
        template_id=template.id,
        provider="telegram",
        amount=getattr(template, "price", 0),
        currency="RUB",
        status="pending"
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    invoice = create_telegram_invoice(template, current_user, payment.amount)
    invoice["payment_id"] = payment.id
    return invoice

@router.post("/yookassa")
def yookassa_pay(template_id: int, current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    template = db.query(Template).filter(Template.id == template_id, Template.is_public == True).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found or not available")
    payment = Payment(
        user_id=current_user.id,
        template_id=template.id,
        provider="yookassa",
        amount=getattr(template, "price", 0),
        currency="RUB",
        status="pending"
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    confirmation_url = create_yookassa_payment(current_user, template, payment.amount)
    return {"confirmation_url": confirmation_url, "payment_id": payment.id}

@router.post("/stripe")
def stripe_pay(template_id: int, current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    template = db.query(Template).filter(Template.id == template_id, Template.is_public == True).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found or not available")
    payment = Payment(
        user_id=current_user.id,
        template_id=template.id,
        provider="stripe",
        amount=getattr(template, "price", 0),
        currency="RUB",
        status="pending"
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    session_url = create_stripe_checkout_session(current_user, template, payment.amount)
    return {"session_url": session_url, "payment_id": payment.id}

@router.post("/cloudpayments")
async def cloudpayments_pay(template_id: int, current_user = Depends(get_current_user), db: Session = Depends(get_db)):
    template = db.query(Template).filter(Template.id == template_id, Template.is_public == True).first()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found or not available")
    payment = Payment(
        user_id=current_user.id,
        template_id=template.id,
        provider="cloudpayments",
        amount=getattr(template, "price", 0),
        currency="RUB",
        status="pending"
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    invoice = await create_cloudpayments_invoice(current_user, template, payment.amount)
    return {"invoice": invoice, "payment_id": payment.id} 