import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import {
  ArrowLeft,
  Users,
  Bot,
  Workflow,
  Building2,
  Mail,
  Calendar,
  Shield,
  TrendingUp,
  MessageSquare,
  CheckCircle,
  XCircle,
  BarChart3,
  Ban,
  AlertTriangle,
  Clock,
  ShieldOff,
  ShieldAlert,
  Lock,
  Unlock,
} from 'lucide-react';
import {
  getUserDetailedInfo,
  type UserDetailedInfo,
  suspendUser,
  unsuspendUser,
  getUserSuspension,
  suspendBot,
  unsuspendBot,
  suspendAllUserBots,
  unsuspendAllUserBots,
  type SuspensionInfo,
  type SuspendRequest,
} from '../../../api/platformAdmin';
import { toast } from '../../../utils/toast';
import { ROLE_NAMES } from '../../../constants/roles';

// Типы блокировок
const SUSPENSION_TYPES = {
  warning: { label: 'Предупреждение', color: '#f59e0b', icon: AlertTriangle },
  temporary: { label: 'Временная блокировка', color: '#ef4444', icon: Clock },
  permanent: { label: 'Постоянная блокировка', color: '#dc2626', icon: Ban },
};

export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<UserDetailedInfo | null>(null);
  const [userSuspension, setUserSuspension] = useState<SuspensionInfo | null>(null);

  // Модальное окно блокировки
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<'user' | 'bot' | 'all-bots'>('user');
  const [suspendTargetId, setSuspendTargetId] = useState<number | null>(null);
  const [suspendType, setSuspendType] = useState<'warning' | 'temporary' | 'permanent'>('warning');
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendDuration, setSuspendDuration] = useState(7);
  const [suspendLoading, setSuspendLoading] = useState(false);

  useEffect(() => {
    if (userId) {
      loadUserInfo(parseInt(userId));
      loadUserSuspension(parseInt(userId));
    }
  }, [userId]);

  const loadUserInfo = async (id: number) => {
    try {
      setLoading(true);
      const data = await getUserDetailedInfo(id);
      setUserInfo(data);
    } catch (error: any) {
      console.error('Failed to load user info:', error);
      toast.error(error.message || 'Не удалось загрузить информацию о пользователе');
      navigate('/dashboard/platform/users');
    } finally {
      setLoading(false);
    }
  };

  const loadUserSuspension = async (id: number) => {
    try {
      const data = await getUserSuspension(id);
      setUserSuspension(data);
    } catch (error: any) {
      console.error('Failed to load user suspension:', error);
    }
  };

  const openSuspendModal = (target: 'user' | 'bot' | 'all-bots', targetId?: number) => {
    setSuspendTarget(target);
    setSuspendTargetId(targetId || null);
    setSuspendType('warning');
    setSuspendReason('');
    setSuspendDuration(7);
    setShowSuspendModal(true);
  };

  const handleSuspend = async () => {
    if (!suspendReason.trim()) {
      toast.error('Укажите причину блокировки');
      return;
    }

    try {
      setSuspendLoading(true);
      const data: SuspendRequest = {
        suspension_type: suspendType,
        reason: suspendReason,
        ...(suspendType === 'temporary' && { duration_days: suspendDuration }),
      };

      if (suspendTarget === 'user' && userId) {
        await suspendUser(parseInt(userId), data);
        toast.success('Пользователь заблокирован');
        loadUserSuspension(parseInt(userId));
      } else if (suspendTarget === 'bot' && suspendTargetId) {
        await suspendBot(suspendTargetId, data);
        toast.success('Бот заблокирован');
        loadUserInfo(parseInt(userId!));
      } else if (suspendTarget === 'all-bots' && userId) {
        await suspendAllUserBots(parseInt(userId), data);
        toast.success('Все боты заблокированы');
        loadUserInfo(parseInt(userId));
      }

      setShowSuspendModal(false);
    } catch (error: any) {
      console.error('Failed to suspend:', error);
      toast.error(error.message || 'Не удалось выполнить блокировку');
    } finally {
      setSuspendLoading(false);
    }
  };

  const handleUnsuspendUser = async () => {
    if (!userId) return;
    try {
      await unsuspendUser(parseInt(userId));
      toast.success('Блокировка снята');
      loadUserSuspension(parseInt(userId));
    } catch (error: any) {
      toast.error(error.message || 'Не удалось снять блокировку');
    }
  };

  const handleUnsuspendBot = async (botId: number) => {
    try {
      await unsuspendBot(botId);
      toast.success('Блокировка бота снята');
      loadUserInfo(parseInt(userId!));
    } catch (error: any) {
      toast.error(error.message || 'Не удалось снять блокировку');
    }
  };

  const handleUnsuspendAllBots = async () => {
    if (!userId) return;
    try {
      await unsuspendAllUserBots(parseInt(userId));
      toast.success('Блокировка снята со всех ботов');
      loadUserInfo(parseInt(userId));
    } catch (error: any) {
      toast.error(error.message || 'Не удалось снять блокировку');
    }
  };

  if (loading) {
    return (
      <DashboardPage title="Информация о пользователе">
        <Card>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                border: '4px solid var(--border)',
                borderTop: '4px solid var(--primary)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto',
              }}
            />
            <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          </div>
        </Card>
      </DashboardPage>
    );
  }

  if (!userInfo) {
    return (
      <DashboardPage title="Пользователь не найден">
        <Card>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p style={{ color: 'var(--text-muted)' }}>Пользователь не найден</p>
            <button
              onClick={() => navigate('/dashboard/platform/users')}
              style={{
                marginTop: '20px',
                padding: '10px 20px',
                background: 'var(--primary)',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Вернуться к списку
            </button>
          </div>
        </Card>
      </DashboardPage>
    );
  }

  const { user, bots, scenarios, team_memberships, statistics } = userInfo;

  return (
    <DashboardPage
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/dashboard/platform/users')}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: '8px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(26, 34, 56, 0.5)';
              e.currentTarget.style.color = 'var(--text)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <span>{user.name || user.email}</span>
        </div>
      }
      subtitle="Детальная информация о пользователе, проектах и активности"
    >
      {/* Основная информация о пользователе */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div
              style={{
                padding: '12px',
                background: 'rgba(59, 130, 246, 0.1)',
                borderRadius: '10px',
              }}
            >
              <Users size={24} style={{ color: '#3b82f6' }} />
            </div>
            <div>
              <h3
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  margin: '0 0 4px 0',
                  color: 'var(--text)',
                }}
              >
                Основная информация
              </h3>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Mail size={16} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Email:</span>
              <span style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 500 }}>
                {user.email}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={16} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Роль:</span>
              <span
                style={{
                  fontSize: '14px',
                  padding: '2px 8px',
                  background: 'rgba(255, 210, 76, 0.2)',
                  borderRadius: '4px',
                  color: 'var(--primary)',
                  fontWeight: 500,
                }}
              >
                {ROLE_NAMES[user.role as keyof typeof ROLE_NAMES] || user.role}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={16} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Регистрация:</span>
              <span style={{ fontSize: '14px', color: 'var(--text)' }}>
                {user.created_at
                  ? new Date(user.created_at).toLocaleDateString('ru-RU')
                  : 'Не указано'}
              </span>
            </div>
            {user.platform_roles && user.platform_roles.length > 0 && (
              <div
                style={{
                  marginTop: '8px',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <p
                  style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    margin: '0 0 8px 0',
                    fontWeight: 600,
                  }}
                >
                  BF-Роли:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {user.platform_roles.map(role => (
                    <span
                      key={role.id}
                      style={{
                        fontSize: '12px',
                        padding: '4px 8px',
                        background: role.is_active
                          ? 'rgba(34, 197, 94, 0.2)'
                          : 'rgba(239, 68, 68, 0.2)',
                        borderRadius: '4px',
                        color: role.is_active ? '#22c55e' : '#ef4444',
                        fontWeight: 500,
                      }}
                    >
                      {role.role_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Статус блокировки пользователя */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div
              style={{
                padding: '12px',
                background: userSuspension?.is_suspended
                  ? 'rgba(239, 68, 68, 0.1)'
                  : 'rgba(34, 197, 94, 0.1)',
                borderRadius: '10px',
              }}
            >
              {userSuspension?.is_suspended ? (
                <ShieldAlert size={24} style={{ color: '#ef4444' }} />
              ) : (
                <Shield size={24} style={{ color: '#22c55e' }} />
              )}
            </div>
            <div>
              <h3
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  margin: '0 0 4px 0',
                  color: 'var(--text)',
                }}
              >
                Статус аккаунта
              </h3>
              <span
                style={{
                  fontSize: '14px',
                  padding: '2px 10px',
                  borderRadius: '12px',
                  background: userSuspension?.is_suspended
                    ? 'rgba(239, 68, 68, 0.2)'
                    : 'rgba(34, 197, 94, 0.2)',
                  color: userSuspension?.is_suspended ? '#ef4444' : '#22c55e',
                  fontWeight: 500,
                }}
              >
                {userSuspension?.is_suspended ? 'Заблокирован' : 'Активен'}
              </span>
            </div>
          </div>

          {userSuspension?.is_suspended && userSuspension.suspension_type && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}
              >
                {React.createElement(
                  SUSPENSION_TYPES[userSuspension.suspension_type]?.icon || Ban,
                  {
                    size: 16,
                    style: {
                      color: SUSPENSION_TYPES[userSuspension.suspension_type]?.color || '#ef4444',
                    },
                  }
                )}
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: SUSPENSION_TYPES[userSuspension.suspension_type]?.color || '#ef4444',
                  }}
                >
                  {SUSPENSION_TYPES[userSuspension.suspension_type]?.label || 'Заблокирован'}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text)', margin: '0 0 8px 0' }}>
                <strong>Причина:</strong> {userSuspension.suspension_reason}
              </p>
              {userSuspension.suspended_at && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>
                  Заблокирован: {new Date(userSuspension.suspended_at).toLocaleString('ru-RU')}
                </p>
              )}
              {userSuspension.suspended_until && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>
                  До: {new Date(userSuspension.suspended_until).toLocaleString('ru-RU')}
                </p>
              )}
              {userSuspension.suspended_by_email && (
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                  Кем: {userSuspension.suspended_by_email}
                </p>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {user.role !== 'owner' && (
              <>
                {userSuspension?.is_suspended ? (
                  <button
                    onClick={handleUnsuspendUser}
                    style={{
                      padding: '10px 20px',
                      background: 'rgba(34, 197, 94, 0.2)',
                      color: '#22c55e',
                      border: '1px solid #22c55e',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s',
                    }}
                  >
                    <Unlock size={16} />
                    Снять блокировку
                  </button>
                ) : (
                  <button
                    onClick={() => openSuspendModal('user')}
                    style={{
                      padding: '10px 20px',
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#ef4444',
                      border: '1px solid #ef4444',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s',
                    }}
                  >
                    <Lock size={16} />
                    Заблокировать пользователя
                  </button>
                )}
                <button
                  onClick={() => openSuspendModal('all-bots')}
                  style={{
                    padding: '10px 20px',
                    background: 'rgba(245, 158, 11, 0.2)',
                    color: '#f59e0b',
                    border: '1px solid #f59e0b',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                  }}
                >
                  <Bot size={16} />
                  Заблокировать всех ботов
                </button>
                {bots.some(b => b.is_suspended) && (
                  <button
                    onClick={handleUnsuspendAllBots}
                    style={{
                      padding: '10px 20px',
                      background: 'rgba(59, 130, 246, 0.2)',
                      color: '#3b82f6',
                      border: '1px solid #3b82f6',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s',
                    }}
                  >
                    <Unlock size={16} />
                    Разблокировать всех ботов
                  </button>
                )}
              </>
            )}
          </div>
        </Card>

        {/* Статистика */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div
              style={{
                padding: '12px',
                background: 'rgba(255, 210, 76, 0.1)',
                borderRadius: '10px',
              }}
            >
              <BarChart3 size={24} style={{ color: '#ffd24c' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                Статистика
              </h3>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>
                Всего ботов
              </p>
              <p style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                {statistics.total_bots}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>
                Активных ботов
              </p>
              <p style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: '#22c55e' }}>
                {statistics.active_bots}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>
                Сценариев
              </p>
              <p style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                {statistics.total_scenarios}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>
                Пользователей ботов
              </p>
              <p style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                {statistics.total_bot_users}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>
                Сообщений
              </p>
              <p style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                {statistics.total_messages}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 4px 0' }}>
                Проектов в команде
              </p>
              <p style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
                {statistics.team_projects_count}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Боты пользователя */}
      <Card style={{ marginBottom: '24px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Bot size={20} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text)' }}>
              Боты ({bots.length})
            </h3>
          </div>
        </div>
        {bots.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <Bot size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
            <p>У пользователя пока нет ботов</p>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '12px',
            }}
          >
            {bots.map(bot => (
              <div
                key={bot.id}
                style={{
                  padding: '16px',
                  background: bot.is_suspended ? 'rgba(239, 68, 68, 0.1)' : 'rgba(26, 34, 56, 0.5)',
                  borderRadius: '8px',
                  border: `1px solid ${bot.is_suspended ? 'rgba(239, 68, 68, 0.3)' : 'var(--border)'}`,
                  transition: 'all 0.2s',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '12px',
                  }}
                >
                  <h4
                    style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text)' }}
                  >
                    {bot.title}
                  </h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {bot.is_suspended && (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          background: 'rgba(239, 68, 68, 0.2)',
                          color: '#ef4444',
                          borderRadius: '4px',
                          fontWeight: 600,
                        }}
                      >
                        Заблокирован
                      </span>
                    )}
                    {bot.is_active ? (
                      <CheckCircle size={16} style={{ color: '#22c55e' }} />
                    ) : (
                      <XCircle size={16} style={{ color: '#ef4444' }} />
                    )}
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={14} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      Пользователей: {bot.users_count}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MessageSquare size={14} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      Сообщений: {bot.messages_count}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => navigate(`/editor/${bot.id}`)}
                    style={{
                      padding: '6px 12px',
                      background: 'rgba(59, 130, 246, 0.2)',
                      color: '#3b82f6',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                    }}
                  >
                    Открыть
                  </button>
                  {bot.is_suspended ? (
                    <button
                      onClick={() => handleUnsuspendBot(bot.id)}
                      style={{
                        padding: '6px 12px',
                        background: 'rgba(34, 197, 94, 0.2)',
                        color: '#22c55e',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      Разблокировать
                    </button>
                  ) : (
                    <button
                      onClick={() => openSuspendModal('bot', bot.id)}
                      style={{
                        padding: '6px 12px',
                        background: 'rgba(239, 68, 68, 0.2)',
                        color: '#ef4444',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      Заблокировать
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Проекты в команде */}
      {team_memberships.length > 0 && (
        <Card style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <Building2 size={20} style={{ color: 'var(--primary)' }} />
            <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text)' }}>
              Проекты в команде ({team_memberships.length})
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {team_memberships.map((project, index) => (
              <div
                key={index}
                style={{
                  padding: '16px',
                  background: 'rgba(26, 34, 56, 0.5)',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h4
                    style={{
                      fontSize: '16px',
                      fontWeight: 600,
                      margin: '0 0 4px 0',
                      color: 'var(--text)',
                    }}
                  >
                    {project.owner_name || project.owner_email}
                  </h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0' }}>
                    {project.owner_email}
                  </p>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}
                  >
                    <span
                      style={{
                        fontSize: '12px',
                        padding: '2px 8px',
                        background: 'rgba(255, 210, 76, 0.2)',
                        borderRadius: '4px',
                        color: 'var(--primary)',
                        fontWeight: 500,
                      }}
                    >
                      {project.role}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      Ботов в проекте: {project.bots_count}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Кнопка анализа */}
      <Card>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px',
          }}
        >
          <div>
            <h4
              style={{
                fontSize: '16px',
                fontWeight: 600,
                margin: '0 0 8px 0',
                color: 'var(--text)',
              }}
            >
              Аналитика пользователя
            </h4>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>
              Просмотр подробной аналитики по активности этого пользователя
            </p>
          </div>
          <button
            onClick={() => navigate(`/dashboard/platform/analytics?user_id=${user.id}`)}
            style={{
              padding: '12px 24px',
              background: 'var(--primary)',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--primary-hover)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--primary)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <TrendingUp size={18} />
            <span>Открыть аналитику</span>
          </button>
        </div>
      </Card>

      {/* Модальное окно блокировки */}
      {showSuspendModal && (
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
            zIndex: 1000,
          }}
          onClick={() => setShowSuspendModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--card-bg)',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '480px',
              border: '1px solid var(--border)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}
            >
              <div
                style={{
                  padding: '12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: '12px',
                }}
              >
                <ShieldAlert size={24} style={{ color: '#ef4444' }} />
              </div>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text)' }}>
                  {suspendTarget === 'user' && 'Блокировка пользователя'}
                  {suspendTarget === 'bot' && 'Блокировка бота'}
                  {suspendTarget === 'all-bots' && 'Блокировка всех ботов'}
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  {suspendTarget === 'user' && user.email}
                  {suspendTarget === 'bot' && bots.find(b => b.id === suspendTargetId)?.title}
                  {suspendTarget === 'all-bots' && `${bots.length} ботов пользователя`}
                </p>
              </div>
            </div>

            {/* Тип блокировки */}
            <div style={{ marginBottom: '16px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '8px',
                  color: 'var(--text)',
                }}
              >
                Тип блокировки
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {(['warning', 'temporary', 'permanent'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setSuspendType(type)}
                    style={{
                      padding: '10px 16px',
                      background:
                        suspendType === type
                          ? `${SUSPENSION_TYPES[type].color}20`
                          : 'rgba(26, 34, 56, 0.5)',
                      color:
                        suspendType === type ? SUSPENSION_TYPES[type].color : 'var(--text-muted)',
                      border:
                        suspendType === type
                          ? `1px solid ${SUSPENSION_TYPES[type].color}`
                          : '1px solid var(--border)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s',
                    }}
                  >
                    {React.createElement(SUSPENSION_TYPES[type].icon, { size: 14 })}
                    {SUSPENSION_TYPES[type].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Длительность для временной блокировки */}
            {suspendType === 'temporary' && (
              <div style={{ marginBottom: '16px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 500,
                    marginBottom: '8px',
                    color: 'var(--text)',
                  }}
                >
                  Длительность (дней)
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[1, 3, 7, 14, 30, 90].map(days => (
                    <button
                      key={days}
                      onClick={() => setSuspendDuration(days)}
                      style={{
                        padding: '8px 14px',
                        background:
                          suspendDuration === days
                            ? 'rgba(239, 68, 68, 0.2)'
                            : 'rgba(26, 34, 56, 0.5)',
                        color: suspendDuration === days ? '#ef4444' : 'var(--text-muted)',
                        border:
                          suspendDuration === days
                            ? '1px solid #ef4444'
                            : '1px solid var(--border)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 500,
                      }}
                    >
                      {days}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Причина */}
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '8px',
                  color: 'var(--text)',
                }}
              >
                Причина блокировки *
              </label>
              <textarea
                value={suspendReason}
                onChange={e => setSuspendReason(e.target.value)}
                placeholder="Опишите причину блокировки..."
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(26, 34, 56, 0.5)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontSize: '14px',
                  resize: 'vertical',
                  minHeight: '100px',
                  outline: 'none',
                }}
              />
            </div>

            {/* Кнопки */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowSuspendModal(false)}
                style={{
                  padding: '12px 24px',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                Отмена
              </button>
              <button
                onClick={handleSuspend}
                disabled={suspendLoading || !suspendReason.trim()}
                style={{
                  padding: '12px 24px',
                  background: '#ef4444',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: suspendLoading || !suspendReason.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: suspendLoading || !suspendReason.trim() ? 0.6 : 1,
                }}
              >
                {suspendLoading ? (
                  <>
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        border: '2px solid #fff',
                        borderTop: '2px solid transparent',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                    Обработка...
                  </>
                ) : (
                  <>
                    <Ban size={16} />
                    Заблокировать
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardPage>
  );
}
