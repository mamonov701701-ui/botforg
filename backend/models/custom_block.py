from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from backend.database import Base


CUSTOM_BLOCK_DRAFT = "draft"
CUSTOM_BLOCK_PUBLISHED = "published"
CUSTOM_BLOCK_ARCHIVED = "archived"


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
    validation_result = Column(JSON, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)
    published_at = Column(DateTime, nullable=True)
    archived_at = Column(DateTime, nullable=True)

    block = relationship("CustomBlock", back_populates="versions", foreign_keys=[custom_block_id])
    parent_version = relationship("CustomBlockVersion", remote_side=[id], foreign_keys=[parent_version_id])
