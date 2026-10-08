"""Marketplace and exact-version licensing records for Custom Blocks."""
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint

from backend.database import Base


def utcnow():
    return datetime.now(timezone.utc)


LISTING_DRAFT = "draft"
LISTING_PUBLISHED = "published"
LISTING_ARCHIVED = "archived"
VISIBILITY_PUBLIC = "public"
VISIBILITY_UNLISTED = "unlisted"
VISIBILITY_PRIVATE = "private"
ACCESS_SELF_INSTALL = "self_install"
ACCESS_AUTHOR_APPROVAL = "author_approval"
ACCESS_EXPLICIT_GRANT = "explicit_grant"
COMMERCIAL_FREE = "free"
COMMERCIAL_PAID = "paid"
COMMERCIAL_EXTERNAL_TERMS = "external_terms"
GRANT_ACTIVE = "active"
GRANT_REVOKED = "revoked"
REQUEST_PENDING = "pending"
REQUEST_APPROVED = "approved"
REQUEST_REJECTED = "rejected"


class CustomBlockMarketplaceListing(Base):
    __tablename__ = "custom_block_marketplace_listings"
    __table_args__ = (
        UniqueConstraint("custom_block_version_id", name="uq_cb_marketplace_listing_version"),
        Index("ix_cb_marketplace_listing_discovery", "lifecycle", "visibility", "category"),
    )

    id = Column(Integer, primary_key=True)
    custom_block_version_id = Column(Integer, ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False, index=True)
    lifecycle = Column(String(24), nullable=False, default=LISTING_DRAFT, index=True)
    visibility = Column(String(24), nullable=False, default=VISIBILITY_PRIVATE, index=True)
    access_policy = Column(String(32), nullable=False, default=ACCESS_EXPLICIT_GRANT, index=True)
    commercial_mode = Column(String(32), nullable=False, default=COMMERCIAL_FREE)
    price_amount = Column(Numeric(12, 2), nullable=True)
    price_currency = Column(String(3), nullable=True)
    title = Column(String(160), nullable=True)
    description = Column(Text, nullable=True)
    category = Column(String(64), nullable=True, index=True)
    tags = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)
    published_at = Column(DateTime, nullable=True)
    archived_at = Column(DateTime, nullable=True)


class CustomBlockAccessGrant(Base):
    __tablename__ = "custom_block_access_grants"
    __table_args__ = (
        UniqueConstraint("custom_block_version_id", "recipient_user_id", name="uq_cb_access_grant_version_recipient"),
        Index("ix_cb_access_grant_recipient_status", "recipient_user_id", "status"),
    )

    id = Column(Integer, primary_key=True)
    custom_block_version_id = Column(Integer, ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False, index=True)
    recipient_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    granted_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    status = Column(String(24), nullable=False, default=GRANT_ACTIVE, index=True)
    grant_source = Column(String(32), nullable=False)
    note = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, nullable=False, default=utcnow)
    revoked_at = Column(DateTime, nullable=True)
    revoked_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)


class CustomBlockLibraryInstall(Base):
    """User's explicit library choice; never a grant or ownership record."""
    __tablename__ = "custom_block_library_installs"
    __table_args__ = (
        UniqueConstraint("user_id", "custom_block_version_id", name="uq_cb_library_install_user_version"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    custom_block_version_id = Column(Integer, ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class CustomBlockDistributionGrant(Base):
    """Exact-version distribution licence acquired by a user; not ownership or use."""
    __tablename__ = "custom_block_distribution_grants"
    __table_args__ = (UniqueConstraint("user_id", "custom_block_version_id", name="uq_cb_distribution_user_version"),)

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    custom_block_version_id = Column(Integer, ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False, index=True)
    granted_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    source = Column(String(32), nullable=False)  # free_public | author
    original_author_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    block_title = Column(String(160), nullable=False)
    version_number = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class CustomBlockMarketDependency(Base):
    """Immutable attribution for a published Market Scenario/Template."""
    __tablename__ = "custom_block_market_dependencies"
    __table_args__ = (UniqueConstraint("market_item_id", "custom_block_version_id", name="uq_cb_market_dependency_item_version"),)

    id = Column(Integer, primary_key=True)
    market_item_id = Column(Integer, ForeignKey("market_items.id", ondelete="CASCADE"), nullable=False, index=True)
    custom_block_version_id = Column(Integer, ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False)
    original_author_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    block_title = Column(String(160), nullable=False)
    version_number = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class CustomBlockAccessRequest(Base):
    __tablename__ = "custom_block_access_requests"
    __table_args__ = (
        Index("ix_cb_access_request_author_state", "author_user_id", "state"),
        Index("ix_cb_access_request_version_requester", "custom_block_version_id", "requester_user_id"),
    )

    id = Column(Integer, primary_key=True)
    custom_block_version_id = Column(Integer, ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False)
    requester_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    author_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    # Communication only: AccessRequest/AccessGrant remain the canonical access truth.
    chat_room_id = Column(Integer, ForeignKey("chat_rooms.id", ondelete="SET NULL"), nullable=True)
    state = Column(String(24), nullable=False, default=REQUEST_PENDING, index=True)
    message = Column(Text, nullable=False, default="")
    decision_note = Column(Text, nullable=False, default="")
    decided_at = Column(DateTime, nullable=True)
    decided_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class CustomBlockMarketplaceReview(Base):
    __tablename__ = "custom_block_marketplace_reviews"
    __table_args__ = (UniqueConstraint("custom_block_version_id", "author_user_id", name="uq_cb_marketplace_review_version_author"),)

    id = Column(Integer, primary_key=True)
    custom_block_version_id = Column(Integer, ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False, index=True)
    author_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    rating = Column(Integer, nullable=False)
    text = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)


class CustomBlockMarketplaceAuditEvent(Base):
    __tablename__ = "custom_block_marketplace_audit_events"
    __table_args__ = (Index("ix_cb_marketplace_audit_version_created", "custom_block_version_id", "created_at"),)

    id = Column(Integer, primary_key=True)
    custom_block_version_id = Column(Integer, ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False)
    listing_id = Column(Integer, ForeignKey("custom_block_marketplace_listings.id", ondelete="RESTRICT"), nullable=True)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True, index=True)
    event_type = Column(String(64), nullable=False)
    metadata_json = Column("metadata", JSON, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class MarketplaceDispute(Base):
    """Off-platform payment complaint with immutable offer facts at filing."""
    __tablename__ = "marketplace_disputes"

    id = Column(Integer, primary_key=True)
    buyer_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    seller_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    listing_id = Column(Integer, ForeignKey("custom_block_marketplace_listings.id", ondelete="RESTRICT"), nullable=False, index=True)
    custom_block_version_id = Column(Integer, ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False)
    price_amount = Column(Numeric(12, 2), nullable=False)
    price_currency = Column(String(3), nullable=False)
    listing_snapshot = Column(JSON, nullable=False)
    chat_room_id = Column(Integer, ForeignKey("chat_rooms.id", ondelete="SET NULL"), nullable=True)
    reason_code = Column(String(48), nullable=False)
    description = Column(Text, nullable=False)
    evidence_metadata = Column(JSON, nullable=False, default=list)
    status = Column(String(24), nullable=False, default="open", index=True)
    admin_decision = Column(Text, nullable=True)
    enforcement_action_id = Column(Integer, nullable=True)
    decided_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)
    decided_at = Column(DateTime, nullable=True)


class TrustSafetyEnforcement(Base):
    """Auditable cross-object administrative action and effective restriction."""
    __tablename__ = "trust_safety_enforcements"

    id = Column(Integer, primary_key=True)
    subject_type = Column(String(32), nullable=False, index=True)
    subject_id = Column(Integer, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    action = Column(String(48), nullable=False)
    reason = Column(Text, nullable=False)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    dispute_id = Column(Integer, ForeignKey("marketplace_disputes.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    expires_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    revoked_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)


class TrustSafetyAuditEvent(Base):
    __tablename__ = "trust_safety_audit_events"

    id = Column(Integer, primary_key=True)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    event_type = Column(String(64), nullable=False)
    subject_type = Column(String(32), nullable=False)
    subject_id = Column(Integer, nullable=False)
    metadata_json = Column("metadata", JSON, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class TrustSafetyReport(Base):
    __tablename__ = "trust_safety_reports"

    id = Column(Integer, primary_key=True)
    reporter_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    subject_type = Column(String(32), nullable=False, index=True)
    subject_id = Column(Integer, nullable=False)
    reason_code = Column(String(48), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(String(24), nullable=False, default="open", index=True)
    decided_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    decision = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    decided_at = Column(DateTime, nullable=True)
