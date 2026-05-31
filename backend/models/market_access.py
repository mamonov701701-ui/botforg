"""
Marketplace manual access: requests and grants for paid items.
"""
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    Enum as SQLEnum,
)
from sqlalchemy.orm import relationship

from backend.database import Base


class MarketAccessRequestStatus(str, Enum):
    """Статус заявки на доступ к платному товару маркетплейса."""
    NEW = "new"
    IN_DISCUSSION = "in_discussion"
    ACCESS_GRANTED = "access_granted"
    REJECTED = "rejected"
    CLOSED = "closed"


class MarketAccessRequest(Base):
    """
    Заявка покупателя на доступ к платному market item.
    Переговоры ведутся во внутреннем чате BotForg; расчёты — вне платформы.
    """
    __tablename__ = "market_access_requests"
    __table_args__ = (
        Index("ix_market_access_requests_market_item_id", "market_item_id"),
        Index("ix_market_access_requests_requester_user_id", "requester_user_id"),
        Index("ix_market_access_requests_author_user_id", "author_user_id"),
        Index("ix_market_access_requests_status", "status"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    market_item_id = Column(
        Integer, ForeignKey("market_items.id", ondelete="CASCADE"), nullable=False
    )
    requester_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    author_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    chat_room_id = Column(
        Integer, ForeignKey("chat_rooms.id", ondelete="SET NULL"), nullable=True
    )
    status = Column(
        SQLEnum(MarketAccessRequestStatus),
        default=MarketAccessRequestStatus.NEW,
        nullable=False,
    )
    message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    updated_at = Column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    market_item = relationship("MarketItem", backref="access_requests")
    requester = relationship("User", foreign_keys=[requester_user_id], backref="market_access_requests_sent")
    author = relationship("User", foreign_keys=[author_user_id], backref="market_access_requests_received")
    chat_room = relationship("ChatRoom", backref="market_access_requests")
    access_grants = relationship(
        "MarketItemAccessGrant",
        back_populates="request",
        foreign_keys="MarketItemAccessGrant.request_id",
    )


class MarketItemAccessGrant(Base):
    """
    Ручная выдача доступа к платному market item конкретному пользователю.
    """
    __tablename__ = "market_item_access_grants"
    __table_args__ = (
        UniqueConstraint(
            "market_item_id",
            "user_id",
            name="uq_market_item_access_grants_item_user",
        ),
        Index("ix_market_item_access_grants_market_item_id", "market_item_id"),
        Index("ix_market_item_access_grants_user_id", "user_id"),
        Index("ix_market_item_access_grants_granted_by_user_id", "granted_by_user_id"),
        {"extend_existing": True},
    )

    id = Column(Integer, primary_key=True, index=True)
    market_item_id = Column(
        Integer, ForeignKey("market_items.id", ondelete="CASCADE"), nullable=False
    )
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    granted_by_user_id = Column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    request_id = Column(
        Integer, ForeignKey("market_access_requests.id", ondelete="SET NULL"), nullable=True
    )
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)

    market_item = relationship("MarketItem", backref="access_grants")
    user = relationship("User", foreign_keys=[user_id], backref="market_item_access_grants")
    granted_by = relationship(
        "User", foreign_keys=[granted_by_user_id], backref="market_item_access_grants_issued"
    )
    request = relationship(
        "MarketAccessRequest",
        back_populates="access_grants",
        foreign_keys=[request_id],
    )
