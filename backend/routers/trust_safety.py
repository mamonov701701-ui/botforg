"""Cross-object Trust & Safety foundation; no payment capture or surveillance feed."""
from datetime import timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.bot import Bot
from backend.models.custom_block import CustomBlock, CustomBlockVersion
from backend.models.custom_block_marketplace import (
    COMMERCIAL_PAID, LISTING_PUBLISHED, CustomBlockAccessGrant, CustomBlockMarketplaceListing,
    MarketplaceDispute, TrustSafetyEnforcement, TrustSafetyReport,
)
from backend.models.market import MarketItem
from backend.models.scenario import Scenario
from backend.models.template import Template
from backend.models.user import User
from backend.routers.platform_admin import require_owner
from backend.services.chat_room_service import get_or_create_private_room
from backend.services.custom_blocks import content_version_ids
from backend.services.trust_safety import now, record_audit, active_actions, bot_suspension_active, restore_bot_warning


router = APIRouter(prefix="/api/trust-safety", tags=["Trust & Safety"])


class DisputePayload(BaseModel):
    listing_id: int = Field(gt=0)
    reason_code: str = Field(pattern="^(paid_no_access|author_unresponsive|other_violation)$")
    description: str = Field(min_length=5, max_length=4000)
    evidence_metadata: list[dict] = Field(default_factory=list, max_length=10)


class DecisionPayload(BaseModel):
    status: str = Field(pattern="^(upheld|rejected)$")
    decision: str = Field(min_length=5, max_length=4000)
    enforcement_action_id: int | None = None


class EnforcementPayload(BaseModel):
    subject_type: str = Field(pattern="^(user|listing|bot|scenario|template|market_item)$")
    subject_id: int = Field(gt=0)
    action: str = Field(pattern="^(warning|temporary_market_restriction|prohibit_paid_listings|hide_listing|prohibit_commercial_market_activity|suspend_object|account_restriction)$")
    reason: str = Field(min_length=5, max_length=4000)
    duration_days: int | None = Field(default=None, ge=1, le=365)
    dispute_id: int | None = None


class ReportPayload(BaseModel):
    subject_type: str = Field(pattern="^(user|listing|bot|scenario|template|market_item)$")
    subject_id: int = Field(gt=0)
    reason_code: str = Field(min_length=3, max_length=48)
    description: str = Field(min_length=5, max_length=4000)


def _subject(db: Session, subject_type: str, subject_id: int):
    models = {"user": User, "listing": CustomBlockMarketplaceListing, "bot": Bot,
              "scenario": Scenario, "template": Template, "market_item": MarketItem}
    row = db.query(models[subject_type]).filter_by(id=subject_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Объект не найден")
    if subject_type == "listing":
        version = db.query(CustomBlockVersion).filter_by(id=row.custom_block_version_id).one()
        return row, version.block.owner_user_id
    owner_id = {"user": "id", "bot": "owner_id", "scenario": "user_id", "template": "user_id",
                "market_item": "seller_id"}[subject_type]
    return row, getattr(row, owner_id)


@router.post("/disputes", status_code=201)
def file_dispute(payload: DisputePayload, db: Session = Depends(get_db), buyer: User = Depends(get_current_user)):
    listing = db.query(CustomBlockMarketplaceListing).filter_by(id=payload.listing_id).first()
    if not listing or listing.lifecycle != LISTING_PUBLISHED or listing.commercial_mode != COMMERCIAL_PAID:
        raise HTTPException(status_code=409, detail="Спор можно открыть только по опубликованному платному размещению")
    version = db.query(CustomBlockVersion).filter_by(id=listing.custom_block_version_id).one()
    seller_id = version.block.owner_user_id
    if buyer.id == seller_id:
        raise HTTPException(status_code=403, detail="Автор не может открыть спор с собой")
    room, _ = get_or_create_private_room(db, buyer.id, seller_id, buyer.id)
    dispute = MarketplaceDispute(
        buyer_user_id=buyer.id, seller_user_id=seller_id, listing_id=listing.id,
        custom_block_version_id=version.id, price_amount=listing.price_amount,
        price_currency=listing.price_currency,
        listing_snapshot={"title": listing.title or version.title, "description": listing.description,
                          "category": listing.category, "version": version.version,
                          "original_author_user_id": seller_id, "commercial_mode": listing.commercial_mode,
                          "published_at": listing.published_at.isoformat() if listing.published_at else None},
        chat_room_id=room.id, reason_code=payload.reason_code,
        description=payload.description, evidence_metadata=payload.evidence_metadata,
    )
    db.add(dispute)
    db.commit()
    return {"id": dispute.id, "status": dispute.status, "created_at": dispute.created_at}


@router.get("/disputes/{dispute_id}")
def get_dispute(dispute_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    dispute = db.query(MarketplaceDispute).filter_by(id=dispute_id).first()
    if not dispute:
        raise HTTPException(status_code=404, detail="Спор не найден")
    if current_user.id not in {dispute.buyer_user_id, dispute.seller_user_id} and current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Доступ к спору запрещён")
    if current_user.role == "owner":
        record_audit(db, actor_id=current_user.id, event_type="dispute_viewed", subject_type="dispute", subject_id=dispute.id)
        db.commit()
    return {"id": dispute.id, "buyer_user_id": dispute.buyer_user_id, "seller_user_id": dispute.seller_user_id,
            "listing_id": dispute.listing_id, "custom_block_version_id": dispute.custom_block_version_id,
            "price_amount": dispute.price_amount, "price_currency": dispute.price_currency,
            "listing_snapshot": dispute.listing_snapshot, "chat_room_id": dispute.chat_room_id,
            "reason_code": dispute.reason_code, "description": dispute.description,
            "evidence_metadata": dispute.evidence_metadata, "status": dispute.status,
            "admin_decision": dispute.admin_decision, "enforcement_action_id": dispute.enforcement_action_id,
            "created_at": dispute.created_at, "decided_at": dispute.decided_at}


@router.post("/reports", status_code=201)
def file_report(payload: ReportPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    _subject(db, payload.subject_type, payload.subject_id)
    report = TrustSafetyReport(reporter_user_id=current_user.id, subject_type=payload.subject_type,
                               subject_id=payload.subject_id, reason_code=payload.reason_code,
                               description=payload.description)
    db.add(report)
    db.commit()
    return {"id": report.id, "status": report.status}


@router.post("/admin/enforcements", status_code=201)
def create_enforcement(payload: EnforcementPayload, db: Session = Depends(get_db), admin: User = Depends(require_owner)):
    subject, owner_id = _subject(db, payload.subject_type, payload.subject_id)
    if owner_id == admin.id and payload.action == "account_restriction":
        raise HTTPException(status_code=403, detail="Нельзя ограничить владельца платформы")
    allowed = {
        "warning": {"user", "listing", "bot", "scenario", "template", "market_item"},
        "temporary_market_restriction": {"user"}, "prohibit_paid_listings": {"user"},
        "prohibit_commercial_market_activity": {"user"}, "account_restriction": {"user"},
        "hide_listing": {"listing"}, "suspend_object": {"listing", "bot", "scenario", "market_item"},
    }
    if payload.subject_type == "template" and payload.action == "suspend_object":
        raise HTTPException(status_code=422, detail={
            "code": "unsupported_action",
            "message": "Приостановка Template не поддерживается; доступно предупреждение",
        })
    if payload.subject_type not in allowed[payload.action]:
        raise HTTPException(status_code=422, detail="Действие не поддерживается для этого типа объекта")
    if payload.action == "temporary_market_restriction" and payload.duration_days is None:
        raise HTTPException(status_code=422, detail="Для временного ограничения укажите срок")
    if payload.action == "account_restriction" and payload.duration_days is not None:
        raise HTTPException(status_code=422, detail="Ограничение аккаунта не поддерживает автоматическое истечение срока")
    if payload.dispute_id is not None and not db.query(MarketplaceDispute.id).filter_by(id=payload.dispute_id).first():
        raise HTTPException(status_code=404, detail="Спор не найден")
    action = TrustSafetyEnforcement(
        subject_type=payload.subject_type, subject_id=payload.subject_id, user_id=owner_id,
        action=payload.action, reason=payload.reason, actor_user_id=admin.id,
        dispute_id=payload.dispute_id,
        expires_at=now() + timedelta(days=payload.duration_days) if payload.duration_days else None,
    )
    db.add(action)
    db.flush()
    if payload.action == "account_restriction":
        subject.is_suspended = True
        subject.suspension_type = "permanent"
        subject.suspension_reason = payload.reason
        subject.suspended_at = now()
        subject.suspended_by_id = admin.id
    elif payload.action == "suspend_object" and payload.subject_type == "bot":
        subject.is_suspended = True
        subject.is_active = False
        subject.suspension_type = "temporary" if payload.duration_days else "permanent"
        subject.suspension_reason = payload.reason
        subject.suspended_at = now()
        subject.suspended_by_id = admin.id
        subject.suspended_until = action.expires_at
    elif payload.action == "warning" and payload.subject_type == "bot" and not bot_suspension_active(subject):
        subject.suspension_type = "warning"
        subject.suspension_reason = payload.reason
        subject.suspended_at = now()
        subject.suspended_by_id = admin.id
        subject.suspended_until = None
    record_audit(db, actor_id=admin.id, event_type="enforcement_created",
                 subject_type=payload.subject_type, subject_id=payload.subject_id,
                 metadata={"action_id": action.id, "action": payload.action, "reason": payload.reason})
    db.commit()
    return {"id": action.id, "action": action.action, "actor_user_id": admin.id, "created_at": action.created_at}


@router.post("/admin/enforcements/{enforcement_id}/resolve")
def resolve_enforcement(enforcement_id: int, db: Session = Depends(get_db), admin: User = Depends(require_owner)):
    action = db.query(TrustSafetyEnforcement).filter_by(id=enforcement_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Мера не найдена")
    if action.revoked_at is not None:
        return {"id": action.id, "revoked_at": action.revoked_at}
    action.revoked_at = now()
    action.revoked_by_user_id = admin.id
    db.flush()
    if action.subject_type == "bot" and action.action == "suspend_object":
        bot = db.query(Bot).filter_by(id=action.subject_id).first()
        if bot and "suspend_object" not in active_actions(db, subject_type="bot", subject_id=bot.id):
            bot.is_suspended = False
            bot.suspension_type = None
            bot.suspension_reason = None
            bot.suspended_at = None
            bot.suspended_until = None
            bot.suspended_by_id = None
            restore_bot_warning(db, bot)
    elif action.subject_type == "bot" and action.action == "warning":
        bot = db.query(Bot).filter_by(id=action.subject_id).first()
        if bot and not bot_suspension_active(bot) and "warning" not in active_actions(db, subject_type="bot", subject_id=bot.id):
            bot.suspension_type = None
            bot.suspension_reason = None
            bot.suspended_at = None
            bot.suspended_by_id = None
    elif action.subject_type == "user" and action.action == "account_restriction":
        user = db.query(User).filter_by(id=action.subject_id).first()
        if user and "account_restriction" not in active_actions(db, subject_type="user", subject_id=user.id):
            user.is_suspended = False
            user.suspension_type = None
            user.suspension_reason = None
            user.suspended_at = None
            user.suspended_until = None
            user.suspended_by_id = None
    record_audit(db, actor_id=admin.id, event_type="enforcement_resolved",
                 subject_type=action.subject_type, subject_id=action.subject_id,
                 metadata={"action_id": action.id, "action": action.action})
    db.commit()
    return {"id": action.id, "revoked_at": action.revoked_at}


@router.post("/admin/disputes/{dispute_id}/decide")
def decide_dispute(dispute_id: int, payload: DecisionPayload, db: Session = Depends(get_db), admin: User = Depends(require_owner)):
    dispute = db.query(MarketplaceDispute).filter_by(id=dispute_id).first()
    if not dispute:
        raise HTTPException(status_code=404, detail="Спор не найден")
    if dispute.status != "open":
        raise HTTPException(status_code=409, detail="По спору уже принято решение")
    if payload.enforcement_action_id is not None:
        action = db.query(TrustSafetyEnforcement).filter_by(id=payload.enforcement_action_id, dispute_id=dispute.id).first()
        if not action:
            raise HTTPException(status_code=422, detail="Санкция не связана с этим спором")
    dispute.status, dispute.admin_decision, dispute.decided_by_user_id = payload.status, payload.decision, admin.id
    dispute.enforcement_action_id, dispute.decided_at = payload.enforcement_action_id, now()
    record_audit(db, actor_id=admin.id, event_type="dispute_decided", subject_type="dispute", subject_id=dispute.id,
                 metadata={"status": dispute.status, "enforcement_action_id": dispute.enforcement_action_id})
    db.commit()
    return {"id": dispute.id, "status": dispute.status, "decided_by_user_id": admin.id}


@router.get("/admin/users/{user_id}/overview")
def user_overview(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_owner)):
    user = db.query(User).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    blocks = db.query(CustomBlock).filter_by(owner_user_id=user_id).all()
    bots = db.query(Bot).filter_by(owner_id=user_id).all()
    scenarios = db.query(Scenario).filter_by(user_id=user_id).all()
    templates = db.query(Template).filter_by(user_id=user_id).all()
    market_items = db.query(MarketItem).filter_by(seller_id=user_id).all()
    block_ids = [row.id for row in blocks]
    versions = db.query(CustomBlockVersion).filter(CustomBlockVersion.custom_block_id.in_(block_ids)).all() if block_ids else []
    listing_ids = [row.id for row in db.query(CustomBlockMarketplaceListing).filter(
        CustomBlockMarketplaceListing.custom_block_version_id.in_([row.id for row in versions])).all()] if versions else []
    record_audit(db, actor_id=admin.id, event_type="user_overview_viewed", subject_type="user", subject_id=user_id)
    db.commit()
    return {"user_id": user.id, "public_id": user.public_id, "block_ids": block_ids,
            "version_ids": [row.id for row in versions], "listing_ids": listing_ids,
            "bot_ids": [row.id for row in bots], "scenario_ids": [row.id for row in scenarios],
            "template_ids": [row.id for row in templates],
            "market_items": [{"id": row.id, "published": row.is_published} for row in market_items],
            "grant_ids": [row.id for row in db.query(CustomBlockAccessGrant).filter_by(recipient_user_id=user_id).all()],
            "dispute_ids": [row.id for row in db.query(MarketplaceDispute).filter(
                (MarketplaceDispute.buyer_user_id == user_id) | (MarketplaceDispute.seller_user_id == user_id)).all()],
            "report_ids": [row.id for row in db.query(TrustSafetyReport).filter_by(reporter_user_id=user_id).all()],
            "enforcements": [{"id": row.id, "action": row.action, "reason": row.reason,
                              "actor_user_id": row.actor_user_id, "created_at": row.created_at}
                             for row in db.query(TrustSafetyEnforcement).filter_by(user_id=user_id).all()]}


@router.get("/admin/bots/{bot_id}/investigation")
def bot_investigation(bot_id: int, db: Session = Depends(get_db), admin: User = Depends(require_owner)):
    bot = db.query(Bot).filter_by(id=bot_id).first()
    if not bot:
        raise HTTPException(status_code=404, detail="Бот не найден")
    scenarios = db.query(Scenario).filter_by(bot_id=bot.id).all()
    result = []
    for scenario in scenarios:
        ids = content_version_ids(scenario.content) | content_version_ids(scenario.published_content)
        result.append({"scenario_id": scenario.id, "owner_user_id": scenario.user_id,
                       "status": scenario.status, "updated_at": scenario.updated_at,
                       "custom_block_version_ids": sorted(ids)})
    record_audit(db, actor_id=admin.id, event_type="bot_investigation_viewed", subject_type="bot", subject_id=bot.id)
    db.commit()
    return {"bot_id": bot.id, "owner_user_id": bot.owner_id, "is_suspended": bot.is_suspended,
            "updated_at": bot.updated_at, "scenario_dependencies": result,
            "enforcement_ids": [row.id for row in db.query(TrustSafetyEnforcement).filter_by(
                subject_type="bot", subject_id=bot.id).all()]}
