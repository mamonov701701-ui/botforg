"""
Admin API для модерации шаблонов маркетплейса.
Только для owner (владелец платформы).
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.user import User
from backend.models.market import MarketItem, MarketItemType, ModerationStatus
from backend.routers.platform_admin import require_owner

router = APIRouter(prefix="/api/admin/market", tags=["Market Admin"])


class RejectRequest(BaseModel):
    reason: str


@router.post("/templates/{template_id}/approve")
async def approve_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner),
):
    """Одобрить шаблон (pending → approved). Только для owner."""
    item = (
        db.query(MarketItem)
        .filter(
            MarketItem.id == template_id,
            MarketItem.item_type == MarketItemType.TEMPLATE,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    current = getattr(item, "moderation_status", None)
    current_val = current.value if hasattr(current, "value") else (current or "draft")
    if current_val != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Одобрить можно только шаблон на модерации. Текущий статус: {current_val}",
        )
    item.moderation_status = ModerationStatus.APPROVED
    item.moderation_rejection_reason = None
    item.is_published = True
    db.commit()
    return {"ok": True, "moderation_status": "approved"}


@router.post("/templates/{template_id}/reject")
async def reject_template(
    template_id: int,
    body: RejectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_owner),
):
    """Отклонить шаблон (pending → rejected). Только для owner. Причина обязательна."""
    item = (
        db.query(MarketItem)
        .filter(
            MarketItem.id == template_id,
            MarketItem.item_type == MarketItemType.TEMPLATE,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    current = getattr(item, "moderation_status", None)
    current_val = current.value if hasattr(current, "value") else (current or "draft")
    if current_val != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"Отклонить можно только шаблон на модерации. Текущий статус: {current_val}",
        )
    item.moderation_status = ModerationStatus.REJECTED
    item.moderation_rejection_reason = body.reason or "Причина не указана"
    db.commit()
    return {"ok": True, "moderation_status": "rejected"}
