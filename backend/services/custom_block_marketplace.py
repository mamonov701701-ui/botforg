"""Canonical Marketplace rights boundary for exact Custom Block versions."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models.custom_block import CUSTOM_BLOCK_ARCHIVED, CUSTOM_BLOCK_PUBLISHED, CUSTOM_BLOCK_REVIEW_APPROVED, CustomBlockVersion
from backend.models.custom_block_marketplace import (
    ACCESS_AUTHOR_APPROVAL, ACCESS_EXPLICIT_GRANT, ACCESS_SELF_INSTALL, COMMERCIAL_EXTERNAL_TERMS,
    GRANT_ACTIVE, GRANT_REVOKED, LISTING_ARCHIVED, LISTING_DRAFT, LISTING_PUBLISHED,
    REQUEST_APPROVED, REQUEST_PENDING, REQUEST_REJECTED, VISIBILITY_PRIVATE,
    CustomBlockAccessGrant, CustomBlockAccessRequest, CustomBlockLibraryInstall, CustomBlockMarketplaceAuditEvent,
    CustomBlockMarketplaceListing, CustomBlockMarketplaceReview,
)
from backend.models.user import User
from backend.services.custom_blocks import public_passport
from backend.services.trust_safety import listing_hidden


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class CustomBlockEffectiveRights:
    is_owner: bool
    is_platform_admin: bool
    has_active_grant: bool
    has_grant_history: bool
    has_library_install: bool
    listing_available: bool
    can_view_listing: bool
    can_request_access: bool
    can_self_install: bool
    can_use_version: bool
    can_add_new_node: bool
    can_execute_existing_reference: bool
    can_view_source: bool
    can_manage_listing: bool
    can_review: bool


def _is_platform_admin(user: Any) -> bool:
    return (getattr(user, "role", "") or "").strip().lower() in {"owner", "admin"}


def is_marketplace_eligible(version: CustomBlockVersion) -> bool:
    return (
        version.status == CUSTOM_BLOCK_PUBLISHED
        and version.review_state == CUSTOM_BLOCK_REVIEW_APPROVED
        and version.execution_state == "enabled"
    )


def get_listing(db: Session, version_id: int) -> CustomBlockMarketplaceListing | None:
    return db.query(CustomBlockMarketplaceListing).filter_by(custom_block_version_id=version_id).first()


def resolve_custom_block_effective_rights(db: Session, *, user: Any, version: CustomBlockVersion, listing: CustomBlockMarketplaceListing | None = None) -> CustomBlockEffectiveRights:
    listing = listing if listing is not None else get_listing(db, version.id)
    is_owner = version.block.owner_user_id == user.id
    is_admin = _is_platform_admin(user)
    grant = db.query(CustomBlockAccessGrant).filter_by(custom_block_version_id=version.id, recipient_user_id=user.id).first()
    has_active_grant = bool(grant and grant.status == GRANT_ACTIVE)
    has_history = grant is not None
    has_library_install = db.query(CustomBlockLibraryInstall.id).filter_by(custom_block_version_id=version.id, user_id=user.id).first() is not None
    source_eligible = is_marketplace_eligible(version)
    listing_available = bool(listing and listing.lifecycle == LISTING_PUBLISHED and source_eligible
                             and not listing_hidden(db, listing.id))
    discoverable = bool(listing_available and listing.visibility != VISIBILITY_PRIVATE)
    can_view_listing = is_owner or is_admin or discoverable or has_active_grant
    can_self_install = bool(discoverable and listing.access_policy == ACCESS_SELF_INSTALL and listing.commercial_mode == "free" and not is_owner and not has_history)
    # External terms always require a conversation and author-issued exact-version grant.
    can_request = bool(
        discoverable
        and (listing.access_policy == ACCESS_AUTHOR_APPROVAL or listing.commercial_mode == COMMERCIAL_EXTERNAL_TERMS)
        and not is_owner
        and not has_active_grant
    )
    can_use = bool((is_owner or has_active_grant) and version.execution_state == "enabled" and version.status in {CUSTOM_BLOCK_PUBLISHED, CUSTOM_BLOCK_ARCHIVED})
    can_add = bool(can_use and version.status == CUSTOM_BLOCK_PUBLISHED and (is_owner or has_library_install))
    return CustomBlockEffectiveRights(
        is_owner=is_owner, is_platform_admin=is_admin, has_active_grant=has_active_grant,
        has_grant_history=has_history, has_library_install=has_library_install, listing_available=listing_available,
        can_view_listing=can_view_listing, can_request_access=can_request,
        can_self_install=can_self_install, can_use_version=can_use,
        can_add_new_node=can_add, can_execute_existing_reference=can_use,
        can_view_source=is_owner or is_admin, can_manage_listing=is_owner, can_review=has_history and not is_owner,
    )


def audit(db: Session, *, version_id: int, actor_user_id: int | None, event_type: str, listing_id: int | None = None, metadata: dict | None = None) -> None:
    db.add(CustomBlockMarketplaceAuditEvent(custom_block_version_id=version_id, listing_id=listing_id, actor_user_id=actor_user_id, event_type=event_type, metadata_json=metadata or {}))


def create_or_reactivate_grant(db: Session, *, version: CustomBlockVersion, recipient_user_id: int, actor_user_id: int, source: str, note: str = "") -> tuple[CustomBlockAccessGrant, bool]:
    grant = db.query(CustomBlockAccessGrant).filter_by(custom_block_version_id=version.id, recipient_user_id=recipient_user_id).first()
    if grant:
        if grant.status == GRANT_ACTIVE:
            # A renewed explicit Direct Grant can clarify an old ambiguous
            # "direct" record without replacing a Marketplace acquisition.
            if source == "direct_grant" and grant.grant_source == "direct":
                grant.grant_source = source
            return grant, True
        grant.status = GRANT_ACTIVE
        grant.granted_by_user_id = actor_user_id
        grant.grant_source = source
        grant.note = note
        grant.revoked_at = None
        grant.revoked_by_user_id = None
        audit(db, version_id=version.id, actor_user_id=actor_user_id, event_type="grant_reactivated")
        return grant, False
    grant = CustomBlockAccessGrant(custom_block_version_id=version.id, recipient_user_id=recipient_user_id, granted_by_user_id=actor_user_id, grant_source=source, note=note)
    db.add(grant)
    audit(db, version_id=version.id, actor_user_id=actor_user_id, event_type="grant_created", metadata={"source": source})
    return grant, False


def ensure_listing_mutable(version: CustomBlockVersion, user: Any) -> None:
    if version.block.owner_user_id != user.id:
        raise HTTPException(status_code=403, detail="Только владелец блока может управлять Marketplace listing")


def serialize_consumer_listing(db: Session, listing: CustomBlockMarketplaceListing, user: Any) -> dict:
    version = db.query(CustomBlockVersion).filter_by(id=listing.custom_block_version_id).one()
    author = db.query(User).filter_by(id=version.block.owner_user_id).first()
    rights = resolve_custom_block_effective_rights(db, user=user, version=version, listing=listing)
    reviews = db.query(CustomBlockMarketplaceReview).filter_by(custom_block_version_id=version.id).all()
    request = (db.query(CustomBlockAccessRequest)
               .filter_by(custom_block_version_id=version.id, requester_user_id=user.id)
               .order_by(CustomBlockAccessRequest.created_at.desc(), CustomBlockAccessRequest.id.desc()).first())
    average = round(sum(item.rating for item in reviews) / len(reviews), 2) if reviews else None
    # This intentionally never uses serialize_version: execution_spec/source and review reports are private.
    safe_passport = public_passport(version.passport)
    return {
        "id": listing.id, "custom_block_version_id": version.id, "stable_block_id": version.block.stable_key,
        "version": version.version, "title": listing.title or version.title, "block_title": version.title,
        "description": listing.description if listing.description is not None else version.description,
        "category": listing.category or version.category, "tags": listing.tags or [],
        "visibility": listing.visibility, "access_policy": listing.access_policy,
        "commercial_mode": listing.commercial_mode, "price_amount": listing.price_amount,
        "price_currency": listing.price_currency, "lifecycle": listing.lifecycle,
        "created_at": listing.created_at,
        "author": {"id": version.block.owner_user_id, "name": author.name if author and author.name else f"Пользователь #{version.block.owner_user_id}"},
        "passport": safe_passport,
        "user_guide": version.user_guide or {}, "runtime_kind": version.runtime_kind,
        "rating_average": average, "rating_count": len(reviews),
        "access": {"is_owner": rights.is_owner, "can_view_listing": rights.can_view_listing, "can_self_install": rights.can_self_install,
                   "can_request_access": rights.can_request_access, "can_add_new_node": rights.can_add_new_node,
                   "has_active_grant": rights.has_active_grant, "has_grant_history": rights.has_grant_history,
                   "is_installed": rights.has_library_install, "listing_available": rights.listing_available,
                   "request_state": request.state if request else None,
                   "chat_room_id": request.chat_room_id if request else None},
    }
