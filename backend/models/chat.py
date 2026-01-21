"""
Chat models for user-to-user messaging
"""
from datetime import datetime, timezone
from enum import Enum
import random

from sqlalchemy import (
    Column, DateTime, Integer, String, BigInteger, Boolean, 
    Text, ForeignKey, Enum as SQLEnum, Index
)
from sqlalchemy.orm import relationship

from backend.database import Base


class FriendshipStatus(str, Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    BLOCKED = "blocked"


class UserOnlineStatus(str, Enum):
    ONLINE = "online"
    OFFLINE = "offline"
    AWAY = "away"
    DO_NOT_DISTURB = "do_not_disturb"


class MessageType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    FILE = "file"
    SYSTEM = "system"  # For system messages like "User joined"


class ChatRoomType(str, Enum):
    PRIVATE = "private"  # 1-on-1 chat
    GROUP = "group"  # Group chat


class Friendship(Base):
    """
    Friendship/contact relationship between users.
    user_id sends request to friend_id
    """
    __tablename__ = "friendships"
    __table_args__ = (
        Index('ix_friendships_user_friend', 'user_id', 'friend_id'),
        {"extend_existing": True}
    )
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    friend_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(SQLEnum(FriendshipStatus), default=FriendshipStatus.PENDING, nullable=False)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id], backref="sent_friend_requests")
    friend = relationship("User", foreign_keys=[friend_id], backref="received_friend_requests")


class UserStatus(Base):
    """
    User online/activity status
    """
    __tablename__ = "user_statuses"
    __table_args__ = {"extend_existing": True}
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    status = Column(SQLEnum(UserOnlineStatus), default=UserOnlineStatus.OFFLINE, nullable=False)
    custom_status = Column(String(100), nullable=True)  # Custom status text
    last_seen_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    user = relationship("User", backref="online_status")


class ChatRoom(Base):
    """
    Chat room - can be private (1-on-1) or group
    """
    __tablename__ = "chat_rooms"
    __table_args__ = {"extend_existing": True}
    
    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(BigInteger, unique=True, nullable=False, index=True, 
                       default=lambda: random.randint(100000000000, 999999999999))
    
    room_type = Column(SQLEnum(ChatRoomType), default=ChatRoomType.PRIVATE, nullable=False)
    name = Column(String(100), nullable=True)  # For group chats
    avatar = Column(String(500), nullable=True)  # Group avatar URL
    
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    
    is_archived = Column(Boolean, default=False)
    
    # Relationships
    created_by = relationship("User", backref="created_chat_rooms")
    participants = relationship("ChatParticipant", back_populates="room", cascade="all, delete-orphan")
    messages = relationship("ChatMessage", back_populates="room", cascade="all, delete-orphan")


class ChatParticipant(Base):
    """
    Participant in a chat room
    """
    __tablename__ = "chat_participants"
    __table_args__ = (
        Index('ix_chat_participants_room_user', 'room_id', 'user_id'),
        {"extend_existing": True}
    )
    
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    is_admin = Column(Boolean, default=False)  # For group chats
    is_muted = Column(Boolean, default=False)  # Mute notifications
    is_pinned = Column(Boolean, default=False)  # Pin chat to top
    
    joined_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_read_at = Column(DateTime, nullable=True)  # Last time user read messages
    
    # Relationships
    room = relationship("ChatRoom", back_populates="participants")
    user = relationship("User", backref="chat_participations")


class ChatMessage(Base):
    """
    Individual chat message
    """
    __tablename__ = "chat_messages"
    __table_args__ = (
        Index('ix_chat_messages_room_created', 'room_id', 'created_at'),
        {"extend_existing": True}
    )
    
    id = Column(Integer, primary_key=True, index=True)
    public_id = Column(BigInteger, unique=True, nullable=False, index=True,
                       default=lambda: random.randint(100000000000, 999999999999))
    
    room_id = Column(Integer, ForeignKey("chat_rooms.id", ondelete="CASCADE"), nullable=False)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    message_type = Column(SQLEnum(MessageType), default=MessageType.TEXT, nullable=False)
    content = Column(Text, nullable=True)  # Text content
    file_url = Column(String(500), nullable=True)  # For images/files
    file_name = Column(String(255), nullable=True)
    file_size = Column(Integer, nullable=True)  # Size in bytes
    
    # Reply to another message
    reply_to_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True)
    
    # Forwarded message
    forwarded_from_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="SET NULL"), nullable=True)
    
    is_edited = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False)  # Soft delete
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)
    edited_at = Column(DateTime, nullable=True)
    
    # Relationships
    room = relationship("ChatRoom", back_populates="messages")
    sender = relationship("User", backref="sent_messages", foreign_keys=[sender_id])
    reply_to = relationship("ChatMessage", remote_side=[id], foreign_keys=[reply_to_id], backref="replies")
    forwarded_from = relationship("ChatMessage", remote_side=[id], foreign_keys=[forwarded_from_id])
    reactions = relationship("MessageReaction", back_populates="message", cascade="all, delete-orphan")


class MessageReaction(Base):
    """
    Emoji reactions to messages
    """
    __tablename__ = "message_reactions"
    __table_args__ = (
        Index('ix_message_reactions_message_user', 'message_id', 'user_id'),
        {"extend_existing": True}
    )
    
    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    emoji = Column(String(10), nullable=False)  # Emoji character
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    message = relationship("ChatMessage", back_populates="reactions")
    user = relationship("User", backref="message_reactions")


class BlockedUser(Base):
    """
    Blocked users list
    """
    __tablename__ = "blocked_users"
    __table_args__ = (
        Index('ix_blocked_users_blocker_blocked', 'blocker_id', 'blocked_id'),
        {"extend_existing": True}
    )
    
    id = Column(Integer, primary_key=True, index=True)
    blocker_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    blocked_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    reason = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Relationships
    blocker = relationship("User", foreign_keys=[blocker_id], backref="blocked_by_me")
    blocked = relationship("User", foreign_keys=[blocked_id], backref="blocked_me")
