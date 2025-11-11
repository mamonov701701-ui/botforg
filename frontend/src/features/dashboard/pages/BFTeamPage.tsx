import React, { useState, useEffect } from 'react';
import { Users, Shield, Clock, Search, Plus, X, Check } from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import {
  getAllUsers,
  assignPlatformRole,
  updatePlatformRole,
  deletePlatformRole,
  getAvailableRoles,
  type User,
  type PlatformRole,
} from '../../../api/platformAdmin';

export default function BFTeamPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showAddByIdModal, setShowAddByIdModal] = useState(false);

  useEffect(() => {
    loadData();
  }, [searchQuery]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, rolesData] = await Promise.all([
        getAllUsers(searchQuery),
        getAvailableRoles(),
      ]);
      setUsers(usersData || []);
      setAvailableRoles(rolesData || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      setUsers([]);
      setAvailableRoles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignRole = async (userId: number, roleName: string, expiresInDays?: number) => {
    try {
      const expires_at = expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      console.log('Assigning role:', { user_id: userId, role_name: roleName, expires_at });

      await assignPlatformRole({
        user_id: userId,
        role_name: roleName,
        expires_at,
      });

      alert('Роль успешно назначена!');
      await loadData();
      setShowAssignModal(false);
      setShowAddByIdModal(false);
    } catch (error: any) {
      console.error('Assign role error:', error);
      const errorMsg =
        error.response?.data?.detail || error.message || 'Ошибка при назначении роли';
      alert(errorMsg);
    }
  };

  const handleToggleRole = async (roleId: number, isActive: boolean) => {
    try {
      await updatePlatformRole(roleId, { is_active: !isActive });
      await loadData();
    } catch (error) {
      console.error('Failed to toggle role:', error);
    }
  };

  const handleDeleteRole = async (roleId: number) => {
    if (!confirm('Удалить эту роль?')) return;

    try {
      await deletePlatformRole(roleId);
      await loadData();
    } catch (error) {
      console.error('Failed to delete role:', error);
    }
  };

  return (
    <DashboardPage
      title="BF Команда"
      subtitle="Управление пользователями платформы и назначение BF-ролей"
    >
      {/* Toolbar */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'center' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
          <Search
            size={20}
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
            placeholder="Поиск по email или имени..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 12px 12px 44px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text)',
              fontSize: '14px',
            }}
          />
        </div>

        {/* Add by ID button */}
        <button
          onClick={() => setShowAddByIdModal(true)}
          style={{
            padding: '12px 20px',
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
            whiteSpace: 'nowrap',
          }}
        >
          <Plus size={18} />
          Добавить по ID
        </button>
      </div>

      {/* Users Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          Загрузка...
        </div>
      ) : (
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid var(--border)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Имя</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Базовая роль</th>
                <th style={thStyle}>BF-роли</th>
                <th style={thStyle}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {users && users.length > 0 ? (
                users.map(user => (
                  <tr
                    key={user.id}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={tdStyle}>
                      <span
                        style={{
                          fontFamily: 'monospace',
                          color: 'var(--primary)',
                          fontSize: '13px',
                        }}
                      >
                        #{user.id}
                      </span>
                    </td>
                    <td style={tdStyle}>{user.name || '—'}</td>
                    <td style={tdStyle}>{user.email}</td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          padding: '4px 8px',
                          background: getRoleColor(user.role),
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 500,
                        }}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {user.platform_roles.length > 0 ? (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {user.platform_roles.map((role, idx) => (
                            <span
                              key={idx}
                              style={{
                                padding: '4px 8px',
                                background: 'var(--primary)',
                                color: '#000',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600,
                              }}
                            >
                              {role}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                          Нет ролей
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowAssignModal(true);
                        }}
                        style={{
                          padding: '6px 12px',
                          background: 'var(--primary)',
                          color: '#000',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <Plus size={14} />
                        Роль
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}
                  >
                    {loading ? 'Загрузка...' : 'Пользователи не найдены'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Assign Role Modal */}
      {showAssignModal && selectedUser && (
        <AssignRoleModal
          user={selectedUser}
          availableRoles={availableRoles}
          onAssign={handleAssignRole}
          onClose={() => {
            setShowAssignModal(false);
            setSelectedUser(null);
          }}
        />
      )}

      {/* Add by ID Modal */}
      {showAddByIdModal && (
        <AddByIdModal
          availableRoles={availableRoles}
          onAssign={handleAssignRole}
          onClose={() => setShowAddByIdModal(false)}
        />
      )}
    </DashboardPage>
  );
}

// === Модальное окно добавления по ID ===

interface AddByIdModalProps {
  availableRoles: string[];
  onAssign: (userId: number, roleName: string, expiresInDays?: number) => void;
  onClose: () => void;
}

function AddByIdModal({ availableRoles, onAssign, onClose }: AddByIdModalProps) {
  const [userId, setUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !selectedRole) return;

    onAssign(Number(userId), selectedRole, expiresInDays ? Number(expiresInDays) : undefined);
  };

  return (
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
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: '12px',
          padding: '32px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Назначить роль по ID</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
          Введите ID пользователя и выберите BF-роль
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              ID пользователя
            </label>
            <input
              type="number"
              placeholder="Например: 130"
              value={userId}
              onChange={e => setUserId(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text)',
                fontSize: '14px',
                fontFamily: 'monospace',
              }}
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              Выберите роль
            </label>
            <select
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text)',
                fontSize: '14px',
              }}
            >
              <option value="">Выберите роль...</option>
              {availableRoles.map(role => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              Срок действия (дней, необязательно)
            </label>
            <input
              type="number"
              min="1"
              placeholder="Бессрочно"
              value={expiresInDays}
              onChange={e => setExpiresInDays(e.target.value ? Number(e.target.value) : '')}
              style={{
                width: '100%',
                padding: '12px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text)',
                fontSize: '14px',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="submit"
              style={{
                flex: 1,
                padding: '12px',
                background: 'var(--primary)',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Назначить роль
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px',
                background: 'var(--card)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// === Модальное окно назначения роли ===

interface AssignRoleModalProps {
  user: User;
  availableRoles: string[];
  onAssign: (userId: number, roleName: string, expiresInDays?: number) => void;
  onClose: () => void;
}

function AssignRoleModal({ user, availableRoles, onAssign, onClose }: AssignRoleModalProps) {
  const [selectedRole, setSelectedRole] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;

    onAssign(user.id, selectedRole, expiresInDays ? Number(expiresInDays) : undefined);
  };

  return (
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
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: '12px',
          padding: '32px',
          maxWidth: '500px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Назначить BF-роль</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
          Пользователь: <strong>{user.name || user.email}</strong> (ID: #{user.id})
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              Выберите роль
            </label>
            <select
              value={selectedRole}
              onChange={e => setSelectedRole(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text)',
                fontSize: '14px',
              }}
            >
              <option value="">Выберите роль...</option>
              {availableRoles.map(role => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              Срок действия (дней, необязательно)
            </label>
            <input
              type="number"
              min="1"
              placeholder="Бессрочно"
              value={expiresInDays}
              onChange={e => setExpiresInDays(e.target.value ? Number(e.target.value) : '')}
              style={{
                width: '100%',
                padding: '12px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text)',
                fontSize: '14px',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="submit"
              style={{
                flex: 1,
                padding: '12px',
                background: 'var(--primary)',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Назначить роль
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px',
                background: 'var(--card)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Отмена
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// === Helpers ===

const thStyle: React.CSSProperties = {
  padding: '16px',
  textAlign: 'left',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const tdStyle: React.CSSProperties = {
  padding: '16px',
  fontSize: '14px',
};

function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    owner: 'rgba(255, 215, 0, 0.2)',
    admin: 'rgba(59, 130, 246, 0.2)',
    developer: 'rgba(16, 185, 129, 0.2)',
    templates_manager: 'rgba(139, 92, 246, 0.2)',
    support: 'rgba(245, 158, 11, 0.2)',
    viewer: 'rgba(107, 114, 128, 0.2)',
    user: 'rgba(75, 85, 99, 0.2)',
  };
  return colors[role] || 'rgba(107, 114, 128, 0.2)';
}
