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
  createObjectEnforcement,
  resolveObjectEnforcement,
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
type EnforcementTarget =
  | 'user'
  | 'bot'
  | 'all-bots'
  | 'listing'
  | 'scenario'
  | 'template'
  | 'market_item';

const actionLabel = (type: 'warning' | 'temporary' | 'permanent') =>
  type === 'warning'
    ? 'Вынести предупреждение'
    : type === 'temporary'
      ? 'Заблокировать временно'
      : 'Заблокировать';

const lifecycleLabel = (value: string | null) =>
  value === 'published'
    ? 'Опубликовано'
    : value === 'archived'
      ? 'Архивировано'
      : value === 'draft'
        ? 'Черновик'
        : 'Нет карточки';
const reviewLabel = (value: string) =>
  (
    ({
      draft: 'Черновик',
      pending: 'Ожидает проверки',
      approved: 'Одобрено',
      rejected: 'Отклонено',
      needs_changes: 'Нужны изменения',
      security_review_failed: 'Проверка безопасности не пройдена',
    }) as Record<string, string>
  )[value] || 'Не определено';

export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userInfo, setUserInfo] = useState<UserDetailedInfo | null>(null);
  const [userSuspension, setUserSuspension] = useState<SuspensionInfo | null>(null);

  // Модальное окно блокировки
  const [showSuspendModal, setShowSuspendModal] = useState(false);
  const [suspendTarget, setSuspendTarget] = useState<EnforcementTarget>('user');
  const [suspendTargetId, setSuspendTargetId] = useState<number | null>(null);
  const [inspectBotId, setInspectBotId] = useState<number | null>(null);
  const [suspendType, setSuspendType] = useState<'warning' | 'temporary' | 'permanent'>('warning');
  const [suspendReason, setSuspendReason] = useState('');
  const [suspendDuration, setSuspendDuration] = useState(7);
  const [suspendLoading, setSuspendLoading] = useState(false);
  const [marketRestrictionReason, setMarketRestrictionReason] = useState('');
  const [marketRestrictionDays, setMarketRestrictionDays] = useState(7);
  const [marketRestrictionLoading, setMarketRestrictionLoading] = useState(false);

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

  const openSuspendModal = (target: EnforcementTarget, targetId?: number) => {
    setSuspendTarget(target);
    setSuspendTargetId(targetId || null);
    setSuspendType('warning');
    setSuspendReason('');
    setSuspendDuration(7);
    setShowSuspendModal(true);
  };

  const handleSuspend = async () => {
    if (!suspendReason.trim()) {
      toast.error('Укажите причину меры');
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
        await loadUserSuspension(parseInt(userId));
      } else if (suspendTarget === 'bot' && suspendTargetId) {
        await suspendBot(suspendTargetId, data);
      } else if (suspendTarget === 'all-bots' && userId) {
        await suspendAllUserBots(parseInt(userId), data);
      } else if (
        suspendTargetId &&
        ['listing', 'scenario', 'template', 'market_item'].includes(suspendTarget)
      ) {
        await createObjectEnforcement({
          subject_type: suspendTarget as 'listing' | 'scenario' | 'template' | 'market_item',
          subject_id: suspendTargetId,
          action: suspendType === 'warning' ? 'warning' : 'suspend_object',
          reason: suspendReason.trim(),
          ...(suspendType === 'temporary' && { duration_days: suspendDuration }),
        });
      }

      toast.success(suspendType === 'warning' ? 'Предупреждение вынесено' : 'Мера применена');
      if (userId) await loadUserInfo(parseInt(userId));

      setShowSuspendModal(false);
    } catch (error: any) {
      console.error('Failed to suspend:', error);
      toast.error(error.message || 'Не удалось применить меру');
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
      loadUserInfo(parseInt(userId));
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

  const handleResolveEnforcement = async (id: number) => {
    if (!userId) return;
    try {
      await resolveObjectEnforcement(id);
      toast.success('Мера снята');
      await loadUserInfo(parseInt(userId));
    } catch (error: any) {
      toast.error(error.message || 'Не удалось снять меру');
    }
  };

  const handleMarketRestriction = async () => {
    if (!userId || marketRestrictionReason.trim().length < 5) {
      toast.error('Укажите причину ограничения (не менее 5 символов)');
      return;
    }
    try {
      setMarketRestrictionLoading(true);
      await createObjectEnforcement({
        subject_type: 'user',
        subject_id: Number(userId),
        action: 'temporary_market_restriction',
        reason: marketRestrictionReason.trim(),
        duration_days: marketRestrictionDays,
      });
      setMarketRestrictionReason('');
      toast.success('Ограничение Маркета применено');
      await loadUserInfo(Number(userId));
    } catch (error: any) {
      toast.error(error.message || 'Не удалось ограничить Маркет');
    } finally {
      setMarketRestrictionLoading(false);
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
  const templates = userInfo.templates ?? [];
  const customBlocks = userInfo.custom_blocks ?? [];
  const receivedBlocks = userInfo.received_custom_blocks ?? [];
  const blockSummary = userInfo.custom_block_summary;
  const marketplaceListings = userInfo.marketplace_listings ?? [];
  const marketItems = userInfo.market_items ?? [];
  const disputes = userInfo.disputes ?? [];
  const reports = userInfo.reports ?? [];
  const enforcements = userInfo.enforcements ?? [];
  const activeMarketRestriction = enforcements.find(
    row =>
      ['temporary_market_restriction', 'prohibit_commercial_market_activity'].includes(
        row.action
      ) &&
      !row.revoked_at &&
      (!row.expires_at || new Date(row.expires_at).getTime() > Date.now())
  );
  const activePaidRestriction = enforcements.some(
    row =>
      row.action === 'prohibit_paid_listings' &&
      !row.revoked_at &&
      (!row.expires_at || new Date(row.expires_at).getTime() > Date.now())
  );

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
            <div style={{ fontSize: '14px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Имя: </span>
              <span>{user.name || 'Не указано'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Mail size={16} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Email:</span>
              <span style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 500 }}>
                {user.email}
              </span>
            </div>
            <div style={{ fontSize: '14px' }}>
              <span style={{ color: 'var(--text-muted)' }}>User ID: </span>
              <span>{user.id}</span>
            </div>
            <div style={{ fontSize: '14px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Публичный ID: </span>
              <span>{user.public_id}</span>
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
            <div style={{ fontSize: '14px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Статус аккаунта: </span>
              <span>
                {(userSuspension?.is_suspended ?? user.is_suspended) ? 'Заблокирован' : 'Активен'}
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

      <div className="grid min-w-0 gap-4 md:grid-cols-2" style={{ marginBottom: '24px' }}>
        <Card>
          <h3 className="mb-3 text-lg font-semibold">Сценарии ({scenarios.length})</h3>
          {scenarios.length ? (
            scenarios.map(row => (
              <p key={row.id} className="mb-2 text-sm">
                {row.name} · ID {row.id} ·{' '}
                <button
                  type="button"
                  className="underline"
                  onClick={() => openSuspendModal('scenario', row.id)}
                >
                  Вынести предупреждение
                </button>
              </p>
            ))
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Сценариев пока нет.</p>
          )}
        </Card>
        <Card>
          <h3 className="mb-3 text-lg font-semibold">Шаблоны ({templates.length})</h3>
          {templates.length ? (
            templates.map(row => (
              <p key={row.id} className="mb-2 text-sm">
                {row.name} · ID {row.id} · {row.is_public ? 'Публичный' : 'Приватный'} ·{' '}
                <button
                  type="button"
                  className="underline"
                  onClick={() => openSuspendModal('template', row.id)}
                >
                  Вынести предупреждение
                </button>
              </p>
            ))
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Шаблонов пока нет.</p>
          )}
        </Card>
        <Card>
          <h3 className="mb-3 text-lg font-semibold">Кастомные блоки — сводка</h3>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {(
              [
                ['Создано блоков', blockSummary?.created_blocks],
                ['Опубликованных версий', blockSummary?.published_versions],
                ['Черновиков', blockSummary?.draft_versions],
                ['Архивных', blockSummary?.archived_versions],
                ['Размещено в Маркете', blockSummary?.marketplace_listings],
                ['Free', blockSummary?.free_listings],
                ['Paid', blockSummary?.paid_listings],
                ['Получено из Маркета', blockSummary?.received_marketplace],
                ['Получено напрямую', blockSummary?.received_direct],
                ['Источник не установлен', blockSummary?.received_unverified],
                ['Установлено в библиотеку', blockSummary?.library_installs],
                ['Активных прав', blockSummary?.active_rights],
                ['Отозванных прав', blockSummary?.revoked_rights],
              ] as const
            ).map(([label, count]) => (
              <p key={label}>
                {label}: {count ?? 0}
              </p>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 text-lg font-semibold">
            Созданные пользователем ({customBlocks.length})
          </h3>
          {customBlocks.length ? (
            customBlocks.map(block => (
              <div
                key={block.id}
                className="mb-3 min-w-0 border-b border-[var(--border)] pb-2 text-sm"
              >
                <p className="font-semibold break-words">
                  {block.title} · ID {block.id}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Создан{' '}
                  {block.created_at ? new Date(block.created_at).toLocaleDateString('ru-RU') : '—'}
                </p>
                {block.versions.map(version => (
                  <p key={version.id} className="mt-1 break-words text-[var(--text-muted)]">
                    v{version.version} · {lifecycleLabel(version.status)} · проверка:{' '}
                    {reviewLabel(version.review_state)} · Маркет:{' '}
                    {lifecycleLabel(version.marketplace_lifecycle)}
                    {version.commercial_mode === 'paid'
                      ? ' · Paid'
                      : version.commercial_mode === 'free'
                        ? ' · Free'
                        : ''}{' '}
                    · активных прав: {version.active_grants_count ?? 0}
                  </p>
                ))}
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Созданных блоков пока нет.</p>
          )}
          <p className="text-xs text-[var(--text-muted)]">
            Санкции для самой версии блока пока не поддерживаются. Для размещения используйте
            действие в разделе «Активность в Маркете».
          </p>
        </Card>
        <Card>
          <h3 className="mb-3 text-lg font-semibold">
            Полученные пользователем ({receivedBlocks.length})
          </h3>
          {receivedBlocks.length ? (
            receivedBlocks.map(row => (
              <p
                key={row.grant_id}
                className="mb-3 break-words border-b border-[var(--border)] pb-2 text-sm"
              >
                {row.title} · v{row.version} · автор:{' '}
                {row.original_author_name || `ID ${row.original_author_user_id}`} ·{' '}
                {row.source_channel === 'direct'
                  ? 'Получено напрямую'
                  : row.source_channel === 'unknown'
                    ? 'Источник не установлен'
                    : 'Получено из Маркета'}{' '}
                · {row.grant_status === 'active' ? 'Доступ действует' : 'Доступ отозван'} ·{' '}
                {row.is_installed ? 'Установлено' : 'Не установлено'} · право распространения:{' '}
                {row.has_distribution_right ? 'да' : 'нет'}
                {row.listing_lifecycle
                  ? ` · Карточка: ${lifecycleLabel(row.listing_lifecycle)}`
                  : ''}
                {row.current_commercial_mode === 'paid'
                  ? ' · Текущие условия карточки: Paid'
                  : row.current_commercial_mode === 'free'
                    ? ' · Текущие условия карточки: Free'
                    : ''}
              </p>
            ))
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Полученных блоков пока нет.</p>
          )}
        </Card>
        <Card>
          <h3 className="mb-3 text-lg font-semibold">Активность в Маркете</h3>
          {marketplaceListings.map(row => (
            <p key={`listing-${row.id}`} className="mb-2 break-words text-sm">
              {row.title} · ID {row.id} · v{row.version ?? '—'} ·{' '}
              {row.commercial_mode === 'paid'
                ? `Платно · ${row.price_amount} ${row.price_currency}`
                : row.commercial_mode === 'free'
                  ? 'Бесплатно'
                  : 'Условия прежней модели'}{' '}
              · {lifecycleLabel(row.lifecycle)} · создана{' '}
              {row.created_at ? new Date(row.created_at).toLocaleDateString('ru-RU') : '—'} ·
              активных прав: {row.active_grants_count ?? 0} ·{' '}
              <button
                type="button"
                className="underline"
                onClick={() => openSuspendModal('listing', row.id)}
              >
                Применить меру
              </button>
            </p>
          ))}
          {marketItems.map(row => (
            <p key={`item-${row.id}`} className="mb-2 text-sm">
              {row.title} · {row.item_type} · {row.price} ₽ ·{' '}
              {row.is_published ? 'Опубликовано' : 'Не опубликовано'} ·{' '}
              <button
                type="button"
                className="underline"
                onClick={() => openSuspendModal('market_item', row.id)}
              >
                Применить меру
              </button>
            </p>
          ))}
          {!marketplaceListings.length && !marketItems.length && (
            <p className="text-sm text-[var(--text-muted)]">Размещений пока нет.</p>
          )}
        </Card>
        <Card>
          <h3 className="mb-3 text-lg font-semibold">Жалобы и споры</h3>
          {reports.map(row => (
            <p key={`report-${row.id}`} className="mb-2 text-sm">
              Жалоба #{row.id} · {row.subject_type} #{row.subject_id} · {row.status}
            </p>
          ))}
          {disputes.map(row => (
            <p key={`dispute-${row.id}`} className="mb-2 text-sm">
              Спор #{row.id} · карточка #{row.listing_id} · {row.status}
            </p>
          ))}
          {!reports.length && !disputes.length && (
            <p className="text-sm text-[var(--text-muted)]">Жалоб и споров пока нет.</p>
          )}
        </Card>
        <Card>
          <h3 className="mb-3 text-lg font-semibold">Ограничение Маркета и история мер</h3>
          <p className="mb-2 text-sm">
            Маркет:{' '}
            {activeMarketRestriction
              ? 'ограничен'
              : activePaidRestriction
                ? 'запрещены новые платные карточки'
                : 'без ограничения'}
          </p>
          {!activeMarketRestriction && (
            <div className="mb-4 flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 text-sm">
                Причина ограничения
                <input
                  aria-label="Причина ограничения Маркета"
                  className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] p-2 text-[var(--text)]"
                  value={marketRestrictionReason}
                  onChange={event => setMarketRestrictionReason(event.target.value)}
                />
              </label>
              <label className="text-sm">
                Срок, дней
                <select
                  aria-label="Срок ограничения Маркета"
                  className="mt-1 block rounded border border-[var(--border)] bg-[var(--surface)] p-2 text-[var(--text)]"
                  value={marketRestrictionDays}
                  onChange={event => setMarketRestrictionDays(Number(event.target.value))}
                >
                  {[1, 3, 7, 14, 30, 90].map(days => (
                    <option key={days} value={days}>
                      {days}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="bf-danger-cta"
                disabled={marketRestrictionLoading || marketRestrictionReason.trim().length < 5}
                onClick={() => void handleMarketRestriction()}
              >
                Ограничить Маркет
              </button>
            </div>
          )}
          {enforcements.length ? (
            enforcements.map(row => (
              <p key={row.id} className="mb-2 text-sm">
                {row.action === 'warning'
                  ? 'Предупреждение'
                  : row.action === 'suspend_object'
                    ? 'Блокировка объекта'
                    : row.action === 'temporary_market_restriction'
                      ? 'Временное ограничение Маркета'
                      : row.action === 'prohibit_commercial_market_activity'
                        ? 'Запрет коммерческой деятельности в Маркете'
                        : row.action === 'prohibit_paid_listings'
                          ? 'Запрет платных размещений'
                          : row.action}{' '}
                · {row.subject_type} #{row.subject_id} · {row.reason} · администратор #
                {row.actor_user_id}
                {row.created_at && ` · ${new Date(row.created_at).toLocaleString('ru-RU')}`}
                {row.expires_at && ` · до ${new Date(row.expires_at).toLocaleString('ru-RU')}`}
                {row.revoked_at
                  ? ` · снята ${new Date(row.revoked_at).toLocaleString('ru-RU')}`
                  : row.expires_at && new Date(row.expires_at).getTime() <= Date.now()
                    ? ' · срок истёк'
                    : ' · действует'}
                {!row.revoked_at &&
                  (!row.expires_at || new Date(row.expires_at).getTime() > Date.now()) && (
                    <button
                      type="button"
                      className="ml-2 underline"
                      onClick={() => void handleResolveEnforcement(row.id)}
                    >
                      Снять меру
                    </button>
                  )}
              </p>
            ))
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Мер пока нет.</p>
          )}
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
                    {(bot.is_suspended || bot.suspension_type === 'warning') && (
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
                        {bot.is_suspended
                          ? bot.suspension_type === 'temporary' && bot.suspended_until
                            ? `Временно заблокирован до ${new Date(bot.suspended_until).toLocaleString('ru-RU')}`
                            : 'Постоянно заблокирован'
                          : 'Предупреждение вынесено'}
                      </span>
                    )}
                    {bot.is_active ? (
                      <CheckCircle size={16} style={{ color: '#22c55e' }} />
                    ) : (
                      <XCircle size={16} style={{ color: '#ef4444' }} />
                    )}
                  </div>
                </div>
                {bot.suspension_reason &&
                  (bot.is_suspended || bot.suspension_type === 'warning') && (
                    <p className="mb-3 text-sm text-[var(--text-muted)]">
                      Причина: {bot.suspension_reason}
                    </p>
                  )}
                {inspectBotId === bot.id && (
                  <div
                    className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm"
                    role="region"
                    aria-label={`Информация о боте ${bot.title}`}
                  >
                    <p>
                      Бот #{bot.id} · владелец #{user.id}
                    </p>
                    <p>
                      Создан:{' '}
                      {bot.created_at
                        ? new Date(bot.created_at).toLocaleString('ru-RU')
                        : 'нет данных'}
                    </p>
                    <p>
                      Пользователей: {bot.users_count} · сообщений: {bot.messages_count}
                    </p>
                  </div>
                )}
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
                    onClick={() => setInspectBotId(inspectBotId === bot.id ? null : bot.id)}
                    aria-expanded={inspectBotId === bot.id}
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
            role="dialog"
            aria-modal="true"
            aria-label="Административная мера"
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bf-shell-bg-solid)',
              borderRadius: '16px',
              padding: '24px',
              width: '100%',
              maxWidth: '480px',
              maxHeight: 'calc(100vh - 32px)',
              overflowY: 'auto',
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
                  {suspendTarget === 'listing' && 'Мера для размещения'}
                  {suspendTarget === 'scenario' && 'Мера для сценария'}
                  {suspendTarget === 'template' && 'Предупреждение для шаблона'}
                  {suspendTarget === 'market_item' && 'Мера для объекта Маркета'}
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                  {suspendTarget === 'user' && user.email}
                  {suspendTarget === 'bot' && bots.find(b => b.id === suspendTargetId)?.title}
                  {suspendTarget === 'all-bots' && `${bots.length} ботов пользователя`}
                  {['listing', 'scenario', 'template', 'market_item'].includes(suspendTarget) &&
                    `Объект #${suspendTargetId}`}
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
                Тип меры
              </label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {(['template', 'scenario'].includes(suspendTarget)
                  ? (['warning'] as const)
                  : (['warning', 'temporary', 'permanent'] as const)
                ).map(type => (
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
                Причина меры (видна владельцу объекта) *
              </label>
              <textarea
                value={suspendReason}
                onChange={e => setSuspendReason(e.target.value)}
                placeholder="Опишите причину меры..."
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--surface)',
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
                    {actionLabel(suspendType)}
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
