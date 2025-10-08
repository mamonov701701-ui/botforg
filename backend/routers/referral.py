from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.dependencies.auth import get_current_user
from backend.models.referral import Referral
from backend.models.template import Template
from backend.models.user import User as UserModel

router = APIRouter()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/referrals/me")
def get_my_referrals(
    db: Session = Depends(get_db), user: UserModel = Depends(get_current_user)
):
    refs = (
        db.query(Referral)
        .filter(Referral.referrer_user_id == user.id)
        .order_by(Referral.created_at.desc())
        .all()
    )
    total_earned = sum(r.reward for r in refs)
    available_balance = total_earned  # если не реализовано списание
    result = []
    for r in refs:
        referred = (
            db.query(UserModel).filter(UserModel.id == r.referred_user_id).first()
        )
        tpl = db.query(Template).filter(Template.id == r.template_id).first()
        result.append(
            {
                "user_email": (
                    referred.email if referred else f"anon_{r.referred_user_id}"
                ),
                "template_title": tpl.name if tpl else f"#{r.template_id}",
                "date": r.created_at,
                "reward_amount": r.reward,
            }
        )
    return {
        "total_earned": total_earned,
        "available_balance": available_balance,
        "referrals": result,
    }
