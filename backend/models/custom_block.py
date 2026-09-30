from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from backend.database import Base


CUSTOM_BLOCK_DRAFT = "draft"
CUSTOM_BLOCK_PUBLISHED = "published"
CUSTOM_BLOCK_ARCHIVED = "archived"
CUSTOM_BLOCK_REVIEW_DRAFT = "draft"
CUSTOM_BLOCK_REVIEW_ADMIN_PENDING = "admin_review_pending"
CUSTOM_BLOCK_REVIEW_APPROVED = "approved"
CUSTOM_BLOCK_REVIEW_NEEDS_CHANGES = "needs_changes"
CUSTOM_BLOCK_REVIEW_REJECTED = "rejected"
CUSTOM_BLOCK_REVIEW_SECURITY_FAILED = "security_review_failed"


def utcnow():
    return datetime.now(timezone.utc)


class CustomBlock(Base):
    """Stable identity owned by one user; mutable behavior lives in versions."""

    __tablename__ = "custom_blocks"

    id = Column(Integer, primary_key=True)
    stable_key = Column(String(96), nullable=False, unique=True, index=True)
    owner_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    versions = relationship(
        "CustomBlockVersion",
        back_populates="block",
        cascade="all, delete-orphan",
        foreign_keys="CustomBlockVersion.custom_block_id",
    )


class CustomBlockVersion(Base):
    """Immutable after publication. Passport and guide are version snapshots."""

    __tablename__ = "custom_block_versions"
    __table_args__ = (
        UniqueConstraint("custom_block_id", "version", name="uq_custom_block_version_number"),
    )

    id = Column(Integer, primary_key=True)
    custom_block_id = Column(
        Integer, ForeignKey("custom_blocks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    parent_version_id = Column(
        Integer, ForeignKey("custom_block_versions.id", ondelete="SET NULL"), nullable=True
    )
    version = Column(Integer, nullable=False)
    status = Column(String(24), nullable=False, default=CUSTOM_BLOCK_DRAFT, index=True)
    title = Column(String(160), nullable=False)
    description = Column(Text, nullable=False, default="")
    category = Column(String(64), nullable=False, default="custom")
    passport = Column(JSON, nullable=False)
    user_guide = Column(JSON, nullable=False)
    runtime_kind = Column(String(48), nullable=False, default="message")
    runtime_definition = Column(JSON, nullable=False)
    # A schema-bound execution artifact for javascript versions.  Legacy
    # message-like blocks intentionally retain a null specification.
    execution_spec = Column(JSON, nullable=True)
    execution_artifact_hash = Column(String(64), nullable=True, index=True)
    execution_state = Column(String(32), nullable=False, default="enabled", index=True)
    # Review is version-scoped. It deliberately does not replace the public
    # draft/published/archive lifecycle used by scenarios and runtime.
    review_state = Column(String(32), nullable=False, default=CUSTOM_BLOCK_REVIEW_DRAFT, index=True)
    validation_result = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)
    published_at = Column(DateTime, nullable=True)
    archived_at = Column(DateTime, nullable=True)

    block = relationship("CustomBlock", back_populates="versions", foreign_keys=[custom_block_id])
    parent_version = relationship("CustomBlockVersion", remote_side=[id], foreign_keys=[parent_version_id])


class CustomBlockSecurityReport(Base):
    """Append-only advisory report tied to one exact version artifact."""

    __tablename__ = "custom_block_security_reports"

    id = Column(Integer, primary_key=True)
    custom_block_version_id = Column(Integer, ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False, index=True)
    artifact_hash = Column(String(64), nullable=True)
    report_kind = Column(String(32), nullable=False, default="ai_security")
    status = Column(String(24), nullable=False, default="succeeded")
    provider_code = Column(String(64), nullable=True)
    error_code = Column(String(64), nullable=True)
    findings = Column(JSON, nullable=False, default=list)
    summary = Column(String(512), nullable=False, default="")
    created_at = Column(DateTime, nullable=False, default=utcnow)


class CustomBlockReviewDecision(Base):
    """Append-only manual decision. No update/delete route is exposed."""

    __tablename__ = "custom_block_review_decisions"

    id = Column(Integer, primary_key=True)
    custom_block_version_id = Column(Integer, ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False, index=True)
    artifact_hash = Column(String(64), nullable=True)
    decision = Column(String(32), nullable=False)
    comment = Column(Text, nullable=False, default="")
    reviewer_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class CustomBlockReviewEvent(Base):
    """Append-only lifecycle history for a version-level review."""

    __tablename__ = "custom_block_review_events"

    id = Column(Integer, primary_key=True)
    custom_block_version_id = Column(Integer, ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False, index=True)
    event_type = Column(String(64), nullable=False)
    previous_state = Column(String(32), nullable=True)
    resulting_state = Column(String(32), nullable=True)
    actor_type = Column(String(32), nullable=False)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True, index=True)
    artifact_hash = Column(String(64), nullable=True)
    metadata_json = Column("metadata", JSON, nullable=False, default=dict)
    created_at = Column(DateTime, nullable=False, default=utcnow)


class CustomBlockExecutionAudit(Base):
    """Metadata-only audit trail. Payloads and source code are never stored here."""

    __tablename__ = "custom_block_execution_audits"

    id = Column(Integer, primary_key=True)
    execution_id = Column(String(64), nullable=False, unique=True, index=True)
    custom_block_version_id = Column(
        Integer, ForeignKey("custom_block_versions.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    artifact_hash = Column(String(64), nullable=False)
    execution_mode = Column(String(16), nullable=False)
    runner_profile = Column(String(64), nullable=False)
    status = Column(String(24), nullable=False)
    error_category = Column(String(32), nullable=True)
    input_size_bytes = Column(Integer, nullable=False, default=0)
    output_size_bytes = Column(Integer, nullable=False, default=0)
    duration_ms = Column(Integer, nullable=True)
    started_at = Column(DateTime, nullable=False, default=utcnow)
    finished_at = Column(DateTime, nullable=True)
