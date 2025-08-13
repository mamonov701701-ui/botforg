from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.orm import Session
from backend.database import SessionLocal
from backend.models.payment import Payment
from backend.models.purchase import Purchase
from backend.models.template import Template
from models.user import User
from typing import Dict

webhook_router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@webhook_router.post("/telegram")
async def handle_telegram_webhook(update: Dict, db: Session = Depends(get_db)):
    # Пример: update["successful_payment"]["invoice_payload"] содержит payment_id
    payment_id = update.get("successful_payment", {}).get("invoice_payload")
    if not payment_id:
        raise HTTPException(status_code=400, detail="No payment_id in payload")
    payment = db.query(Payment).filter(Payment.id == int(payment_id)).first()
    if not payment or payment.status == "success":
        return {"ok": True}
    payment.status = "success"
    db.commit()
    # Создать покупку, если не создана
    if not db.query(Purchase).filter(Purchase.user_id == payment.user_id, Purchase.template_id == payment.template_id).first():
        db.add(Purchase(user_id=payment.user_id, template_id=payment.template_id, price=payment.amount))
        db.commit()
    return {"ok": True}

@webhook_router.post("/yookassa")
async def handle_yookassa_webhook(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    event = data.get("event")
    obj = data.get("object", {})
    external_id = obj.get("id")
    if event == "payment.succeeded" and external_id:
        payment = db.query(Payment).filter(Payment.external_id == external_id).first()
        if payment and payment.status != "success":
            payment.status = "success"
            db.commit()
            if not db.query(Purchase).filter(Purchase.user_id == payment.user_id, Purchase.template_id == payment.template_id).first():
                db.add(Purchase(user_id=payment.user_id, template_id=payment.template_id, price=payment.amount))
                db.commit()
    return {"ok": True}

@webhook_router.post("/stripe")
async def handle_stripe_webhook(request: Request, db: Session = Depends(get_db)):
    payload = await request.body()
    data = await request.json()
    event_type = data.get("type")
    session = data.get("data", {}).get("object", {})
    external_id = session.get("id")
    if event_type == "checkout.session.completed" and external_id:
        payment = db.query(Payment).filter(Payment.external_id == external_id).first()
        if payment and payment.status != "success":
            payment.status = "success"
            db.commit()
            if not db.query(Purchase).filter(Purchase.user_id == payment.user_id, Purchase.template_id == payment.template_id).first():
                db.add(Purchase(user_id=payment.user_id, template_id=payment.template_id, price=payment.amount))
                db.commit()
    return {"ok": True}

@webhook_router.post("/cloudpayments")
async def handle_cloudpayments_webhook(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    external_id = data.get("InvoiceId")
    if external_id:
        payment = db.query(Payment).filter(Payment.external_id == external_id).first()
        if payment and payment.status != "success":
            payment.status = "success"
            db.commit()
            if not db.query(Purchase).filter(Purchase.user_id == payment.user_id, Purchase.template_id == payment.template_id).first():
                db.add(Purchase(user_id=payment.user_id, template_id=payment.template_id, price=payment.amount))
                db.commit()
    return {"Result": 0} 