"""
API тарифных планов (Plans).
"""
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models.plan import Plan

router = APIRouter(prefix="/plans", tags=["plans"])


class PlanLimitsOut(BaseModel):
    max_bots: int
    can_publish: bool
    can_use_analytics: bool
    max_team_members: int


class PlanOut(BaseModel):
    id: int
    code: str
    name: str
    limits: dict[str, Any]

    model_config = {"from_attributes": True}


class PlanListOut(BaseModel):
    total: int
    items: list[PlanOut]


@router.get("/", response_model=PlanListOut)
async def get_plans(db: Session = Depends(get_db)):
    """Список всех тарифов."""
    plans = db.query(Plan).order_by(Plan.id).all()
    return {"total": len(plans), "items": plans}
