"""
Chat Router for BotForg
Provides endpoints for messaging and friend management
"""

# Updated: 2026-01-21 - Chat functionality
import logging
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func, desc

from backend.dependencies.auth import get_current_user
from backend.database import get_db
from backend.models.user import User
from backend.models.chat import (
    Friendship, FriendshipStatus, UserStatus, UserOnlineStatus,
    ChatRoom, ChatRoomType, ChatParticipant, ChatMessage, MessageType,
    MessageReaction, BlockedUser
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat"])


# ================== Pydantic Schemas ==================

class UserBriefOut(BaseModel):
    id: int
    public_id: int
    name: Optional[str]
    email: str
    avatar: Optional[str]
    
    class Config:
        from_attributes = True


class FriendRequestCreate(BaseModel):
    friend_public_id: int = Field(..., description="Public ID пользователя для добавления")


class FriendOut(BaseModel):
    id: int
    user: UserBriefOut
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class UserSearchResult(BaseModel):
    id: int
    public_id: int
    name: Optional[str]
    avatar: Optional[str]
    is_friend: bool
    friendship_status: Optional[str]


class ChatRoomCreate(BaseModel):
    name: Optional[str] = None
    participant_ids: List[int] = Field(..., description="IDs участников (для группы или приватного чата)")


class ChatRoomOut(BaseModel):
    id: int
    public_id: int
    room_type: str
    name: Optional[str]
    avatar: Optional[str]
    created_at: datetime
    is_pinned: bool = False
    is_muted: bool = False
    last_message: Optional[dict] = None
    unread_count: int = 0
    participants: List[UserBriefOut] = []
    
    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    content: str = Field(..., max_length=10000)
    message_type: str = "text"
    reply_to_id: Optional[int] = None


class MessageEdit(BaseModel):
    content: str = Field(..., max_length=10000)


class MessageOut(BaseModel):
    id: int
    public_id: int
    sender: Optional[UserBriefOut]
    message_type: str
    content: Optional[str]
    file_url: Optional[str]
    file_name: Optional[str]
    is_edited: bool
    is_deleted: bool
    created_at: datetime
    edited_at: Optional[datetime]
    reply_to: Optional[dict] = None
    reactions: List[dict] = []
    
    class Config:
        from_attributes = True


class ReactionCreate(BaseModel):
    emoji: str = Field(..., max_length=10)


class StatusUpdate(BaseModel):
    status: str = Field(..., description="online, offline, away, do_not_disturb")
    custom_status: Optional[str] = Field(None, max_length=100)


# ================== Friend Endpoints ==================

@router.get("/users/search")
async def search_users(
    query: str = Query(..., min_length=1, description="Public ID или имя пользователя"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Поиск пользователей по public_id или имени
    """
    results = []
    
    # Попытка найти по public_id
    try:
        public_id = int(query)
        users = db.query(User).filter(
            User.public_id == public_id,
            User.id != current_user.id
        ).all()
    except ValueError:
        # Поиск по имени
        users = db.query(User).filter(
            User.name.ilike(f"%{query}%"),
            User.id != current_user.id
        ).limit(20).all()
    
    for user in users:
        # Проверяем статус дружбы
        friendship = db.query(Friendship).filter(
            or_(
                and_(Friendship.user_id == current_user.id, Friendship.friend_id == user.id),
                and_(Friendship.user_id == user.id, Friendship.friend_id == current_user.id)
            )
        ).first()
        
        # Проверяем блокировку
        is_blocked = db.query(BlockedUser).filter(
            or_(
                and_(BlockedUser.blocker_id == current_user.id, BlockedUser.blocked_id == user.id),
                and_(BlockedUser.blocker_id == user.id, BlockedUser.blocked_id == current_user.id)
            )
        ).first() is not None
        
        if is_blocked:
            continue
        
        results.append(UserSearchResult(
            id=user.id,
            public_id=user.public_id,
            name=user.name,
            avatar=user.avatar,
            is_friend=friendship.status == FriendshipStatus.ACCEPTED if friendship else False,
            friendship_status=friendship.status.value if friendship else None
        ))
    
    return {"items": results}


@router.post("/friends/request")
async def send_friend_request(
    data: FriendRequestCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Отправить запрос в друзья по public_id
    """
    # Найти пользователя
    friend = db.query(User).filter(User.public_id == data.friend_public_id).first()
    if not friend:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    if friend.id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя добавить себя в друзья")
    
    # Проверить блокировку
    blocked = db.query(BlockedUser).filter(
        or_(
            and_(BlockedUser.blocker_id == current_user.id, BlockedUser.blocked_id == friend.id),
            and_(BlockedUser.blocker_id == friend.id, BlockedUser.blocked_id == current_user.id)
        )
    ).first()
    
    if blocked:
        raise HTTPException(status_code=400, detail="Невозможно отправить запрос")
    
    # Проверить существующую дружбу
    existing = db.query(Friendship).filter(
        or_(
            and_(Friendship.user_id == current_user.id, Friendship.friend_id == friend.id),
            and_(Friendship.user_id == friend.id, Friendship.friend_id == current_user.id)
        )
    ).first()
    
    if existing:
        if existing.status == FriendshipStatus.ACCEPTED:
            raise HTTPException(status_code=400, detail="Вы уже друзья")
        elif existing.status == FriendshipStatus.PENDING:
            if existing.user_id == current_user.id:
                raise HTTPException(status_code=400, detail="Запрос уже отправлен")
            else:
                # Если нам отправили запрос, принимаем его
                existing.status = FriendshipStatus.ACCEPTED
                existing.updated_at = datetime.now(timezone.utc)
                db.commit()
                return {"message": "Запрос принят, вы теперь друзья", "status": "accepted"}
        elif existing.status == FriendshipStatus.DECLINED:
            # Можно отправить повторный запрос
            existing.status = FriendshipStatus.PENDING
            existing.user_id = current_user.id
            existing.friend_id = friend.id
            existing.updated_at = datetime.now(timezone.utc)
            db.commit()
            return {"message": "Запрос отправлен", "status": "pending"}
    
    # Создать новый запрос
    friendship = Friendship(
        user_id=current_user.id,
        friend_id=friend.id,
        status=FriendshipStatus.PENDING
    )
    db.add(friendship)
    db.commit()
    
    return {"message": "Запрос в друзья отправлен", "status": "pending"}


@router.get("/friends/requests")
async def get_friend_requests(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Получить входящие и исходящие запросы в друзья
    """
    # Входящие
    incoming = db.query(Friendship).filter(
        Friendship.friend_id == current_user.id,
        Friendship.status == FriendshipStatus.PENDING
    ).all()
    
    # Исходящие
    outgoing = db.query(Friendship).filter(
        Friendship.user_id == current_user.id,
        Friendship.status == FriendshipStatus.PENDING
    ).all()
    
    incoming_list = []
    for f in incoming:
        user = db.query(User).filter(User.id == f.user_id).first()
        incoming_list.append({
            "id": f.id,
            "user": UserBriefOut.model_validate(user),
            "created_at": f.created_at
        })
    
    outgoing_list = []
    for f in outgoing:
        user = db.query(User).filter(User.id == f.friend_id).first()
        outgoing_list.append({
            "id": f.id,
            "user": UserBriefOut.model_validate(user),
            "created_at": f.created_at
        })
    
    return {
        "incoming": incoming_list,
        "outgoing": outgoing_list
    }


@router.post("/friends/accept/{friendship_id}")
async def accept_friend_request(
    friendship_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Принять запрос в друзья
    """
    friendship = db.query(Friendship).filter(
        Friendship.id == friendship_id,
        Friendship.friend_id == current_user.id,
        Friendship.status == FriendshipStatus.PENDING
    ).first()
    
    if not friendship:
        raise HTTPException(status_code=404, detail="Запрос не найден")
    
    friendship.status = FriendshipStatus.ACCEPTED
    friendship.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"message": "Запрос принят"}


@router.post("/friends/decline/{friendship_id}")
async def decline_friend_request(
    friendship_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Отклонить запрос в друзья
    """
    friendship = db.query(Friendship).filter(
        Friendship.id == friendship_id,
        Friendship.friend_id == current_user.id,
        Friendship.status == FriendshipStatus.PENDING
    ).first()
    
    if not friendship:
        raise HTTPException(status_code=404, detail="Запрос не найден")
    
    friendship.status = FriendshipStatus.DECLINED
    friendship.updated_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"message": "Запрос отклонён"}


@router.delete("/friends/{friend_id}")
async def remove_friend(
    friend_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Удалить из друзей
    """
    friendship = db.query(Friendship).filter(
        or_(
            and_(Friendship.user_id == current_user.id, Friendship.friend_id == friend_id),
            and_(Friendship.user_id == friend_id, Friendship.friend_id == current_user.id)
        ),
        Friendship.status == FriendshipStatus.ACCEPTED
    ).first()
    
    if not friendship:
        raise HTTPException(status_code=404, detail="Дружба не найдена")
    
    db.delete(friendship)
    db.commit()
    
    return {"message": "Пользователь удалён из друзей"}


@router.get("/friends")
async def get_friends(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Получить список друзей
    """
    friendships = db.query(Friendship).filter(
        or_(
            Friendship.user_id == current_user.id,
            Friendship.friend_id == current_user.id
        ),
        Friendship.status == FriendshipStatus.ACCEPTED
    ).all()
    
    friends = []
    for f in friendships:
        friend_id = f.friend_id if f.user_id == current_user.id else f.user_id
        friend = db.query(User).filter(User.id == friend_id).first()
        if friend:
            # Get online status
            status = db.query(UserStatus).filter(UserStatus.user_id == friend.id).first()
            friends.append({
                "id": friend.id,
                "public_id": friend.public_id,
                "name": friend.name,
                "avatar": friend.avatar,
                "online_status": status.status.value if status else "offline",
                "last_seen_at": status.last_seen_at if status else None
            })
    
    return {"items": friends}


# ================== Block Endpoints ==================

@router.post("/block/{user_id}")
async def block_user(
    user_id: int,
    reason: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Заблокировать пользователя
    """
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя заблокировать себя")
    
    existing = db.query(BlockedUser).filter(
        BlockedUser.blocker_id == current_user.id,
        BlockedUser.blocked_id == user_id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Пользователь уже заблокирован")
    
    # Удаляем дружбу если есть
    friendship = db.query(Friendship).filter(
        or_(
            and_(Friendship.user_id == current_user.id, Friendship.friend_id == user_id),
            and_(Friendship.user_id == user_id, Friendship.friend_id == current_user.id)
        )
    ).first()
    if friendship:
        db.delete(friendship)
    
    block = BlockedUser(
        blocker_id=current_user.id,
        blocked_id=user_id,
        reason=reason
    )
    db.add(block)
    db.commit()
    
    return {"message": "Пользователь заблокирован"}


@router.delete("/block/{user_id}")
async def unblock_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Разблокировать пользователя
    """
    block = db.query(BlockedUser).filter(
        BlockedUser.blocker_id == current_user.id,
        BlockedUser.blocked_id == user_id
    ).first()
    
    if not block:
        raise HTTPException(status_code=404, detail="Пользователь не заблокирован")
    
    db.delete(block)
    db.commit()
    
    return {"message": "Пользователь разблокирован"}


@router.get("/blocked")
async def get_blocked_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Получить список заблокированных пользователей
    """
    blocks = db.query(BlockedUser).filter(
        BlockedUser.blocker_id == current_user.id
    ).all()
    
    result = []
    for b in blocks:
        user = db.query(User).filter(User.id == b.blocked_id).first()
        if user:
            result.append({
                "id": user.id,
                "public_id": user.public_id,
                "name": user.name,
                "avatar": user.avatar,
                "blocked_at": b.created_at,
                "reason": b.reason
            })
    
    return {"items": result}


# ================== Chat Room Endpoints ==================

@router.post("/rooms")
async def create_chat_room(
    data: ChatRoomCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Создать чат (приватный или групповой)
    """
    if len(data.participant_ids) == 0:
        raise HTTPException(status_code=400, detail="Нужен хотя бы один участник")
    
    # Для приватного чата проверяем существующий
    if len(data.participant_ids) == 1:
        other_user_id = data.participant_ids[0]
        
        # Проверяем блокировку
        blocked = db.query(BlockedUser).filter(
            or_(
                and_(BlockedUser.blocker_id == current_user.id, BlockedUser.blocked_id == other_user_id),
                and_(BlockedUser.blocker_id == other_user_id, BlockedUser.blocked_id == current_user.id)
            )
        ).first()
        
        if blocked:
            raise HTTPException(status_code=400, detail="Невозможно создать чат")
        
        # Ищем существующий приватный чат
        existing_room = db.query(ChatRoom).join(ChatParticipant).filter(
            ChatRoom.room_type == ChatRoomType.PRIVATE,
            ChatParticipant.user_id.in_([current_user.id, other_user_id])
        ).group_by(ChatRoom.id).having(
            func.count(ChatParticipant.id) == 2
        ).first()
        
        # Более точная проверка
        if existing_room:
            participants = db.query(ChatParticipant).filter(
                ChatParticipant.room_id == existing_room.id
            ).all()
            participant_ids = {p.user_id for p in participants}
            if participant_ids == {current_user.id, other_user_id}:
                return {
                    "id": existing_room.id,
                    "public_id": existing_room.public_id,
                    "room_type": existing_room.room_type.value,
                    "exists": True
                }
        
        room_type = ChatRoomType.PRIVATE
        room_name = None
    else:
        room_type = ChatRoomType.GROUP
        room_name = data.name or "Групповой чат"
    
    # Создаём комнату
    room = ChatRoom(
        room_type=room_type,
        name=room_name,
        created_by_id=current_user.id
    )
    db.add(room)
    db.flush()
    
    # Добавляем участников
    participant = ChatParticipant(
        room_id=room.id,
        user_id=current_user.id,
        is_admin=True if room_type == ChatRoomType.GROUP else False
    )
    db.add(participant)
    
    for user_id in data.participant_ids:
        if user_id != current_user.id:
            user = db.query(User).filter(User.id == user_id).first()
            if user:
                p = ChatParticipant(
                    room_id=room.id,
                    user_id=user_id,
                    is_admin=False
                )
                db.add(p)
    
    db.commit()
    db.refresh(room)
    
    return {
        "id": room.id,
        "public_id": room.public_id,
        "room_type": room.room_type.value,
        "name": room.name,
        "exists": False
    }


@router.get("/rooms")
async def get_chat_rooms(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Получить список чатов пользователя
    """
    # Получаем комнаты где пользователь участник
    participations = db.query(ChatParticipant).filter(
        ChatParticipant.user_id == current_user.id
    ).all()
    
    rooms = []
    for p in participations:
        room = db.query(ChatRoom).filter(ChatRoom.id == p.room_id).first()
        if not room or room.is_archived:
            continue
        
        # Получаем последнее сообщение
        last_message = db.query(ChatMessage).filter(
            ChatMessage.room_id == room.id,
            ChatMessage.is_deleted == False
        ).order_by(ChatMessage.created_at.desc()).first()
        
        # Считаем непрочитанные
        unread_count = 0
        if p.last_read_at:
            unread_count = db.query(func.count(ChatMessage.id)).filter(
                ChatMessage.room_id == room.id,
                ChatMessage.created_at > p.last_read_at,
                ChatMessage.sender_id != current_user.id,
                ChatMessage.is_deleted == False
            ).scalar() or 0
        else:
            unread_count = db.query(func.count(ChatMessage.id)).filter(
                ChatMessage.room_id == room.id,
                ChatMessage.sender_id != current_user.id,
                ChatMessage.is_deleted == False
            ).scalar() or 0
        
        # Получаем участников
        all_participants = db.query(ChatParticipant).filter(
            ChatParticipant.room_id == room.id
        ).all()
        
        participants_list = []
        for ap in all_participants:
            user = db.query(User).filter(User.id == ap.user_id).first()
            if user:
                participants_list.append(UserBriefOut.model_validate(user))
        
        # Для приватного чата получаем имя собеседника
        room_name = room.name
        room_avatar = room.avatar
        if room.room_type == ChatRoomType.PRIVATE:
            for ap in all_participants:
                if ap.user_id != current_user.id:
                    other_user = db.query(User).filter(User.id == ap.user_id).first()
                    if other_user:
                        room_name = other_user.name or other_user.email
                        room_avatar = other_user.avatar
                    break
        
        last_msg_data = None
        if last_message:
            sender = db.query(User).filter(User.id == last_message.sender_id).first() if last_message.sender_id else None
            last_msg_data = {
                "id": last_message.id,
                "content": last_message.content if not last_message.is_deleted else "Сообщение удалено",
                "sender_name": sender.name if sender else "Неизвестный",
                "created_at": last_message.created_at.isoformat()
            }
        
        rooms.append({
            "id": room.id,
            "public_id": room.public_id,
            "room_type": room.room_type.value,
            "name": room_name,
            "avatar": room_avatar,
            "created_at": room.created_at.isoformat(),
            "is_pinned": p.is_pinned,
            "is_muted": p.is_muted,
            "last_message": last_msg_data,
            "unread_count": unread_count,
            "participants": [p.model_dump() for p in participants_list]
        })
    
    # Сортируем: закреплённые сначала, потом по последнему сообщению
    rooms.sort(key=lambda x: (not x['is_pinned'], -(datetime.fromisoformat(x['last_message']['created_at']).timestamp() if x['last_message'] else 0)))
    
    return {"items": rooms}


@router.get("/rooms/{room_id}")
async def get_chat_room(
    room_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Получить информацию о чате
    """
    # Проверяем доступ
    participation = db.query(ChatParticipant).filter(
        ChatParticipant.room_id == room_id,
        ChatParticipant.user_id == current_user.id
    ).first()
    
    if not participation:
        raise HTTPException(status_code=403, detail="Нет доступа к чату")
    
    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Чат не найден")
    
    # Получаем участников
    participants = db.query(ChatParticipant).filter(
        ChatParticipant.room_id == room.id
    ).all()
    
    participants_list = []
    for p in participants:
        user = db.query(User).filter(User.id == p.user_id).first()
        if user:
            status = db.query(UserStatus).filter(UserStatus.user_id == user.id).first()
            participants_list.append({
                **UserBriefOut.model_validate(user).model_dump(),
                "is_admin": p.is_admin,
                "online_status": status.status.value if status else "offline"
            })
    
    # Название для приватного чата
    room_name = room.name
    room_avatar = room.avatar
    if room.room_type == ChatRoomType.PRIVATE:
        for p in participants:
            if p.user_id != current_user.id:
                other_user = db.query(User).filter(User.id == p.user_id).first()
                if other_user:
                    room_name = other_user.name or other_user.email
                    room_avatar = other_user.avatar
                break
    
    return {
        "id": room.id,
        "public_id": room.public_id,
        "room_type": room.room_type.value,
        "name": room_name,
        "avatar": room_avatar,
        "created_at": room.created_at.isoformat(),
        "is_pinned": participation.is_pinned,
        "is_muted": participation.is_muted,
        "participants": participants_list
    }


@router.post("/rooms/{room_id}/pin")
async def toggle_pin_chat(
    room_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Закрепить/открепить чат
    """
    participation = db.query(ChatParticipant).filter(
        ChatParticipant.room_id == room_id,
        ChatParticipant.user_id == current_user.id
    ).first()
    
    if not participation:
        raise HTTPException(status_code=403, detail="Нет доступа к чату")
    
    participation.is_pinned = not participation.is_pinned
    db.commit()
    
    return {"is_pinned": participation.is_pinned}


@router.post("/rooms/{room_id}/mute")
async def toggle_mute_chat(
    room_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Выключить/включить уведомления чата
    """
    participation = db.query(ChatParticipant).filter(
        ChatParticipant.room_id == room_id,
        ChatParticipant.user_id == current_user.id
    ).first()
    
    if not participation:
        raise HTTPException(status_code=403, detail="Нет доступа к чату")
    
    participation.is_muted = not participation.is_muted
    db.commit()
    
    return {"is_muted": participation.is_muted}


# ================== Message Endpoints ==================

@router.get("/rooms/{room_id}/messages")
async def get_messages(
    room_id: int,
    limit: int = Query(50, ge=1, le=100),
    before_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Получить сообщения чата с пагинацией
    """
    # Проверяем доступ
    participation = db.query(ChatParticipant).filter(
        ChatParticipant.room_id == room_id,
        ChatParticipant.user_id == current_user.id
    ).first()
    
    if not participation:
        raise HTTPException(status_code=403, detail="Нет доступа к чату")
    
    # Обновляем время последнего прочтения
    participation.last_read_at = datetime.now(timezone.utc)
    db.commit()
    
    # Получаем информацию о других участниках для статуса прочтения
    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).first()
    other_participants = db.query(ChatParticipant).filter(
        ChatParticipant.room_id == room_id,
        ChatParticipant.user_id != current_user.id
    ).all()
    
    query = db.query(ChatMessage).filter(
        ChatMessage.room_id == room_id
    )
    
    if before_id:
        query = query.filter(ChatMessage.id < before_id)
    
    messages = query.order_by(ChatMessage.created_at.desc()).limit(limit).all()
    messages.reverse()  # Oldest first
    
    result = []
    for msg in messages:
        sender = db.query(User).filter(User.id == msg.sender_id).first() if msg.sender_id else None
        
        # Получаем реакции
        reactions = db.query(MessageReaction).filter(
            MessageReaction.message_id == msg.id
        ).all()
        
        reactions_data = []
        for r in reactions:
            user = db.query(User).filter(User.id == r.user_id).first()
            reactions_data.append({
                "emoji": r.emoji,
                "user_id": r.user_id,
                "user_name": user.name if user else None
            })
        
        # Получаем ответ если есть
        reply_data = None
        if msg.reply_to_id:
            reply_msg = db.query(ChatMessage).filter(ChatMessage.id == msg.reply_to_id).first()
            if reply_msg:
                reply_sender = db.query(User).filter(User.id == reply_msg.sender_id).first() if reply_msg.sender_id else None
                reply_data = {
                    "id": reply_msg.id,
                    "content": reply_msg.content if not reply_msg.is_deleted else "Сообщение удалено",
                    "sender_name": reply_sender.name if reply_sender else "Неизвестный"
                }
        
        # Определяем статус прочтения (только для своих сообщений)
        is_read = False
        if msg.sender_id == current_user.id:
            # Для приватных чатов - проверяем last_read_at собеседника
            if room and room.room_type == ChatRoomType.PRIVATE and other_participants:
                other_participant = other_participants[0]
                if other_participant.last_read_at and msg.created_at <= other_participant.last_read_at:
                    is_read = True
            # Для групповых чатов - проверяем, прочитали ли ВСЕ участники
            elif room and room.room_type == ChatRoomType.GROUP:
                all_read = True
                for p in other_participants:
                    if not p.last_read_at or msg.created_at > p.last_read_at:
                        all_read = False
                        break
                is_read = all_read and len(other_participants) > 0
        
        result.append({
            "id": msg.id,
            "public_id": msg.public_id,
            "sender": UserBriefOut.model_validate(sender).model_dump() if sender else None,
            "message_type": msg.message_type.value,
            "content": msg.content if not msg.is_deleted else "Сообщение удалено",
            "file_url": msg.file_url if not msg.is_deleted else None,
            "file_name": msg.file_name if not msg.is_deleted else None,
            "is_edited": msg.is_edited,
            "is_deleted": msg.is_deleted,
            "created_at": msg.created_at.isoformat(),
            "edited_at": msg.edited_at.isoformat() if msg.edited_at else None,
            "reply_to": reply_data,
            "reactions": reactions_data,
            "is_mine": msg.sender_id == current_user.id,
            "is_read": is_read  # ✓✓ если прочитано
        })
    
    return {"items": result}


@router.post("/rooms/{room_id}/messages")
async def send_message(
    room_id: int,
    data: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Отправить сообщение в чат
    """
    # Проверяем доступ
    participation = db.query(ChatParticipant).filter(
        ChatParticipant.room_id == room_id,
        ChatParticipant.user_id == current_user.id
    ).first()
    
    if not participation:
        raise HTTPException(status_code=403, detail="Нет доступа к чату")
    
    # Создаём сообщение
    message = ChatMessage(
        room_id=room_id,
        sender_id=current_user.id,
        message_type=MessageType(data.message_type),
        content=data.content,
        reply_to_id=data.reply_to_id
    )
    db.add(message)
    
    # Обновляем время последнего прочтения
    participation.last_read_at = datetime.now(timezone.utc)
    
    # Обновляем время комнаты
    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).first()
    if room:
        room.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    db.refresh(message)
    
    sender = db.query(User).filter(User.id == current_user.id).first()
    
    # Отправляем email уведомления участникам (кроме отправителя)
    try:
        from backend.auth.email import send_chat_message_notification
        
        # Получаем всех участников чата кроме отправителя
        participants = db.query(ChatParticipant).filter(
            ChatParticipant.room_id == room_id,
            ChatParticipant.user_id != current_user.id
        ).all()
        
        # Обрезаем сообщение для preview
        message_preview = data.content[:100] + "..." if len(data.content) > 100 else data.content
        sender_name = current_user.name or current_user.email
        
        for p in participants:
            recipient = db.query(User).filter(User.id == p.user_id).first()
            if recipient and recipient.email:
                # Отправляем email уведомление
                send_chat_message_notification(
                    recipient_email=recipient.email,
                    sender_name=sender_name,
                    message_preview=message_preview,
                    room_id=room_id
                )
    except Exception as e:
        # Не прерываем отправку сообщения если email не отправился
        logger.warning(f"Failed to send email notification: {e}")
    
    return {
        "id": message.id,
        "public_id": message.public_id,
        "sender": UserBriefOut.model_validate(sender).model_dump() if sender else None,
        "message_type": message.message_type.value,
        "content": message.content,
        "created_at": message.created_at.isoformat(),
        "is_mine": True
    }


@router.put("/messages/{message_id}")
async def edit_message(
    message_id: int,
    data: MessageEdit,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Редактировать сообщение
    """
    message = db.query(ChatMessage).filter(
        ChatMessage.id == message_id,
        ChatMessage.sender_id == current_user.id,
        ChatMessage.is_deleted == False
    ).first()
    
    if not message:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    
    message.content = data.content
    message.is_edited = True
    message.edited_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"message": "Сообщение отредактировано"}


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Удалить сообщение (soft delete)
    """
    message = db.query(ChatMessage).filter(
        ChatMessage.id == message_id,
        ChatMessage.sender_id == current_user.id
    ).first()
    
    if not message:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    
    message.is_deleted = True
    message.content = None
    message.file_url = None
    db.commit()
    
    return {"message": "Сообщение удалено"}


@router.post("/messages/{message_id}/reaction")
async def add_reaction(
    message_id: int,
    data: ReactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Добавить реакцию на сообщение
    """
    message = db.query(ChatMessage).filter(ChatMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    
    # Проверяем доступ к чату
    participation = db.query(ChatParticipant).filter(
        ChatParticipant.room_id == message.room_id,
        ChatParticipant.user_id == current_user.id
    ).first()
    
    if not participation:
        raise HTTPException(status_code=403, detail="Нет доступа к чату")
    
    # Проверяем существующую реакцию
    existing = db.query(MessageReaction).filter(
        MessageReaction.message_id == message_id,
        MessageReaction.user_id == current_user.id,
        MessageReaction.emoji == data.emoji
    ).first()
    
    if existing:
        # Удаляем если уже есть
        db.delete(existing)
        db.commit()
        return {"message": "Реакция удалена", "action": "removed"}
    
    reaction = MessageReaction(
        message_id=message_id,
        user_id=current_user.id,
        emoji=data.emoji
    )
    db.add(reaction)
    db.commit()
    
    return {"message": "Реакция добавлена", "action": "added"}


# ================== Status Endpoints ==================

@router.put("/status")
async def update_status(
    data: StatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Обновить статус пользователя
    """
    status = db.query(UserStatus).filter(UserStatus.user_id == current_user.id).first()
    
    if not status:
        status = UserStatus(user_id=current_user.id)
        db.add(status)
    
    status.status = UserOnlineStatus(data.status)
    status.custom_status = data.custom_status
    status.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    
    return {"status": status.status.value, "custom_status": status.custom_status}


@router.get("/unread-count")
async def get_unread_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Получить общее количество непрочитанных сообщений
    """
    participations = db.query(ChatParticipant).filter(
        ChatParticipant.user_id == current_user.id
    ).all()
    
    total_unread = 0
    for p in participations:
        if p.last_read_at:
            count = db.query(func.count(ChatMessage.id)).filter(
                ChatMessage.room_id == p.room_id,
                ChatMessage.created_at > p.last_read_at,
                ChatMessage.sender_id != current_user.id,
                ChatMessage.is_deleted == False
            ).scalar() or 0
        else:
            count = db.query(func.count(ChatMessage.id)).filter(
                ChatMessage.room_id == p.room_id,
                ChatMessage.sender_id != current_user.id,
                ChatMessage.is_deleted == False
            ).scalar() or 0
        total_unread += count
    
    return {"unread_count": total_unread}


@router.delete("/rooms/{room_id}")
async def delete_chat_room(
    room_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Удалить чат (только создатель или админ группы)
    """
    # Проверяем доступ
    participation = db.query(ChatParticipant).filter(
        ChatParticipant.room_id == room_id,
        ChatParticipant.user_id == current_user.id
    ).first()
    
    if not participation:
        raise HTTPException(status_code=403, detail="Нет доступа к чату")
    
    room = db.query(ChatRoom).filter(ChatRoom.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Чат не найден")
    
    # Для приватных чатов - может удалить любой участник (удаляется только для него)
    # Для групповых - только админ может удалить весь чат
    if room.room_type == ChatRoomType.PRIVATE:
        # Удаляем только участие текущего пользователя
        db.delete(participation)
        db.commit()
        return {"message": "Вы покинули чат"}
    else:
        # Для группового чата - только админ
        if not participation.is_admin:
            raise HTTPException(status_code=403, detail="Только админ может удалить группу")
        
        # Удаляем весь чат со всеми сообщениями
        db.delete(room)
        db.commit()
        return {"message": "Чат удален"}
