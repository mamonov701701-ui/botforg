/**
 * API клиент для чата и системы друзей
 */
import api from './client';

// ================== Types ==================

export interface UserBrief {
  id: number;
  public_id: number;
  name: string | null;
  email: string;
  avatar: string | null;
}

export interface UserSearchResult {
  id: number;
  public_id: number;
  name: string | null;
  avatar: string | null;
  is_friend: boolean;
  friendship_status: string | null;
}

export interface FriendRequest {
  id: number;
  user: UserBrief;
  created_at: string;
}

export interface Friend {
  id: number;
  public_id: number;
  name: string | null;
  avatar: string | null;
  online_status: string;
  last_seen_at: string | null;
}

export interface BlockedUser {
  id: number;
  public_id: number;
  name: string | null;
  avatar: string | null;
  blocked_at: string;
  reason: string | null;
}

export interface ChatRoom {
  id: number;
  public_id: number;
  room_type: 'private' | 'group';
  name: string | null;
  avatar: string | null;
  created_at: string;
  is_pinned: boolean;
  is_muted: boolean;
  last_message: {
    id: number;
    content: string;
    sender_name: string;
    created_at: string;
  } | null;
  unread_count: number;
  participants: UserBrief[];
}

export interface ChatMessage {
  id: number;
  public_id: number;
  sender: UserBrief | null;
  message_type: 'text' | 'image' | 'file' | 'system';
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  is_edited: boolean;
  is_deleted: boolean;
  created_at: string;
  edited_at: string | null;
  is_read: boolean; // Прочитано ли сообщение
  reply_to: {
    id: number;
    content: string;
    sender_name: string;
  } | null;
  reactions: {
    emoji: string;
    user_id: number;
    user_name: string | null;
  }[];
  is_mine: boolean;
}

// ================== User Search ==================

export async function searchUsers(query: string): Promise<{ items: UserSearchResult[] }> {
  return api.get(`/chat/users/search?query=${encodeURIComponent(query)}`);
}

// ================== Friends ==================

export async function sendFriendRequest(
  friendPublicId: number
): Promise<{ message: string; status: string }> {
  return api.post('/chat/friends/request', { friend_public_id: friendPublicId });
}

export async function getFriendRequests(): Promise<{
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}> {
  return api.get('/chat/friends/requests');
}

export async function acceptFriendRequest(friendshipId: number): Promise<{ message: string }> {
  return api.post(`/chat/friends/accept/${friendshipId}`);
}

export async function declineFriendRequest(friendshipId: number): Promise<{ message: string }> {
  return api.post(`/chat/friends/decline/${friendshipId}`);
}

export async function removeFriend(friendId: number): Promise<{ message: string }> {
  return api.delete(`/chat/friends/${friendId}`);
}

export async function getFriends(): Promise<{ items: Friend[] }> {
  return api.get('/chat/friends');
}

// ================== Block ==================

export async function blockUser(userId: number, reason?: string): Promise<{ message: string }> {
  return api.post(`/chat/block/${userId}`, { reason });
}

export async function unblockUser(userId: number): Promise<{ message: string }> {
  return api.delete(`/chat/block/${userId}`);
}

export async function getBlockedUsers(): Promise<{ items: BlockedUser[] }> {
  return api.get('/chat/blocked');
}

// ================== Chat Rooms ==================

export async function createChatRoom(
  participantIds: number[],
  name?: string
): Promise<{
  id: number;
  public_id: number;
  room_type: string;
  name: string | null;
  exists: boolean;
}> {
  return api.post('/chat/rooms', { participant_ids: participantIds, name });
}

export async function getChatRooms(): Promise<{ items: ChatRoom[] }> {
  return api.get('/chat/rooms');
}

export async function getChatRoom(
  roomId: number
): Promise<
  ChatRoom & { participants: (UserBrief & { is_admin: boolean; online_status: string })[] }
> {
  return api.get(`/chat/rooms/${roomId}`);
}

export async function togglePinChat(roomId: number): Promise<{ is_pinned: boolean }> {
  return api.post(`/chat/rooms/${roomId}/pin`);
}

export async function toggleMuteChat(roomId: number): Promise<{ is_muted: boolean }> {
  return api.post(`/chat/rooms/${roomId}/mute`);
}

export async function deleteChatRoom(roomId: number): Promise<{ message: string }> {
  return api.delete(`/chat/rooms/${roomId}`);
}

// ================== Messages ==================

export async function getMessages(
  roomId: number,
  limit?: number,
  beforeId?: number
): Promise<{ items: ChatMessage[] }> {
  let url = `/chat/rooms/${roomId}/messages?limit=${limit || 50}`;
  if (beforeId) {
    url += `&before_id=${beforeId}`;
  }
  return api.get(url);
}

export async function sendMessage(
  roomId: number,
  content: string,
  messageType: string = 'text',
  replyToId?: number
): Promise<ChatMessage> {
  return api.post(`/chat/rooms/${roomId}/messages`, {
    content,
    message_type: messageType,
    reply_to_id: replyToId,
  });
}

export async function editMessage(
  messageId: number,
  content: string
): Promise<{ message: string }> {
  return api.put(`/chat/messages/${messageId}`, { content });
}

export async function deleteMessage(messageId: number): Promise<{ message: string }> {
  return api.delete(`/chat/messages/${messageId}`);
}

export async function addReaction(
  messageId: number,
  emoji: string
): Promise<{ message: string; action: string }> {
  return api.post(`/chat/messages/${messageId}/reaction`, { emoji });
}

// ================== Status ==================

export async function updateStatus(
  status: string,
  customStatus?: string
): Promise<{ status: string; custom_status: string | null }> {
  return api.put('/chat/status', { status, custom_status: customStatus });
}

export async function getUnreadCount(): Promise<{ unread_count: number }> {
  return api.get('/chat/unread-count');
}
