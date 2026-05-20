/**
 * Messages Page - Chat and Friends Management
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from '../../../utils/toast';
import {
  MessageCircle,
  Users,
  User,
  Search,
  Send,
  UserPlus,
  UserCheck,
  Check,
  CheckCheck,
  X,
  MoreVertical,
  Pin,
  BellOff,
  Bell,
  Trash2,
  Edit3,
  Reply,
  Smile,
  Settings,
  UserX,
  Clock,
  ChevronLeft,
  Hash,
  Circle,
  Copy,
} from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import {
  searchUsers,
  sendFriendRequest,
  getFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  getFriends,
  getChatRooms,
  getChatRoom,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  addReaction,
  togglePinChat,
  toggleMuteChat,
  deleteChatRoom,
  createChatRoom,
  blockUser,
  getBlockedUsers,
  unblockUser,
  type UserSearchResult,
  type FriendRequest,
  type Friend,
  type ChatRoom,
  type ChatMessage,
  type BlockedUser,
  type UserBrief,
} from '../../../api/chat';

type TabType = 'chats' | 'friends' | 'requests' | 'blocked';

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥'];

export default function MessagesPage() {
  const { user } = useAuthStore();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('chats');

  // Chat list state
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Message input state
  const [messageText, setMessageText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);

  // Friends state
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<{
    incoming: FriendRequest[];
    outgoing: FriendRequest[];
  }>({ incoming: [], outgoing: [] });
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [selectedUserProfile, setSelectedUserProfile] = useState<UserSearchResult | null>(null);

  // UI state
  const [showEmojiPicker, setShowEmojiPicker] = useState<number | null>(null);
  const [showMessageMenu, setShowMessageMenu] = useState<number | null>(null);
  const [showChatMenu, setShowChatMenu] = useState<number | string | null>(null);
  const [contactViewUser, setContactViewUser] = useState<UserBrief | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  // Load data on mount
  useEffect(() => {
    loadChatRooms();
    loadFriends();
    loadFriendRequests();
  }, []);

  // Load messages when room changes
  useEffect(() => {
    if (selectedRoomId) {
      loadMessages(selectedRoomId);
      loadRoomDetails(selectedRoomId);
    }
  }, [selectedRoomId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Periodic refresh - только для списка чатов, не для сообщений
  useEffect(() => {
    const interval = setInterval(() => {
      // Обновляем только список чатов (боковую панель)
      loadChatRooms();
      // НЕ обновляем сообщения автоматически, чтобы не мешать чтению
    }, 30000); // 30 секунд вместо 5
    return () => clearInterval(interval);
  }, []);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-search-container]')) {
        setShowSearch(false);
      }
    };

    if (showSearch) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSearch]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Если клик не по меню и не по кнопке "три точки"
      if (!target.closest('[data-menu-container]') && !target.closest('[data-menu-trigger]')) {
        setShowChatMenu(null);
        setShowMessageMenu(null);
      }
      // Закрыть панель эмодзи при клике вне неё и вне кнопки «Реакция»
      if (
        showEmojiPicker !== null &&
        !target.closest('[data-emoji-picker]') &&
        !target.closest('[data-emoji-trigger]')
      ) {
        setShowEmojiPicker(null);
      }
    };

    if (showChatMenu || showMessageMenu || showEmojiPicker !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showChatMenu, showMessageMenu, showEmojiPicker]);

  const loadChatRooms = async () => {
    try {
      const response = await getChatRooms();
      setChatRooms(response.items);
    } catch (error) {
      console.error('Failed to load chats:', error);
    } finally {
      setLoadingChats(false);
    }
  };

  const loadRoomDetails = async (roomId: number) => {
    try {
      const room = await getChatRoom(roomId);
      setSelectedRoom(room as unknown as ChatRoom);
    } catch (error) {
      console.error('Failed to load room details:', error);
    }
  };

  const loadMessages = async (roomId: number) => {
    try {
      setLoadingMessages(true);
      const response = await getMessages(roomId, 100);
      setMessages(response.items);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadFriends = async () => {
    try {
      const response = await getFriends();
      setFriends(response.items);
    } catch (error) {
      console.error('Failed to load friends:', error);
    }
  };

  const loadFriendRequests = async () => {
    try {
      const response = await getFriendRequests();
      setFriendRequests(response);
    } catch (error) {
      console.error('Failed to load friend requests:', error);
    }
  };

  const loadBlockedUsers = async () => {
    try {
      const response = await getBlockedUsers();
      setBlockedUsers(response.items);
    } catch (error) {
      console.error('Failed to load blocked users:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'blocked') {
      loadBlockedUsers();
    }
  }, [activeTab]);

  // Search users
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Введите ID или имя пользователя');
      return;
    }

    try {
      setIsSearching(true);
      const response = await searchUsers(searchQuery);
      setSearchResults(response.items);

      if (response.items.length === 0) {
        toast.info('Пользователи не найдены. Проверьте ID или имя.');
      }
    } catch (error: any) {
      console.error('Search error:', error);
      if (error.response?.status === 401) {
        toast.error('Необходима авторизация для поиска пользователей');
      } else if (error.response?.status === 404) {
        toast.error('Пользователь с таким ID не найден');
      } else {
        toast.error(error.response?.data?.detail || 'Ошибка поиска. Попробуйте снова.');
      }
    } finally {
      setIsSearching(false);
    }
  };

  // Send friend request
  const handleSendFriendRequest = async (publicId: number) => {
    try {
      const response = await sendFriendRequest(publicId);
      toast.success(response.message);
      setSearchResults(prev =>
        prev.map(u => (u.public_id === publicId ? { ...u, friendship_status: 'pending' } : u))
      );
      loadFriendRequests();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Ошибка отправки запроса');
    }
  };

  // Accept friend request
  const handleAcceptRequest = async (friendshipId: number) => {
    try {
      await acceptFriendRequest(friendshipId);
      toast.success('Запрос принят');
      loadFriendRequests();
      loadFriends();
    } catch (error) {
      toast.error('Ошибка при принятии запроса');
    }
  };

  // Decline friend request
  const handleDeclineRequest = async (friendshipId: number) => {
    try {
      await declineFriendRequest(friendshipId);
      toast.success('Запрос отклонён');
      loadFriendRequests();
    } catch (error) {
      toast.error('Ошибка при отклонении запроса');
    }
  };

  // Remove friend
  const handleRemoveFriend = async (friendId: number) => {
    if (!confirm('Удалить из друзей?')) return;

    try {
      await removeFriend(friendId);
      toast.success('Пользователь удалён из друзей');
      loadFriends();
      setShowChatMenu(null);
    } catch (error) {
      toast.error('Ошибка при удалении из друзей');
    }
  };

  // Start chat with friend
  const handleStartChat = async (friendId: number) => {
    try {
      const response = await createChatRoom([friendId]);
      if (response.exists) {
        setSelectedRoomId(response.id);
      } else {
        toast.success('Чат создан');
        loadChatRooms();
        setSelectedRoomId(response.id);
      }
      setActiveTab('chats');
    } catch (error) {
      toast.error('Ошибка создания чата');
    }
  };

  // Send message
  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedRoomId) return;

    try {
      if (editingMessage) {
        await editMessage(editingMessage.id, messageText);
        toast.success('Сообщение изменено');
        setEditingMessage(null);
      } else {
        await sendMessage(selectedRoomId, messageText, 'text', replyTo?.id);
        setReplyTo(null);
      }
      setMessageText('');
      loadMessages(selectedRoomId);
      loadChatRooms();
    } catch (error) {
      toast.error('Ошибка отправки сообщения');
    }
  };

  // Delete message
  const handleDeleteMessage = async (messageId: number) => {
    try {
      await deleteMessage(messageId);
      toast.success('Сообщение удалено');
      if (selectedRoomId) loadMessages(selectedRoomId);
    } catch (error) {
      toast.error('Ошибка удаления');
    }
    setShowMessageMenu(null);
  };

  // Add reaction
  const handleAddReaction = async (messageId: number, emoji: string) => {
    try {
      await addReaction(messageId, emoji);
      if (selectedRoomId) loadMessages(selectedRoomId);
    } catch (error) {
      toast.error('Ошибка');
    }
    setShowEmojiPicker(null);
  };

  // Toggle pin
  const handleTogglePin = async (roomId: number) => {
    try {
      const response = await togglePinChat(roomId);
      toast.success(response.is_pinned ? 'Чат закреплён' : 'Чат откреплён');
      loadChatRooms();
    } catch (error) {
      toast.error('Ошибка');
    }
    setShowChatMenu(null);
  };

  // Toggle mute
  const handleToggleMute = async (roomId: number) => {
    try {
      const response = await toggleMuteChat(roomId);
      toast.success(response.is_muted ? 'Уведомления выключены' : 'Уведомления включены');
      loadChatRooms();
    } catch (error) {
      toast.error('Ошибка');
    }
    setShowChatMenu(null);
  };

  // Delete chat
  const handleDeleteChat = async (roomId: number) => {
    if (!confirm('Удалить этот чат? Вы покинете его.')) return;

    try {
      await deleteChatRoom(roomId);
      if (selectedRoomId === roomId) setSelectedRoomId(null);
      loadChatRooms();
      toast.success('Чат удален');
    } catch (error) {
      toast.error('Ошибка удаления чата');
    }
    setShowChatMenu(null);
  };

  // Block user
  const handleBlockUser = async (userId: number) => {
    try {
      await blockUser(userId);
      toast.success('Пользователь заблокирован');
      loadFriends();
      loadBlockedUsers();
    } catch (error) {
      toast.error('Ошибка блокировки');
    }
  };

  // Unblock user
  const handleUnblockUser = async (userId: number) => {
    try {
      await unblockUser(userId);
      toast.success('Пользователь разблокирован');
      loadBlockedUsers();
    } catch (error) {
      toast.error('Ошибка разблокировки');
    }
  };

  // Copy user ID
  const copyUserId = () => {
    if (user?.public_id) {
      navigator.clipboard.writeText(user.public_id.toString());
      toast.success('ID скопирован');
    }
  };

  // Format time
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    return (
      date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) +
      ' ' +
      date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    );
  };

  // Get online status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return '#22c55e';
      case 'away':
        return '#f59e0b';
      case 'do_not_disturb':
        return '#ef4444';
      default:
        return '#94a3b8';
    }
  };

  return (
    <DashboardPage title="Сообщения" subtitle="Общайтесь с друзьями на платформе">
      <div
        style={{ display: 'flex', gap: '20px', height: 'calc(100vh - 200px)', minHeight: '600px' }}
      >
        {/* Left Sidebar - Chat List / Friends */}
        <Card
          style={{ width: '340px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          {/* User ID Banner */}
          <div
            style={{
              padding: '12px 16px',
              background: 'var(--primary-bg)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Ваш ID:</span>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: 'var(--primary)',
                  marginLeft: '8px',
                }}
              >
                {user?.public_id}
              </span>
            </div>
            <button
              onClick={copyUserId}
              style={{
                padding: '6px 10px',
                background: 'var(--primary)',
                color: 'var(--text-on-primary)',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Copy size={12} />
              Копировать
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {[
              { id: 'chats', label: 'Чаты', icon: MessageCircle },
              { id: 'friends', label: 'Друзья', icon: Users },
              {
                id: 'requests',
                label: 'Запросы',
                icon: UserPlus,
                badge: friendRequests.incoming.length,
              },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                style={{
                  flex: 1,
                  padding: '12px 8px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom:
                    activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                  color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-muted)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  position: 'relative',
                }}
              >
                <tab.icon size={16} />
                {tab.label}
                {tab.badge ? (
                  <span
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#ef4444',
                      color: 'white',
                      fontSize: '11px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {tab.badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Search */}
          <div
            data-search-container
            style={{
              padding: '12px',
              borderBottom: '1px solid var(--border)',
              position: 'relative',
            }}
          >
            <div style={{ position: 'relative' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                placeholder={
                  activeTab === 'chats' ? 'Поиск чатов...' : 'Найти по ID (например: 49835940)'
                }
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleSearch()}
                onFocus={() => setShowSearch(true)}
                style={{
                  width: '100%',
                  padding: '10px 12px 10px 36px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontSize: '14px',
                }}
              />
            </div>
            {activeTab !== 'chats' && (
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  marginTop: '6px',
                  paddingLeft: '4px',
                }}
              >
                💡 Используйте 8-значный ID пользователя или имя
              </div>
            )}

            {/* Search Results - Simple List */}
            {showSearch && searchResults.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% - 12px)',
                  left: '12px',
                  right: '12px',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  marginTop: '4px',
                  zIndex: 1000,
                  maxHeight: '300px',
                  overflow: 'auto',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                }}
              >
                {searchResults.map(result => (
                  <div
                    key={result.id}
                    onClick={() => {
                      setSelectedUserProfile(result);
                      setShowSearch(false);
                    }}
                    style={{
                      padding: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      borderBottom: '1px solid var(--border)',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        background: 'var(--primary-bg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {result.avatar ? (
                        <img
                          src={result.avatar}
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            borderRadius: '50%',
                            objectFit: 'cover',
                          }}
                        />
                      ) : (
                        <Users size={20} style={{ color: 'var(--primary)' }} />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, color: 'var(--text)' }}>
                        {result.name || 'Без имени'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        ID: {result.public_id}
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Нажмите для просмотра →
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {/* Chats Tab */}
            {activeTab === 'chats' && (
              <>
                {chatRooms.length === 0 ? (
                  <div
                    style={{
                      padding: '40px 20px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <MessageCircle size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                    <p>У вас пока нет чатов</p>
                    <p style={{ fontSize: '13px', marginTop: '8px' }}>
                      Добавьте друзей, чтобы начать общение
                    </p>
                  </div>
                ) : (
                  chatRooms.map(room => (
                    <div
                      key={room.id}
                      onClick={() => setSelectedRoomId(room.id)}
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        cursor: 'pointer',
                        background:
                          selectedRoomId === room.id ? 'var(--primary-bg)' : 'transparent',
                        borderBottom: '1px solid var(--border)',
                        position: 'relative',
                      }}
                    >
                      {/* Avatar */}
                      <div style={{ position: 'relative' }}>
                        <div
                          style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            background: 'var(--surface)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                          }}
                        >
                          {room.avatar ? (
                            <img
                              src={room.avatar}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <Users size={24} style={{ color: 'var(--text-muted)' }} />
                          )}
                        </div>
                        {room.is_pinned && (
                          <Pin
                            size={12}
                            style={{
                              position: 'absolute',
                              top: -2,
                              right: -2,
                              color: 'var(--primary)',
                            }}
                          />
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 500,
                              color: 'var(--text)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {room.name || 'Чат'}
                          </span>
                          {room.last_message && (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {formatTime(room.last_message.created_at)}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '13px',
                              color: 'var(--text-muted)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                            }}
                          >
                            {room.last_message?.content || 'Нет сообщений'}
                          </span>
                          {room.unread_count > 0 && (
                            <span
                              style={{
                                minWidth: '20px',
                                height: '20px',
                                borderRadius: '10px',
                                background: 'var(--primary)',
                                color: 'var(--text-on-primary)',
                                fontSize: '11px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '0 6px',
                              }}
                            >
                              {room.unread_count}
                            </span>
                          )}
                          {room.is_muted && (
                            <BellOff size={14} style={{ color: 'var(--text-muted)' }} />
                          )}
                        </div>
                      </div>

                      {/* Menu */}
                      <button
                        data-menu-trigger
                        onClick={e => {
                          e.stopPropagation();
                          setShowChatMenu(showChatMenu === room.id ? null : room.id);
                        }}
                        style={{
                          padding: '4px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <MoreVertical size={16} />
                      </button>

                      {showChatMenu === room.id && (
                        <div
                          data-menu-container
                          style={{
                            position: 'absolute',
                            top: '50px',
                            right: '16px',
                            background: 'var(--card)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                            zIndex: 100,
                            minWidth: '160px',
                          }}
                        >
                          <button
                            onClick={() => handleTogglePin(room.id)}
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text)',
                              cursor: 'pointer',
                              fontSize: '14px',
                            }}
                          >
                            <Pin size={16} />
                            {room.is_pinned ? 'Открепить' : 'Закрепить'}
                          </button>
                          <button
                            onClick={() => handleToggleMute(room.id)}
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text)',
                              cursor: 'pointer',
                              fontSize: '14px',
                            }}
                          >
                            {room.is_muted ? <Bell size={16} /> : <BellOff size={16} />}
                            {room.is_muted ? 'Включить уведомления' : 'Выключить уведомления'}
                          </button>
                          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                          <button
                            onClick={() => handleDeleteChat(room.id)}
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              background: 'transparent',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              fontSize: '14px',
                            }}
                          >
                            <Trash2 size={16} />
                            Удалить чат
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </>
            )}

            {/* Friends Tab */}
            {activeTab === 'friends' && (
              <>
                {friends.length === 0 ? (
                  <div
                    style={{
                      padding: '40px 20px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <Users size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                    <p>У вас пока нет друзей</p>
                    <p style={{ fontSize: '13px', marginTop: '8px' }}>
                      Найдите пользователей по ID и отправьте запрос
                    </p>
                  </div>
                ) : (
                  friends.map(friend => (
                    <div
                      key={friend.id}
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        borderBottom: '1px solid var(--border)',
                        position: 'relative',
                      }}
                    >
                      <div style={{ position: 'relative' }}>
                        <div
                          style={{
                            width: '44px',
                            height: '44px',
                            borderRadius: '50%',
                            background: 'var(--surface)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                          }}
                        >
                          {friend.avatar ? (
                            <img
                              src={friend.avatar}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <Users size={22} style={{ color: 'var(--text-muted)' }} />
                          )}
                        </div>
                        <Circle
                          size={12}
                          fill={getStatusColor(friend.online_status)}
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            right: 0,
                            color: getStatusColor(friend.online_status),
                          }}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, color: 'var(--text)' }}>
                          {friend.name || 'Без имени'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {friend.online_status === 'online'
                            ? 'В сети'
                            : friend.last_seen_at
                              ? `Был(а) ${formatTime(friend.last_seen_at)}`
                              : 'Не в сети'}
                        </div>
                      </div>
                      <button
                        onClick={() => handleStartChat(friend.id)}
                        style={{
                          padding: '8px 12px',
                          background: 'var(--primary)',
                          color: 'var(--text-on-primary)',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '13px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <MessageCircle size={14} />
                        Написать
                      </button>

                      {/* Friend menu */}
                      <button
                        data-menu-trigger
                        onClick={e => {
                          e.stopPropagation();
                          setShowChatMenu(
                            showChatMenu === `friend-${friend.id}` ? null : `friend-${friend.id}`
                          );
                        }}
                        style={{
                          padding: '4px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <MoreVertical size={16} />
                      </button>

                      {showChatMenu === `friend-${friend.id}` && (
                        <div
                          data-menu-container
                          style={{
                            position: 'absolute',
                            top: '50px',
                            right: '16px',
                            background: 'var(--card)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                            zIndex: 100,
                            minWidth: '180px',
                          }}
                        >
                          <button
                            onClick={() => handleRemoveFriend(friend.id)}
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--text)',
                              cursor: 'pointer',
                              fontSize: '14px',
                            }}
                          >
                            <UserX size={16} />
                            Удалить из друзей
                          </button>
                          <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                          <button
                            onClick={() => {
                              handleBlockUser(friend.id);
                              setShowChatMenu(null);
                            }}
                            style={{
                              width: '100%',
                              padding: '10px 16px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              background: 'transparent',
                              border: 'none',
                              color: '#ef4444',
                              cursor: 'pointer',
                              fontSize: '14px',
                            }}
                          >
                            <UserX size={16} />
                            Заблокировать
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}

                {/* Blocked Users Link */}
                <button
                  onClick={() => setActiveTab('blocked')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'transparent',
                    border: 'none',
                    borderTop: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  <UserX size={16} />
                  Заблокированные ({blockedUsers.length})
                </button>
              </>
            )}

            {/* Requests Tab */}
            {activeTab === 'requests' && (
              <>
                {/* Incoming */}
                <div
                  style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  Входящие ({friendRequests.incoming.length})
                </div>
                {friendRequests.incoming.length === 0 ? (
                  <div
                    style={{
                      padding: '20px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      fontSize: '13px',
                    }}
                  >
                    Нет входящих запросов
                  </div>
                ) : (
                  friendRequests.incoming.map(req => (
                    <div
                      key={req.id}
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <div
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          background: 'var(--surface)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Users size={22} style={{ color: 'var(--text-muted)' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, color: 'var(--text)' }}>
                          {req.user.name || req.user.email}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          ID: {req.user.public_id}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => handleAcceptRequest(req.id)}
                          style={{
                            padding: '8px',
                            background: 'rgba(34, 197, 94, 0.1)',
                            color: '#22c55e',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                          }}
                        >
                          <Check size={18} />
                        </button>
                        <button
                          onClick={() => handleDeclineRequest(req.id)}
                          style={{
                            padding: '8px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                          }}
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                  ))
                )}

                {/* Outgoing */}
                <div
                  style={{
                    padding: '8px 16px',
                    marginTop: '16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                  }}
                >
                  Исходящие ({friendRequests.outgoing.length})
                </div>
                {friendRequests.outgoing.length === 0 ? (
                  <div
                    style={{
                      padding: '20px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      fontSize: '13px',
                    }}
                  >
                    Нет исходящих запросов
                  </div>
                ) : (
                  friendRequests.outgoing.map(req => (
                    <div
                      key={req.id}
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <div
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          background: 'var(--surface)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Users size={22} style={{ color: 'var(--text-muted)' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, color: 'var(--text)' }}>
                          {req.user.name || req.user.email}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          <Clock
                            size={12}
                            style={{ marginRight: '4px', verticalAlign: 'middle' }}
                          />
                          Ожидает подтверждения
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            {/* Blocked Tab */}
            {activeTab === 'blocked' && (
              <>
                <button
                  onClick={() => setActiveTab('friends')}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  <ChevronLeft size={16} />
                  Назад к друзьям
                </button>

                {blockedUsers.length === 0 ? (
                  <div
                    style={{
                      padding: '40px 20px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <UserX size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
                    <p>Нет заблокированных пользователей</p>
                  </div>
                ) : (
                  blockedUsers.map(blocked => (
                    <div
                      key={blocked.id}
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <div
                        style={{
                          width: '44px',
                          height: '44px',
                          borderRadius: '50%',
                          background: 'var(--surface)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <UserX size={22} style={{ color: '#ef4444' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500, color: 'var(--text)' }}>
                          {blocked.name || 'Без имени'}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          ID: {blocked.public_id}
                        </div>
                      </div>
                      <button
                        onClick={() => handleUnblockUser(blocked.id)}
                        style={{
                          padding: '8px 12px',
                          background: 'var(--surface)',
                          color: 'var(--text)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '13px',
                          cursor: 'pointer',
                        }}
                      >
                        Разблокировать
                      </button>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </Card>

        {/* Right Side - Chat Area */}
        <Card style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedRoomId ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
              }}
            >
              <MessageCircle size={64} style={{ marginBottom: '20px', opacity: 0.3 }} />
              <p style={{ fontSize: '18px', marginBottom: '8px' }}>Выберите чат</p>
              <p style={{ fontSize: '14px' }}>или начните новую беседу с другом</p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: 'var(--surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {selectedRoom?.avatar ? (
                    <img
                      src={selectedRoom.avatar}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <Users size={24} style={{ color: 'var(--text-muted)' }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)' }}>
                    {selectedRoom?.name || 'Чат'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {selectedRoom?.room_type === 'private'
                      ? 'Личный чат'
                      : `${selectedRoom?.participants?.length ?? 0} участников`}
                  </div>
                </div>
                {selectedRoom?.room_type === 'private' &&
                  (() => {
                    const otherParticipant = selectedRoom?.participants?.find(
                      p => p.id !== user?.id
                    ) as UserBrief | undefined;
                    const isAlreadyFriend =
                      otherParticipant &&
                      friends.some(f => f.public_id === otherParticipant.public_id);
                    const hasOutgoingRequest =
                      otherParticipant &&
                      friendRequests.outgoing.some(
                        r => r.user.public_id === otherParticipant.public_id
                      );
                    const canAddFriend =
                      otherParticipant &&
                      otherParticipant.id !== user?.id &&
                      !isAlreadyFriend &&
                      !hasOutgoingRequest;
                    return otherParticipant ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setContactViewUser(otherParticipant)}
                          title="Просмотр контакта"
                          style={{
                            padding: '8px 12px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            color: 'var(--text)',
                            fontSize: '13px',
                            cursor: 'pointer',
                          }}
                        >
                          <User size={16} />
                          Контакт
                        </button>
                        {canAddFriend ? (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const res = await sendFriendRequest(otherParticipant.public_id);
                                toast.success(res.message);
                                loadFriendRequests();
                                loadFriends();
                              } catch (err: unknown) {
                                const ax = err as { response?: { data?: { detail?: string } } };
                                toast.error(
                                  ax.response?.data?.detail || 'Не удалось отправить запрос'
                                );
                              }
                            }}
                            title="Добавить в друзья"
                            style={{
                              padding: '8px 12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: 'var(--primary)',
                              border: 'none',
                              borderRadius: '8px',
                              color: 'var(--text-on-primary)',
                              fontSize: '13px',
                              cursor: 'pointer',
                            }}
                          >
                            <UserPlus size={16} />В друзья
                          </button>
                        ) : isAlreadyFriend ? (
                          <span
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '12px',
                              color: 'var(--text-muted)',
                            }}
                          >
                            <UserCheck size={16} />В друзьях
                          </span>
                        ) : hasOutgoingRequest ? (
                          <span
                            style={{
                              fontSize: '12px',
                              color: 'var(--text-muted)',
                            }}
                          >
                            Запрос отправлен
                          </span>
                        ) : null}
                      </div>
                    ) : null;
                  })()}
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
                {loadingMessages ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    Загрузка сообщений...
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    <p>Нет сообщений</p>
                    <p style={{ fontSize: '13px', marginTop: '8px' }}>Напишите первое сообщение!</p>
                  </div>
                ) : (
                  messages.map(msg => (
                    <div
                      key={msg.id}
                      style={{
                        marginBottom: '12px',
                        display: 'flex',
                        flexDirection: msg.is_mine ? 'row-reverse' : 'row',
                        gap: '8px',
                      }}
                    >
                      {/* Avatar */}
                      {!msg.is_mine && (
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            background: 'var(--surface)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {msg.sender?.avatar ? (
                            <img
                              src={msg.sender.avatar}
                              alt=""
                              style={{
                                width: '100%',
                                height: '100%',
                                borderRadius: '50%',
                                objectFit: 'cover',
                              }}
                            />
                          ) : (
                            <Users size={16} style={{ color: 'var(--text-muted)' }} />
                          )}
                        </div>
                      )}

                      {/* Message Bubble */}
                      <div style={{ maxWidth: '70%', position: 'relative' }}>
                        {/* Reply */}
                        {msg.reply_to && (
                          <div
                            style={{
                              padding: '6px 10px',
                              background: 'var(--surface)',
                              borderRadius: '8px 8px 0 0',
                              borderLeft: '3px solid var(--primary)',
                              fontSize: '12px',
                              color: 'var(--text-muted)',
                            }}
                          >
                            <span style={{ fontWeight: 500, color: 'var(--text)' }}>
                              {msg.reply_to.sender_name}
                            </span>
                            <p
                              style={{
                                margin: '2px 0 0',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {msg.reply_to.content}
                            </p>
                          </div>
                        )}

                        <div
                          style={{
                            padding: '10px 14px',
                            background: msg.is_mine ? 'var(--primary)' : 'var(--surface)',
                            color: msg.is_mine ? 'var(--text-on-primary)' : 'var(--text)',
                            borderRadius: msg.reply_to
                              ? '0 0 16px 16px'
                              : msg.is_mine
                                ? '16px 4px 16px 16px'
                                : '4px 16px 16px 16px',
                          }}
                        >
                          {!msg.is_mine && (
                            <div
                              style={{
                                fontSize: '12px',
                                fontWeight: 500,
                                marginBottom: '4px',
                                color: 'var(--primary)',
                              }}
                            >
                              {msg.sender?.name || 'Неизвестный'}
                            </div>
                          )}
                          <p style={{ margin: 0, wordBreak: 'break-word' }}>
                            {msg.is_deleted ? (
                              <span style={{ fontStyle: 'italic', opacity: 0.7 }}>
                                Сообщение удалено
                              </span>
                            ) : (
                              msg.content
                            )}
                          </p>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '4px',
                              marginTop: '4px',
                              fontSize: '11px',
                              opacity: 0.7,
                            }}
                          >
                            {msg.is_edited && <span>(изм.)</span>}
                            <span>{formatTime(msg.created_at)}</span>
                            {msg.is_mine &&
                              (msg.is_read ? (
                                <CheckCheck size={14} style={{ color: 'var(--primary)' }} />
                              ) : (
                                <Check size={14} style={{ opacity: 0.5 }} />
                              ))}
                          </div>
                        </div>

                        {/* Reactions */}
                        {msg.reactions.length > 0 && (
                          <div
                            style={{
                              display: 'flex',
                              gap: '4px',
                              marginTop: '4px',
                              flexWrap: 'wrap',
                            }}
                          >
                            {Object.entries(
                              msg.reactions.reduce(
                                (acc, r) => {
                                  acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                                  return acc;
                                },
                                {} as Record<string, number>
                              )
                            ).map(([emoji, count]) => (
                              <span
                                key={emoji}
                                style={{
                                  padding: '2px 6px',
                                  background: 'var(--surface)',
                                  borderRadius: '10px',
                                  fontSize: '12px',
                                }}
                              >
                                {emoji} {count}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Message Actions */}
                        {!msg.is_deleted && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              [msg.is_mine ? 'left' : 'right']: '-80px',
                              display: 'flex',
                              gap: '4px',
                              opacity: 0,
                              transition: 'opacity 0.2s',
                            }}
                            className="message-actions"
                          >
                            <button
                              onClick={() => setReplyTo(msg)}
                              style={{
                                padding: '6px',
                                background: 'var(--surface)',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                              }}
                              title="Ответить"
                            >
                              <Reply size={14} />
                            </button>
                            <button
                              type="button"
                              data-emoji-trigger
                              onClick={() =>
                                setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)
                              }
                              style={{
                                padding: '6px',
                                background: 'var(--surface)',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                color: 'var(--text-muted)',
                              }}
                              title="Реакция"
                            >
                              <Smile size={14} />
                            </button>
                            {msg.is_mine && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingMessage(msg);
                                    setMessageText(msg.content || '');
                                  }}
                                  style={{
                                    padding: '6px',
                                    background: 'var(--surface)',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)',
                                  }}
                                  title="Редактировать"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  style={{
                                    padding: '6px',
                                    background: 'var(--surface)',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    color: '#ef4444',
                                  }}
                                  title="Удалить"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        {/* Emoji Picker — открывается под сообщением, чтобы не обрезаться и не уходить вверх */}
                        {showEmojiPicker === msg.id && (
                          <div
                            data-emoji-picker
                            style={{
                              position: 'absolute',
                              top: '100%',
                              marginTop: '6px',
                              [msg.is_mine ? 'right' : 'left']: 0,
                              padding: '8px',
                              background: 'var(--card)',
                              border: '1px solid var(--border)',
                              borderRadius: '12px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              display: 'flex',
                              gap: '4px',
                              flexWrap: 'wrap',
                              zIndex: 1000,
                            }}
                          >
                            {EMOJI_LIST.map(emoji => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => handleAddReaction(msg.id, emoji)}
                                style={{
                                  padding: '6px',
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  fontSize: '18px',
                                }}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px' }}>
                {/* Reply Preview */}
                {replyTo && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '8px',
                      padding: '8px 12px',
                      background: 'var(--surface)',
                      borderRadius: '8px',
                      borderLeft: '3px solid var(--primary)',
                    }}
                  >
                    <Reply size={16} style={{ color: 'var(--primary)' }} />
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--primary)' }}>
                        Ответ на {replyTo.sender?.name || 'сообщение'}
                      </span>
                      <p
                        style={{
                          margin: 0,
                          fontSize: '13px',
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {replyTo.content}
                      </p>
                    </div>
                    <button
                      onClick={() => setReplyTo(null)}
                      style={{
                        padding: '4px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                {/* Edit Preview */}
                {editingMessage && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '8px',
                      padding: '8px 12px',
                      background: 'rgba(59, 130, 246, 0.1)',
                      borderRadius: '8px',
                      borderLeft: '3px solid #3b82f6',
                    }}
                  >
                    <Edit3 size={16} style={{ color: '#3b82f6' }} />
                    <span style={{ flex: 1, fontSize: '13px', color: '#3b82f6' }}>
                      Редактирование сообщения
                    </span>
                    <button
                      onClick={() => {
                        setEditingMessage(null);
                        setMessageText('');
                      }}
                      style={{
                        padding: '4px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                {/* Input */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                  <textarea
                    ref={messageInputRef}
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    onKeyPress={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Напишите сообщение..."
                    rows={1}
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '20px',
                      color: 'var(--text)',
                      fontSize: '14px',
                      resize: 'none',
                      maxHeight: '120px',
                      lineHeight: '1.4',
                    }}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!messageText.trim()}
                    style={{
                      padding: '12px',
                      background: messageText.trim() ? 'var(--primary)' : 'var(--surface)',
                      color: messageText.trim() ? 'var(--text-on-primary)' : 'var(--text-muted)',
                      border: 'none',
                      borderRadius: '50%',
                      cursor: messageText.trim() ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Send size={20} />
                  </button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {/* User Profile Modal */}
      {selectedUserProfile && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setSelectedUserProfile(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card)',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
              position: 'relative',
            }}
          >
            {/* Close button */}
            <button
              onClick={() => setSelectedUserProfile(null)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: '24px',
                lineHeight: 1,
              }}
            >
              ×
            </button>

            {/* Avatar */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div
                style={{
                  width: '120px',
                  height: '120px',
                  borderRadius: '50%',
                  background: 'var(--primary-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto',
                  marginBottom: '16px',
                }}
              >
                {selectedUserProfile.avatar ? (
                  <img
                    src={selectedUserProfile.avatar}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: '50%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <Users size={60} style={{ color: 'var(--primary)' }} />
                )}
              </div>

              {/* Name */}
              <h2
                style={{
                  fontSize: '24px',
                  fontWeight: 600,
                  color: 'var(--text)',
                  marginBottom: '8px',
                }}
              >
                {selectedUserProfile.name || 'Без имени'}
              </h2>

              {/* ID */}
              <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                ID: {selectedUserProfile.public_id}
              </div>

              {/* Status */}
              {selectedUserProfile.is_friend && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 12px',
                    background: '#22c55e',
                    color: 'white',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                >
                  <UserCheck size={14} />
                  Друзья
                </div>
              )}

              {selectedUserProfile.friendship_status === 'pending' && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 12px',
                    background: 'var(--surface)',
                    color: 'var(--text-muted)',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 500,
                  }}
                >
                  <Clock size={14} />
                  Запрос отправлен
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              {!selectedUserProfile.is_friend &&
                selectedUserProfile.friendship_status !== 'pending' && (
                  <button
                    onClick={() => {
                      handleSendFriendRequest(selectedUserProfile.public_id);
                      setSelectedUserProfile(null);
                    }}
                    style={{
                      flex: 1,
                      padding: '12px 24px',
                      background: 'transparent',
                      color: 'var(--primary)',
                      border: '2px solid var(--primary)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <UserPlus size={18} />
                    Добавить в друзья
                  </button>
                )}

              <button
                onClick={() => {
                  handleStartChat(selectedUserProfile.id);
                  setSelectedUserProfile(null);
                }}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  background: 'var(--primary)',
                  color: 'var(--text-on-primary)',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <MessageCircle size={18} />
                Написать сообщение
              </button>
            </div>

            {/* Additional actions */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
              {selectedUserProfile.is_friend && (
                <button
                  onClick={() => {
                    handleRemoveFriend(selectedUserProfile.id);
                    setSelectedUserProfile(null);
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  <UserX size={16} />
                  Удалить из друзей
                </button>
              )}

              <button
                onClick={() => {
                  handleBlockUser(selectedUserProfile.id);
                  setSelectedUserProfile(null);
                }}
                style={{
                  flex: selectedUserProfile.is_friend ? 1 : undefined,
                  padding: '10px 16px',
                  background: 'transparent',
                  color: '#ef4444',
                  border: '1px solid #ef4444',
                  borderRadius: '8px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <UserX size={16} />
                Заблокировать
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно просмотра контакта (собеседника в чате) */}
      {contactViewUser && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setContactViewUser(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card)',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '420px',
              width: '90%',
              boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
              position: 'relative',
            }}
          >
            <button
              onClick={() => setContactViewUser(null)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                fontSize: '24px',
                lineHeight: 1,
              }}
            >
              ×
            </button>

            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div
                style={{
                  width: '96px',
                  height: '96px',
                  borderRadius: '50%',
                  background: 'var(--primary-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  overflow: 'hidden',
                }}
              >
                {contactViewUser.avatar ? (
                  <img
                    src={contactViewUser.avatar}
                    alt=""
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <Users size={48} style={{ color: 'var(--primary)' }} />
                )}
              </div>
              <h2
                style={{
                  fontSize: '20px',
                  fontWeight: 600,
                  color: 'var(--text)',
                  marginBottom: '8px',
                }}
              >
                {contactViewUser.name || 'Без имени'}
              </h2>
              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                  marginBottom: '4px',
                  wordBreak: 'break-all',
                }}
              >
                {contactViewUser.email}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                ID: {contactViewUser.public_id}
              </div>
            </div>

            <div
              style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}
            >
              {contactViewUser.id !== user?.id &&
                !friends.some(f => f.public_id === contactViewUser.public_id) &&
                !friendRequests.outgoing.some(
                  r => r.user.public_id === contactViewUser.public_id
                ) && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await sendFriendRequest(contactViewUser.public_id);
                        toast.success(res.message);
                        loadFriendRequests();
                        loadFriends();
                        setContactViewUser(null);
                      } catch (err: unknown) {
                        const ax = err as { response?: { data?: { detail?: string } } };
                        toast.error(ax.response?.data?.detail || 'Не удалось отправить запрос');
                      }
                    }}
                    style={{
                      padding: '10px 20px',
                      background: 'var(--primary)',
                      color: 'var(--text-on-primary)',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <UserPlus size={18} />
                    Добавить в друзья
                  </button>
                )}
              <button
                type="button"
                onClick={() => setContactViewUser(null)}
                style={{
                  padding: '10px 20px',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS for hover effects */}
      <style>{`
        .message-actions {
          opacity: 0 !important;
        }
        div:hover > .message-actions {
          opacity: 1 !important;
        }
      `}</style>
    </DashboardPage>
  );
}
