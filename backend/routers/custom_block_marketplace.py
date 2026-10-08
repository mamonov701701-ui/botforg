"""Source-safe Marketplace API for exact Custom Block versions."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.dependencies.auth import get_current_user
from backend.models.custom_block import CustomBlock, CustomBlockVersion
from backend.models.custom_block_marketplace import (
    ACCESS_AUTHOR_APPROVAL, ACCESS_EXPLICIT_GRANT, ACCESS_SELF_INSTALL, COMMERCIAL_EXTERNAL_TERMS, COMMERCIAL_FREE, COMMERCIAL_PAID, GRANT_ACTIVE,
    GRANT_REVOKED, LISTING_ARCHIVED, LISTING_DRAFT, LISTING_PUBLISHED, REQUEST_APPROVED,
    REQUEST_PENDING, REQUEST_REJECTED, VISIBILITY_PUBLIC, CustomBlockAccessGrant, CustomBlockLibraryInstall,
    CustomBlockDistributionGrant,
    CustomBlockAccessRequest, CustomBlockMarketplaceListing, CustomBlockMarketplaceReview,
)
from backend.models.user import User
from backend.schemas.custom_block_marketplace import (
    AccessRequestPayload, DecisionPayload, ExplicitGrantPayload, ListingPayload, ReviewPayload,
)
from backend.services.custom_block_marketplace import (
    audit, create_or_reactivate_grant, ensure_listing_mutable, get_listing, is_marketplace_eligible,
    resolve_custom_block_effective_rights, serialize_consumer_listing, utcnow,
)
from backend.services.custom_block_distribution import acquire_free_public_distribution, is_free_public_open
from backend.services.custom_block_overview import received_custom_block_rows
from backend.services.trust_safety import listing_hidden, market_restricted
from backend.services.chat_room_service import (
    create_system_chat_message,
    create_user_chat_message,
    get_or_create_private_room,
)

router = APIRouter(prefix="/custom-block-marketplace", tags=["Custom Block Marketplace"])


def _version_or_404(db: Session, version_id: int) -> CustomBlockVersion:
    row = db.query(CustomBlockVersion).filter_by(id=version_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Версия блока не найдена")
    return row


def _listing_or_404(db: Session, listing_id: int) -> CustomBlockMarketplaceListing:
    row = db.query(CustomBlockMarketplaceListing).filter_by(id=listing_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Marketplace listing не найден")
    return row


def _apply_payload(listing: CustomBlockMarketplaceListing, payload: ListingPayload) -> None:
    listing.visibility = VISIBILITY_PUBLIC
    listing.access_policy = ACCESS_SELF_INSTALL if payload.commercial_mode == "free" else ACCESS_EXPLICIT_GRANT
    for field in ("commercial_mode", "price_amount", "price_currency", "title", "description", "category", "tags"):
        setattr(listing, field, getattr(payload, field))


@router.get("/listings")
def list_listings(
    search: Optional[str] = Query(None, max_length=160), category: Optional[str] = Query(None, max_length=64),
    limit: int = Query(24, ge=1, le=100), offset: int = Query(0, ge=0),
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user),
):
    query = db.query(CustomBlockMarketplaceListing).filter(
        CustomBlockMarketplaceListing.lifecycle == LISTING_PUBLISHED,
        CustomBlockMarketplaceListing.visibility == VISIBILITY_PUBLIC,
        or_(and_(CustomBlockMarketplaceListing.commercial_mode == COMMERCIAL_FREE,
                CustomBlockMarketplaceListing.access_policy == ACCESS_SELF_INSTALL),
            and_(CustomBlockMarketplaceListing.commercial_mode == COMMERCIAL_PAID,
                CustomBlockMarketplaceListing.access_policy == ACCESS_EXPLICIT_GRANT,
                CustomBlockMarketplaceListing.price_amount > 0,
                CustomBlockMarketplaceListing.price_currency.is_not(None))),
    )
    if category:
        query = query.filter(CustomBlockMarketplaceListing.category == category)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(or_(CustomBlockMarketplaceListing.title.ilike(pattern), CustomBlockMarketplaceListing.description.ilike(pattern)))
    visible = [item for item in query.order_by(CustomBlockMarketplaceListing.published_at.desc()).all()
               if not listing_hidden(db, item.id)]
    return {"items": [serialize_consumer_listing(db, item, current_user) for item in visible[offset:offset + limit]],
            "total": len(visible), "limit": limit, "offset": offset}


@router.get("/listings/{listing_id}")
def get_listing_detail(listing_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    listing = _listing_or_404(db, listing_id)
    version = _version_or_404(db, listing.custom_block_version_id)
    rights = resolve_custom_block_effective_rights(db, user=current_user, version=version, listing=listing)
    if not rights.can_view_listing:
        # Do not make private/unlisted listings enumerable.
        raise HTTPException(status_code=404, detail="Marketplace listing не найден")
    data = serialize_consumer_listing(db, listing, current_user)
    reviews = db.query(CustomBlockMarketplaceReview).filter_by(custom_block_version_id=version.id).order_by(CustomBlockMarketplaceReview.updated_at.desc()).all()
    data["reviews"] = [{"id": item.id, "author_user_id": item.author_user_id, "rating": item.rating, "text": item.text, "created_at": item.created_at, "updated_at": item.updated_at} for item in reviews]
    return data


@router.get("/mine/listings")
def list_my_listings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (db.query(CustomBlockMarketplaceListing).join(CustomBlockVersion)
            .filter(CustomBlockVersion.block.has(owner_user_id=current_user.id))
            .order_by(CustomBlockMarketplaceListing.updated_at.desc()).all())
    return [serialize_consumer_listing(db, item, current_user) for item in rows]


@router.get("/mine/eligible-versions")
def list_my_eligible_versions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Published reviewed versions the author can place in Marketplace."""
    versions = (
        db.query(CustomBlockVersion)
        .join(CustomBlock)
        .outerjoin(
            CustomBlockMarketplaceListing,
            CustomBlockMarketplaceListing.custom_block_version_id == CustomBlockVersion.id,
        )
        .filter(
            CustomBlock.owner_user_id == current_user.id,
            CustomBlockMarketplaceListing.id.is_(None),
        )
        .order_by(CustomBlockVersion.created_at.desc())
        .all()
    )
    return [
        {"id": version.id, "title": version.title, "version": version.version}
        for version in versions
        if is_marketplace_eligible(version)
    ]


@router.post("/versions/{version_id}/listing", status_code=status.HTTP_201_CREATED)
def create_listing(version_id: int, payload: ListingPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    version = _version_or_404(db, version_id)
    ensure_listing_mutable(version, current_user)
    if not is_marketplace_eligible(version):
        raise HTTPException(status_code=409, detail="В Marketplace можно подготовить только опубликованную и одобренную точную версию")
    if market_restricted(db, current_user.id, paid=payload.commercial_mode == COMMERCIAL_PAID):
        raise HTTPException(status_code=403, detail="Размещение в Маркете временно ограничено")
    if get_listing(db, version.id):
        raise HTTPException(status_code=409, detail="Listing для этой версии уже существует")
    listing = CustomBlockMarketplaceListing(custom_block_version_id=version.id)
    _apply_payload(listing, payload)
    db.add(listing)
    db.flush()
    audit(db, version_id=version.id, listing_id=listing.id, actor_user_id=current_user.id, event_type="listing_created")
    db.commit()
    return serialize_consumer_listing(db, listing, current_user)


@router.put("/listings/{listing_id}")
def update_listing(listing_id: int, payload: ListingPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    listing = _listing_or_404(db, listing_id)
    version = _version_or_404(db, listing.custom_block_version_id)
    ensure_listing_mutable(version, current_user)
    if listing.lifecycle not in {LISTING_DRAFT, LISTING_PUBLISHED}:
        raise HTTPException(status_code=409, detail="Архивированный listing нельзя редактировать")
    if listing.lifecycle == LISTING_PUBLISHED:
        if listing.commercial_mode == "free" and payload.commercial_mode == "paid":
            raise HTTPException(status_code=409, detail="Условия опубликованной карточки нельзя ухудшать; создайте новую версию размещения")
        if (listing.commercial_mode == COMMERCIAL_PAID and payload.commercial_mode == COMMERCIAL_PAID
                and (payload.price_currency != listing.price_currency or payload.price_amount > listing.price_amount)):
            raise HTTPException(status_code=409, detail="Цену опубликованной карточки нельзя повышать или менять валюту")
    if market_restricted(db, current_user.id, paid=payload.commercial_mode == COMMERCIAL_PAID):
        raise HTTPException(status_code=403, detail="Размещение в Маркете временно ограничено")
    _apply_payload(listing, payload)
    if listing.lifecycle == LISTING_PUBLISHED and is_free_public_open(listing):
        # A relaxation to free/public/open also upgrades already installed,
        # actively licensed users without changing their use grant or ownership.
        for install in db.query(CustomBlockLibraryInstall).filter_by(custom_block_version_id=version.id).all():
            active = db.query(CustomBlockAccessGrant.id).filter_by(
                custom_block_version_id=version.id, recipient_user_id=install.user_id, status=GRANT_ACTIVE).first()
            if active:
                acquire_free_public_distribution(db, user_id=install.user_id, version=version, listing=listing)
    db.commit()
    return serialize_consumer_listing(db, listing, current_user)


@router.post("/listings/{listing_id}/publish")
def publish_listing(listing_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    listing = _listing_or_404(db, listing_id)
    version = _version_or_404(db, listing.custom_block_version_id)
    ensure_listing_mutable(version, current_user)
    if not is_marketplace_eligible(version):
        raise HTTPException(status_code=409, detail="Версия больше не соответствует условиям публикации Marketplace")
    if listing.lifecycle != LISTING_DRAFT:
        raise HTTPException(status_code=409, detail="Опубликовать можно только черновик listing")
    if market_restricted(db, current_user.id, paid=listing.commercial_mode == COMMERCIAL_PAID):
        raise HTTPException(status_code=403, detail="Размещение в Маркете временно ограничено")
    if listing.commercial_mode == COMMERCIAL_PAID and (listing.price_amount is None or not listing.price_currency):
        raise HTTPException(status_code=409, detail="Для платной карточки обязательна фиксированная цена")
    listing.lifecycle, listing.published_at, listing.archived_at = LISTING_PUBLISHED, utcnow(), None
    audit(db, version_id=version.id, listing_id=listing.id, actor_user_id=current_user.id, event_type="listing_published")
    db.commit()
    return serialize_consumer_listing(db, listing, current_user)


@router.post("/listings/{listing_id}/archive")
def archive_listing(listing_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    listing = _listing_or_404(db, listing_id)
    version = _version_or_404(db, listing.custom_block_version_id)
    ensure_listing_mutable(version, current_user)
    if listing.lifecycle != LISTING_PUBLISHED:
        raise HTTPException(status_code=409, detail="Архивировать можно только опубликованный listing")
    listing.lifecycle, listing.archived_at = LISTING_ARCHIVED, utcnow()
    audit(db, version_id=version.id, listing_id=listing.id, actor_user_id=current_user.id, event_type="listing_archived")
    db.commit()
    return serialize_consumer_listing(db, listing, current_user)


@router.post("/listings/{listing_id}/restore")
def restore_listing(listing_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    listing = _listing_or_404(db, listing_id)
    version = _version_or_404(db, listing.custom_block_version_id)
    ensure_listing_mutable(version, current_user)
    if listing.lifecycle != LISTING_ARCHIVED or not is_marketplace_eligible(version):
        raise HTTPException(status_code=409, detail="Listing нельзя восстановить в текущем состоянии версии")
    if market_restricted(db, current_user.id, paid=listing.commercial_mode == COMMERCIAL_PAID):
        raise HTTPException(status_code=403, detail="Восстановление размещения в Маркете временно ограничено")
    listing.lifecycle, listing.archived_at = LISTING_PUBLISHED, None
    audit(db, version_id=version.id, listing_id=listing.id, actor_user_id=current_user.id, event_type="listing_restored")
    db.commit()
    return serialize_consumer_listing(db, listing, current_user)


@router.post("/listings/{listing_id}/install")
def self_install(listing_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    listing = _listing_or_404(db, listing_id)
    version = _version_or_404(db, listing.custom_block_version_id)
    rights = resolve_custom_block_effective_rights(db, user=current_user, version=version, listing=listing)
    if not rights.listing_available or version.block.owner_user_id == current_user.id:
        raise HTTPException(status_code=403, detail="Добавление блока недоступно")
    if rights.has_active_grant:
        grant = db.query(CustomBlockAccessGrant).filter_by(custom_block_version_id=version.id, recipient_user_id=current_user.id).one()
    elif rights.can_self_install:
        grant, _ = create_or_reactivate_grant(db, version=version, recipient_user_id=current_user.id, actor_user_id=current_user.id, source="self_install")
    else:
        raise HTTPException(status_code=403, detail="Добавление блока недоступно")
    installed = db.query(CustomBlockLibraryInstall).filter_by(custom_block_version_id=version.id, user_id=current_user.id).first()
    already_exists = installed is not None
    if not installed:
        db.add(CustomBlockLibraryInstall(custom_block_version_id=version.id, user_id=current_user.id))
        audit(db, version_id=version.id, actor_user_id=current_user.id, event_type="library_installed")
    acquire_free_public_distribution(db, user_id=current_user.id, version=version, listing=listing)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent repeat may win either unique constraint. Re-read both
        # canonical records; never turn an unrelated integrity failure into success.
        db.rollback()
        grant = db.query(CustomBlockAccessGrant).filter_by(custom_block_version_id=version.id, recipient_user_id=current_user.id, status=GRANT_ACTIVE).first()
        installed = db.query(CustomBlockLibraryInstall).filter_by(custom_block_version_id=version.id, user_id=current_user.id).first()
        distribution = db.query(CustomBlockDistributionGrant.id).filter_by(
            custom_block_version_id=version.id, user_id=current_user.id).first()
        if not grant or not installed or (is_free_public_open(listing) and not distribution):
            raise HTTPException(status_code=409, detail="Добавление блока не удалось")
        already_exists = True
    return {"grant_id": grant.id, "already_exists": already_exists, "installed": True}


@router.post("/versions/{version_id}/distribution-grants", status_code=status.HTTP_201_CREATED)
def grant_distribution(version_id: int, payload: ExplicitGrantPayload, response: Response,
                       db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    version = _version_or_404(db, version_id)
    ensure_listing_mutable(version, current_user)
    listing = get_listing(db, version.id)
    if not is_marketplace_eligible(version):
        raise HTTPException(status_code=409, detail="Право распространения сейчас нельзя выдать")
    recipient = (db.query(User).filter_by(public_id=payload.recipient_public_id).first()
                 if payload.recipient_public_id is not None else db.query(User).filter_by(id=payload.recipient_user_id).first())
    if not recipient:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if recipient.id == current_user.id:
        raise HTTPException(status_code=400, detail="Автору не требуется отдельное право")
    use_grant = db.query(CustomBlockAccessGrant).filter_by(
        custom_block_version_id=version.id, recipient_user_id=recipient.id, status=GRANT_ACTIVE).first()
    if not use_grant:
        raise HTTPException(status_code=409, detail="Сначала выдайте пользователю право использования")
    grant = db.query(CustomBlockDistributionGrant).filter_by(
        custom_block_version_id=version.id, user_id=recipient.id).first()
    if grant:
        response.status_code = status.HTTP_200_OK
        return {"id": grant.id, "already_exists": True}
    grant = CustomBlockDistributionGrant(
        user_id=recipient.id, custom_block_version_id=version.id,
        granted_by_user_id=current_user.id, source="author",
        original_author_user_id=version.block.owner_user_id,
        block_title=version.title, version_number=version.version,
    )
    db.add(grant)
    audit(db, version_id=version.id, actor_user_id=current_user.id, event_type="distribution_granted",
          metadata={"recipient_user_id": recipient.id})
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        grant = db.query(CustomBlockDistributionGrant).filter_by(
            custom_block_version_id=version.id, user_id=recipient.id).first()
        if not grant:
            raise HTTPException(status_code=409, detail="Не удалось выдать право распространения")
        response.status_code = status.HTTP_200_OK
        return {"id": grant.id, "already_exists": True}
    return {"id": grant.id, "already_exists": False}


@router.post("/versions/{version_id}/direct-grants", status_code=status.HTTP_201_CREATED)
def direct_grant(version_id: int, payload: ExplicitGrantPayload, response: Response,
                 db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    version = _version_or_404(db, version_id)
    ensure_listing_mutable(version, current_user)
    if not is_marketplace_eligible(version):
        raise HTTPException(status_code=409, detail="Точная версия недоступна для выдачи доступа")
    recipient = (db.query(User).filter_by(public_id=payload.recipient_public_id).first()
                 if payload.recipient_public_id is not None else db.query(User).filter_by(id=payload.recipient_user_id).first())
    if not recipient:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if recipient.id == current_user.id:
        raise HTTPException(status_code=400, detail="Автору не требуется выдавать доступ самому себе")
    grant, already = create_or_reactivate_grant(db, version=version, recipient_user_id=recipient.id,
                                                 actor_user_id=current_user.id, source="direct_grant", note=payload.note)
    db.commit()
    if already:
        response.status_code = status.HTTP_200_OK
    return {"id": grant.id, "already_exists": already}


@router.get("/mine/granted-versions")
def my_granted_versions(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    grants = db.query(CustomBlockAccessGrant).filter_by(recipient_user_id=current_user.id, status=GRANT_ACTIVE).all()
    result = []
    for grant in grants:
        version = _version_or_404(db, grant.custom_block_version_id)
        rights = resolve_custom_block_effective_rights(db, user=current_user, version=version)
        listing = get_listing(db, version.id)
        result.append({"custom_block_version_id": version.id, "title": version.title, "version": version.version,
                       "original_author_user_id": version.block.owner_user_id,
                       "listing_id": listing.id if listing and listing.lifecycle == LISTING_PUBLISHED else None,
                       "is_installed": rights.has_library_install, "can_install": is_marketplace_eligible(version),
                       "grant_source": grant.grant_source})
    return result


@router.get("/mine/rights-overview")
def my_rights_overview(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"items": received_custom_block_rows(db, current_user.id)}


@router.post("/versions/{version_id}/install")
def install_granted_version(version_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    version = _version_or_404(db, version_id)
    if not is_marketplace_eligible(version) or version.block.owner_user_id == current_user.id:
        raise HTTPException(status_code=403, detail="Добавление версии недоступно")
    grant = db.query(CustomBlockAccessGrant).filter_by(
        custom_block_version_id=version.id, recipient_user_id=current_user.id, status=GRANT_ACTIVE).first()
    if not grant:
        raise HTTPException(status_code=403, detail="Нет действующего права использования")
    installed = db.query(CustomBlockLibraryInstall).filter_by(
        custom_block_version_id=version.id, user_id=current_user.id).first()
    if installed:
        return {"installed": True, "already_exists": True, "grant_id": grant.id}
    db.add(CustomBlockLibraryInstall(custom_block_version_id=version.id, user_id=current_user.id))
    audit(db, version_id=version.id, actor_user_id=current_user.id, event_type="library_installed")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if not db.query(CustomBlockLibraryInstall.id).filter_by(custom_block_version_id=version.id, user_id=current_user.id).first():
            raise HTTPException(status_code=409, detail="Добавление версии не удалось")
        return {"installed": True, "already_exists": True, "grant_id": grant.id}
    return {"installed": True, "already_exists": False, "grant_id": grant.id}


@router.post("/listings/{listing_id}/contact")
def contact_listing_author(listing_id: int, payload: AccessRequestPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Communication only; no request, grant, or library installation is created."""
    listing = _listing_or_404(db, listing_id)
    version = _version_or_404(db, listing.custom_block_version_id)
    rights = resolve_custom_block_effective_rights(db, user=current_user, version=version, listing=listing)
    if (not rights.can_view_listing or not rights.listing_available or version.block.owner_user_id == current_user.id
            or (listing.commercial_mode != COMMERCIAL_PAID and listing.access_policy != ACCESS_EXPLICIT_GRANT and listing.commercial_mode != COMMERCIAL_EXTERNAL_TERMS)):
        raise HTTPException(status_code=403, detail="Связаться с автором недоступно")
    room, _ = get_or_create_private_room(db, current_user.id, version.block.owner_user_id, current_user.id)
    if payload.message.strip():
        create_user_chat_message(db, room.id, current_user.id, payload.message.strip())
    db.commit()
    return {"chat_room_id": room.id}


@router.post("/listings/{listing_id}/access-requests", status_code=status.HTTP_201_CREATED)
def create_access_request(listing_id: int, payload: AccessRequestPayload, response: Response, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    listing = _listing_or_404(db, listing_id)
    version = _version_or_404(db, listing.custom_block_version_id)
    rights = resolve_custom_block_effective_rights(db, user=current_user, version=version, listing=listing)
    if not rights.can_request_access:
        raise HTTPException(status_code=403, detail="Запрос доступа недоступен")
    existing = db.query(CustomBlockAccessRequest).filter_by(custom_block_version_id=version.id, requester_user_id=current_user.id, state=REQUEST_PENDING).first()
    if existing:
        if not existing.chat_room_id:
            room, _ = get_or_create_private_room(db, current_user.id, existing.author_user_id, current_user.id)
            existing.chat_room_id = room.id
            db.commit()
        response.status_code = status.HTTP_200_OK
        return {"id": existing.id, "state": existing.state, "chat_room_id": existing.chat_room_id, "already_exists": True}
    room, _ = get_or_create_private_room(db, current_user.id, version.block.owner_user_id, current_user.id)
    request = CustomBlockAccessRequest(
        custom_block_version_id=version.id,
        requester_user_id=current_user.id,
        author_user_id=version.block.owner_user_id,
        chat_room_id=room.id,
        message=payload.message,
    )
    db.add(request)
    db.flush()
    create_system_chat_message(db, room.id, f"Запрос доступа к блоку «{listing.title or version.title}», версия {version.version}.")
    if payload.message.strip():
        create_user_chat_message(db, room.id, current_user.id, payload.message.strip())
    audit(db, version_id=version.id, actor_user_id=current_user.id, event_type="access_requested")
    db.commit()
    return {"id": request.id, "state": request.state, "chat_room_id": room.id, "already_exists": False}


@router.get("/access-requests/mine")
def list_incoming_requests(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(CustomBlockAccessRequest).filter_by(author_user_id=current_user.id).order_by(CustomBlockAccessRequest.created_at.desc()).all()
    return [{
        "id": row.id,
        "custom_block_version_id": row.custom_block_version_id,
        "listing_id": get_listing(db, row.custom_block_version_id).id if get_listing(db, row.custom_block_version_id) else None,
        "version": _version_or_404(db, row.custom_block_version_id).version,
        "block_title": _version_or_404(db, row.custom_block_version_id).title,
        "requester_user_id": row.requester_user_id,
        "requester_name": (db.query(User).filter_by(id=row.requester_user_id).first().name or f"Пользователь #{row.requester_user_id}"),
        "state": row.state,
        "message": row.message,
        "chat_room_id": row.chat_room_id,
        "created_at": row.created_at,
    } for row in rows]


def _request_decision(db: Session, request_id: int, payload: DecisionPayload, current_user: User, approve: bool):
    request = db.query(CustomBlockAccessRequest).filter_by(id=request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Запрос доступа не найден")
    if request.author_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Только автор может принять решение по запросу")
    if request.state != REQUEST_PENDING:
        raise HTTPException(status_code=409, detail="По этому запросу уже принято решение")
    version = _version_or_404(db, request.custom_block_version_id)
    listing = get_listing(db, version.id)
    if not listing or listing.lifecycle != LISTING_PUBLISHED or (listing.access_policy != ACCESS_AUTHOR_APPROVAL and listing.commercial_mode != COMMERCIAL_EXTERNAL_TERMS) or not is_marketplace_eligible(version):
        raise HTTPException(status_code=409, detail="Запрос больше не может быть обработан")
    request.state = REQUEST_APPROVED if approve else REQUEST_REJECTED
    request.decision_note, request.decided_at, request.decided_by_user_id = payload.note, utcnow(), current_user.id
    result = {"request_id": request.id, "state": request.state}
    if approve:
        grant, already = create_or_reactivate_grant(db, version=version, recipient_user_id=request.requester_user_id, actor_user_id=current_user.id, source="author_approval", note=payload.note)
        db.flush()
        result.update({"grant_id": grant.id, "grant_already_exists": already})
    audit(db, version_id=version.id, actor_user_id=current_user.id, event_type="access_request_approved" if approve else "access_request_rejected")
    db.commit()
    return result


@router.post("/access-requests/{request_id}/approve")
def approve_access_request(request_id: int, payload: DecisionPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _request_decision(db, request_id, payload, current_user, True)


@router.post("/access-requests/{request_id}/reject")
def reject_access_request(request_id: int, payload: DecisionPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return _request_decision(db, request_id, payload, current_user, False)


@router.post("/versions/{version_id}/grants", status_code=status.HTTP_201_CREATED)
def explicit_grant(version_id: int, payload: ExplicitGrantPayload, response: Response, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    version = _version_or_404(db, version_id)
    ensure_listing_mutable(version, current_user)
    listing = get_listing(db, version.id)
    if not listing or listing.lifecycle != LISTING_PUBLISHED or listing.access_policy != ACCESS_EXPLICIT_GRANT or not is_marketplace_eligible(version):
        raise HTTPException(status_code=409, detail="Явная выдача доступа недоступна")
    recipient = (db.query(User).filter_by(public_id=payload.recipient_public_id).first()
                 if payload.recipient_public_id is not None else db.query(User).filter_by(id=payload.recipient_user_id).first())
    if not recipient:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if recipient.id == current_user.id:
        raise HTTPException(status_code=400, detail="Автору не требуется выдавать доступ самому себе")
    grant, already = create_or_reactivate_grant(db, version=version, recipient_user_id=recipient.id, actor_user_id=current_user.id, source="explicit_grant", note=payload.note)
    db.commit()
    if already:
        response.status_code = status.HTTP_200_OK
    return {"id": grant.id, "already_exists": already}


@router.get("/versions/{version_id}/grants")
def list_grants(version_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    version = _version_or_404(db, version_id)
    ensure_listing_mutable(version, current_user)
    rows = db.query(CustomBlockAccessGrant).filter_by(custom_block_version_id=version.id).order_by(CustomBlockAccessGrant.created_at.desc()).all()
    return [{"id": row.id, "recipient_user_id": row.recipient_user_id, "recipient_name": (db.query(User).filter_by(id=row.recipient_user_id).first().name or f"Пользователь #{row.recipient_user_id}"), "status": row.status, "grant_source": row.grant_source, "created_at": row.created_at, "revoked_at": row.revoked_at} for row in rows]


@router.get("/versions/{version_id}/reviews")
def list_reviews_for_author(version_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    version = _version_or_404(db, version_id)
    ensure_listing_mutable(version, current_user)
    rows = db.query(CustomBlockMarketplaceReview).filter_by(custom_block_version_id=version.id).order_by(CustomBlockMarketplaceReview.updated_at.desc()).all()
    return [{"id": row.id, "author_user_id": row.author_user_id, "author_name": (db.query(User).filter_by(id=row.author_user_id).first().name or f"Пользователь #{row.author_user_id}"), "rating": row.rating, "text": row.text, "updated_at": row.updated_at} for row in rows]


@router.post("/grants/{grant_id}/revoke")
def revoke_grant(grant_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    grant = db.query(CustomBlockAccessGrant).filter_by(id=grant_id).first()
    if not grant:
        raise HTTPException(status_code=404, detail="Grant не найден")
    version = _version_or_404(db, grant.custom_block_version_id)
    ensure_listing_mutable(version, current_user)
    if grant.status == GRANT_REVOKED:
        return {"id": grant.id, "already_revoked": True}
    grant.status, grant.revoked_at, grant.revoked_by_user_id = GRANT_REVOKED, utcnow(), current_user.id
    audit(db, version_id=version.id, actor_user_id=current_user.id, event_type="grant_revoked")
    db.commit()
    return {"id": grant.id, "already_revoked": False}


@router.put("/versions/{version_id}/my-review")
def upsert_review(version_id: int, payload: ReviewPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    version = _version_or_404(db, version_id)
    rights = resolve_custom_block_effective_rights(db, user=current_user, version=version)
    if not rights.can_review:
        raise HTTPException(status_code=403, detail="Отзыв доступен только пользователю с историей законного доступа")
    review = db.query(CustomBlockMarketplaceReview).filter_by(custom_block_version_id=version.id, author_user_id=current_user.id).first()
    if review:
        review.rating, review.text = payload.rating, payload.text
    else:
        review = CustomBlockMarketplaceReview(custom_block_version_id=version.id, author_user_id=current_user.id, rating=payload.rating, text=payload.text)
        db.add(review)
    db.commit()
    return {"id": review.id, "rating": review.rating, "text": review.text, "updated_at": review.updated_at}
