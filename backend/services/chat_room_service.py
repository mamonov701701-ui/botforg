"""
Helpers for private chat rooms and server-side system messages.
"""
from datetime import datetime, timezone
from typing import Tuple

from fastapi import HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from backend.models.chat import (
    BlockedUser,
    ChatMessage,
    ChatParticipant,
    ChatRoom,
    ChatRoomType,
    MessageType,
)


def _find_private_room(db: Session, user_a_id: int, user_b_id: int) -> ChatRoom | None:
    """Найти private room ровно между двумя пользователями."""
    if user_a_id == user_b_id:
        return None

    candidate_rooms = (
        db.query(ChatRoom)
        .join(ChatParticipant, ChatParticipant.room_id == ChatRoom.id)
        .filter(
            ChatRoom.room_type == ChatRoomType.PRIVATE,
            ChatParticipant.user_id.in_([user_a_id, user_b_id]),
        )
        .distinct()
        .all()
    )
    for room in candidate_rooms:
        participant_ids = {
            p.user_id
            for p in db.query(ChatParticipant).filter(ChatParticipant.room_id == room.id).all()
        }
        if participant_ids == {user_a_id, user_b_id}:
            return room
    return None


def get_or_create_private_room(
    db: Session,
    user_a_id: int,
    user_b_id: int,
    created_by_id: int,
) -> Tuple[ChatRoom, bool]:
    """
    Вернуть существующую private room между user_a и user_b или создать новую.
    Returns: (room, created) — created=True если комната только что создана.
    """
    if user_a_id == user_b_id:
        raise HTTPException(status_code=400, detail="Нельзя создать чат с самим собой")

    blocked = db.query(BlockedUser).filter(
        or_(
            and_(BlockedUser.blocker_id == user_a_id, BlockedUser.blocked_id == user_b_id),
            and_(BlockedUser.blocker_id == user_b_id, BlockedUser.blocked_id == user_a_id),
        )
    ).first()
    if blocked:
        raise HTTPException(status_code=400, detail="Невозможно создать чат")

    existing = _find_private_room(db, user_a_id, user_b_id)
    if existing:
        return existing, False

    room = ChatRoom(
        room_type=ChatRoomType.PRIVATE,
        created_by_id=created_by_id,
    )
    db.add(room)
    db.flush()

    for user_id in (user_a_id, user_b_id):
        db.add(
            ChatParticipant(
                room_id=room.id,
                user_id=user_id,
                is_admin=False,
            )
        )

    return room, True


def create_system_chat_message(db: Session, room_id: int, content: str) -> ChatMessage:
    """Server-side system message (sender_id=None)."""
    message = ChatMessage(
        room_id=room_id,
        sender_id=None,
        message_type=MessageType.SYSTEM,
        content=content,
    )
    db.add(message)

    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).first()
    if room:
        room.updated_at = datetime.now(timezone.utc)

    return message
