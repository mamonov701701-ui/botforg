import React, { useState } from 'react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import { useAuthStore } from '../../../stores/authStore';
import { hasAccessToAction } from '../../../constants/roles';
import { ROLE_NAMES, type RoleValue } from '../../../constants/roles';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: RoleValue;
  inviteStatus: 'active' | 'pending' | 'expired';
  lastActive?: Date;
  avatar?: string;
}

interface AuditEvent {
  id: string;
  type: 'invite' | 'role_change' | 'remove' | 'login';
  actor: string;
  target?: string;
  details: string;
  timestamp: Date;
}

function InviteMemberModal({
  onClose,
  onInvite,
}: {
  onClose: () => void;
  onInvite: (email: string, role: RoleValue) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RoleValue>('developer');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      onInvite(email, role);
      onClose();
    }
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '500px',
            width: '100%',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px' }}>
            Пригласить участника
          </h2>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '8px',
                }}
              >
                Email или username
              </label>
              <input
                type="text"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="user@example.com"
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: 'var(--text)',
                  outline: 'none',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 500,
                  marginBottom: '8px',
                }}
              >
                Роль
              </label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as RoleValue)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="admin">{ROLE_NAMES.admin}</option>
                <option value="developer">{ROLE_NAMES.developer}</option>
                <option value="templates_manager">{ROLE_NAMES.templates_manager}</option>
                <option value="support">{ROLE_NAMES.support}</option>
                <option value="viewer">{ROLE_NAMES.viewer}</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  color: 'var(--text)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                Отмена
              </button>
              <button
                type="submit"
                style={{
                  flex: 1,
                  padding: '12px 24px',
                  background: 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
              >
                Пригласить
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

function ConfirmModal({
  title,
  message,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '400px',
          width: '100%',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '12px' }}>{title}</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>{message}</p>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '12px 24px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              color: 'var(--text)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '12px 24px',
              background: 'var(--error)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#dc2626')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--error)')}
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const { user } = useAuthStore();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [auditDateFrom, setAuditDateFrom] = useState('');

  // Моковые данные
  const mockTeam: TeamMember[] = [
    {
      id: '1',
      name: 'Иван Петров',
      email: 'ivan@example.com',
      role: 'admin',
      inviteStatus: 'active',
      lastActive: new Date(Date.now() - 1000 * 60 * 15),
    },
    {
      id: '2',
      name: 'Мария Сидорова',
      email: 'maria@example.com',
      role: 'developer',
      inviteStatus: 'active',
      lastActive: new Date(Date.now() - 1000 * 60 * 60 * 3),
    },
    {
      id: '3',
      name: 'Алексей Кузнецов',
      email: 'alex@example.com',
      role: 'viewer',
      inviteStatus: 'pending',
    },
  ];

  const mockAuditLog: AuditEvent[] = [
    {
      id: '1',
      type: 'invite',
      actor: 'Вы',
      target: 'alex@example.com',
      details: 'Приглашён как Наблюдатель',
      timestamp: new Date(Date.now() - 1000 * 60 * 30),
    },
    {
      id: '2',
      type: 'role_change',
      actor: 'Вы',
      target: 'Мария Сидорова',
      details: 'Роль изменена с Viewer на Developer',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    },
    {
      id: '3',
      type: 'login',
      actor: 'Иван Петров',
      details: 'Вход в систему',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
    },
  ];

  const statusColors = {
    active: { bg: '#10b98120', color: '#10b981', label: 'Активен' },
    pending: { bg: '#f59e0b20', color: '#f59e0b', label: 'Ожидает' },
    expired: { bg: '#6b728020', color: '#6b7280', label: 'Истёк' },
  };

  const eventIcons = {
    invite: '📨',
    role_change: '🔄',
    remove: '🗑️',
    login: '🔐',
  };

  const formatRelativeTime = (date: Date) => {
    const minutes = Math.floor((Date.now() - date.getTime()) / (1000 * 60));
    if (minutes < 60) return `${minutes} мин назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч назад`;
    const days = Math.floor(hours / 24);
    return `${days} дн назад`;
  };

  const canInvite = hasAccessToAction(user?.role, 'team_invite');
  const canEditRole = hasAccessToAction(user?.role, 'team_edit_role');
  const canRemove = hasAccessToAction(user?.role, 'team_remove');

  const handleInvite = (email: string, role: RoleValue) => {
    console.log(`Invite: ${email} as ${role}`);
    // TODO: Реализовать приглашение
  };

  const handleChangeRole = (memberId: string, newRole: RoleValue) => {
    console.log(`Change role: ${memberId} to ${newRole}`);
    // TODO: Реализовать смену роли
  };

  const handleDeactivate = (memberId: string) => {
    console.log(`Deactivate: ${memberId}`);
    // TODO: Реализовать деактивацию
  };

  const handleRemove = (memberId: string) => {
    console.log(`Remove: ${memberId}`);
    setConfirmDelete(null);
    // TODO: Реализовать удаление
  };

  // Фильтрация аудит-лога
  const filteredAuditLog = mockAuditLog.filter(event => {
    if (filterType !== 'all' && event.type !== filterType) return false;
    if (auditDateFrom && event.timestamp < new Date(auditDateFrom)) return false;
    return true;
  });

  return (
    <DashboardPage
      title="Команда"
      subtitle={`Участников: ${mockTeam.length}`}
      actions={
        canInvite ? (
          <button
            onClick={() => setShowInviteModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              background: 'var(--primary)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
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
            <span>➕</span>
            Пригласить
          </button>
        ) : undefined
      }
    >
      {/* Таблица участников */}
      <Card style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Участники</h3>

        {mockTeam.length === 0 ? (
          <EmptyState
            icon="👥"
            title="Команда пуста"
            description="Пригласите первого участника для совместной работы"
            action={
              canInvite
                ? {
                    label: 'Пригласить участника',
                    onClick: () => setShowInviteModal(true),
                  }
                : undefined
            }
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            {/* Заголовки */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 2fr 1.5fr 1.5fr 1.5fr 1fr',
                gap: '16px',
                padding: '12px 16px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div>Имя</div>
              <div>Email</div>
              <div>Роль</div>
              <div>Статус</div>
              <div>Последняя активность</div>
              <div>Действия</div>
            </div>

            {/* Строки */}
            {mockTeam.map(member => (
              <div
                key={member.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 2fr 1.5fr 1.5fr 1.5fr 1fr',
                  gap: '16px',
                  padding: '16px',
                  borderBottom: '1px solid var(--border)',
                  alignItems: 'center',
                  fontSize: '14px',
                }}
              >
                <div style={{ fontWeight: 600 }}>{member.name}</div>
                <div style={{ color: 'var(--text-muted)' }}>{member.email}</div>
                <div>
                  {canEditRole ? (
                    <select
                      value={member.role}
                      onChange={e => handleChangeRole(member.id, e.target.value as RoleValue)}
                      style={{
                        padding: '6px 10px',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        fontSize: '13px',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        outline: 'none',
                      }}
                    >
                      <option value="admin">{ROLE_NAMES.admin}</option>
                      <option value="developer">{ROLE_NAMES.developer}</option>
                      <option value="templates_manager">{ROLE_NAMES.templates_manager}</option>
                      <option value="support">{ROLE_NAMES.support}</option>
                      <option value="viewer">{ROLE_NAMES.viewer}</option>
                    </select>
                  ) : (
                    <span>{ROLE_NAMES[member.role]}</span>
                  )}
                </div>
                <div>
                  <span
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 500,
                      background: statusColors[member.inviteStatus].bg,
                      color: statusColors[member.inviteStatus].color,
                    }}
                  >
                    {statusColors[member.inviteStatus].label}
                  </span>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                  {member.lastActive ? formatRelativeTime(member.lastActive) : '—'}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {member.inviteStatus === 'active' && (
                    <button
                      onClick={() => handleDeactivate(member.id)}
                      style={{
                        padding: '6px 12px',
                        background: 'transparent',
                        border: '1px solid var(--border)',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        color: 'var(--text)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      title="Деактивировать"
                    >
                      ⏸
                    </button>
                  )}
                  {canRemove && (
                    <button
                      onClick={() => setConfirmDelete(member.id)}
                      style={{
                        padding: '6px 12px',
                        background: 'transparent',
                        border: '1px solid var(--error-border)',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        color: 'var(--error)',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#ef444410')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      title="Удалить"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Аудит-лог */}
      <Card>
        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Аудит-лог</h3>

        {/* Фильтры */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            marginBottom: '16px',
            flexWrap: 'wrap',
          }}
        >
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            style={{
              padding: '8px 12px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '13px',
              color: 'var(--text)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="all">Все типы</option>
            <option value="invite">Приглашения</option>
            <option value="role_change">Смена роли</option>
            <option value="remove">Удаление</option>
            <option value="login">Вход</option>
          </select>

          <input
            type="date"
            value={auditDateFrom}
            onChange={e => setAuditDateFrom(e.target.value)}
            style={{
              padding: '8px 12px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '13px',
              color: 'var(--text)',
              outline: 'none',
            }}
          />
        </div>

        {/* События */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredAuditLog.map(event => (
            <div
              key={event.id}
              style={{
                display: 'flex',
                gap: '12px',
                padding: '12px',
                background: 'var(--card)',
                borderRadius: '8px',
                alignItems: 'center',
              }}
            >
              <div style={{ fontSize: '20px' }}>{eventIcons[event.type]}</div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '14px', marginBottom: '2px' }}>
                  <strong>{event.actor}</strong>
                  {event.target && (
                    <>
                      {' → '}
                      <strong>{event.target}</strong>
                    </>
                  )}
                </p>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{event.details}</p>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {formatRelativeTime(event.timestamp)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Модалки */}
      {showInviteModal && (
        <InviteMemberModal onClose={() => setShowInviteModal(false)} onInvite={handleInvite} />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Удалить участника?"
          message="Это действие нельзя отменить. Участник потеряет доступ ко всем разделам."
          onConfirm={() => handleRemove(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </DashboardPage>
  );
}
