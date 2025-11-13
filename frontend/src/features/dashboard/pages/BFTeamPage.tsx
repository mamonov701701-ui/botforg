import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Shield,
  Clock,
  Search,
  Plus,
  X,
  Check,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Settings,
} from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import {
  getAllUsers,
  assignPlatformRole,
  updatePlatformRole,
  deletePlatformRole,
  removeTeamMember,
  getAvailableRoles,
  updateUserBaseRole,
  type User,
  type PlatformRole,
} from '../../../api/platformAdmin';
import { ROLES, ROLE_NAMES } from '../../../constants/roles';
import { toast } from '../../../utils/toast';

type SortField = 'id' | 'name' | 'email' | 'role' | 'platform_roles';
type SortDirection = 'asc' | 'desc' | null;

export default function BFTeamPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [availableRoles, setAvailableRoles] = useState<string[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showAddByIdModal, setShowAddByIdModal] = useState(false);

  useEffect(() => {
    loadData();
  }, [searchQuery]);

  // Сортировка данных
  const sortedUsers = useMemo(() => {
    if (!sortField || !sortDirection) return users;

    return [...users].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'id':
          aValue = a.public_id || a.id;
          bValue = b.public_id || b.id;
          break;
        case 'name':
          aValue = (a.name || '').toLowerCase();
          bValue = (b.name || '').toLowerCase();
          break;
        case 'email':
          aValue = a.email.toLowerCase();
          bValue = b.email.toLowerCase();
          break;
        case 'role':
          aValue = a.role.toLowerCase();
          bValue = b.role.toLowerCase();
          break;
        case 'platform_roles':
          // Сортируем по названиям ролей (отсортированным по алфавиту)
          // Если ролей нет - используем 'zzz' чтобы они были в конце
          if (a.platform_roles.length === 0) {
            aValue = 'zzz_no_roles';
          } else {
            aValue = a.platform_roles
              .map(r => r.role_name)
              .sort()
              .join(', ')
              .toLowerCase();
          }

          if (b.platform_roles.length === 0) {
            bValue = 'zzz_no_roles';
          } else {
            bValue = b.platform_roles
              .map(r => r.role_name)
              .sort()
              .join(', ')
              .toLowerCase();
          }
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [users, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Переключаем направление: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, rolesData] = await Promise.all([
        getAllUsers(searchQuery, true), // Всегда показываем только команду
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

      toast.success('Роль успешно назначена!');
      await loadData();
      setShowAssignModal(false);
      setShowAddByIdModal(false);
    } catch (error: any) {
      console.error('Assign role error:', error);
      const errorMsg =
        error.response?.data?.detail || error.message || 'Ошибка при назначении роли';
      toast.error(errorMsg);
    }
  };

  const handleUpdateBaseRole = async (userId: number, role: string) => {
    await updateUserBaseRole(userId, role);
    await loadData(); // Обновляем список после изменения роли
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
    if (!confirm('Вы уверены, что хотите удалить эту роль? Это действие нельзя отменить.')) return;

    try {
      await deletePlatformRole(roleId);
      toast.success('Роль успешно удалена!');
      await loadData(); // Обновляем список, но участник остается в списке
    } catch (error: any) {
      console.error('Failed to delete role:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Ошибка при удалении роли';
      toast.error(errorMsg);
    }
  };

  const handleRemoveTeamMember = async (userId: number, userName: string, hasRoles: boolean) => {
    if (!hasRoles) {
      alert('У этого пользователя нет BF-ролей. Удалять нечего.');
      return;
    }

    if (
      !confirm(
        `Вы уверены, что хотите удалить "${userName}" из команды?\n\nВсе BF-роли этого пользователя будут удалены. Это действие нельзя отменить.`
      )
    )
      return;

    try {
      await removeTeamMember(userId);
      alert('Участник успешно удален из команды!');
      await loadData();
    } catch (error: any) {
      console.error('Failed to remove team member:', error);
      const errorMsg =
        error.response?.data?.detail || error.message || 'Ошибка при удалении участника';
      alert(errorMsg);
    }
  };

  return (
    <DashboardPage
      title="BF Команда"
      subtitle="Управление пользователями платформы и назначение BF-ролей"
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          marginBottom: '24px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, maxWidth: '400px', minWidth: '250px' }}>
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
            placeholder="Поиск участника по email или имени..."
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
          Добавить участника
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
                <th
                  style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('id')}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 210, 76, 0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--card)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ID
                    {sortField === 'id' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp size={14} />
                      ) : (
                        <ArrowDown size={14} />
                      )
                    ) : (
                      <ArrowUpDown size={14} style={{ opacity: 0.3 }} />
                    )}
                  </div>
                </th>
                <th
                  style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('name')}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 210, 76, 0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--card)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Имя
                    {sortField === 'name' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp size={14} />
                      ) : (
                        <ArrowDown size={14} />
                      )
                    ) : (
                      <ArrowUpDown size={14} style={{ opacity: 0.3 }} />
                    )}
                  </div>
                </th>
                <th
                  style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('email')}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 210, 76, 0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--card)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Email
                    {sortField === 'email' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp size={14} />
                      ) : (
                        <ArrowDown size={14} />
                      )
                    ) : (
                      <ArrowUpDown size={14} style={{ opacity: 0.3 }} />
                    )}
                  </div>
                </th>
                <th
                  style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('role')}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 210, 76, 0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--card)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Базовая роль
                    {sortField === 'role' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp size={14} />
                      ) : (
                        <ArrowDown size={14} />
                      )
                    ) : (
                      <ArrowUpDown size={14} style={{ opacity: 0.3 }} />
                    )}
                  </div>
                </th>
                <th
                  style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('platform_roles')}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255, 210, 76, 0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--card)')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    BF-роли
                    {sortField === 'platform_roles' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp size={14} />
                      ) : (
                        <ArrowDown size={14} />
                      )
                    ) : (
                      <ArrowUpDown size={14} style={{ opacity: 0.3 }} />
                    )}
                  </div>
                </th>
                <th style={thStyle}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers && sortedUsers.length > 0 ? (
                sortedUsers.map(user => (
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
                        {user.public_id || user.id}
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
                        {ROLE_NAMES[user.role as keyof typeof ROLE_NAMES] || user.role}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      {user.platform_roles.length > 0 ? (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {user.platform_roles.map(role => (
                            <div
                              key={role.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 8px',
                                background: 'var(--primary)',
                                color: '#000',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600,
                              }}
                            >
                              <span>{role.role_name}</span>
                              <button
                                onClick={() => handleDeleteRole(role.id)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  padding: '0',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  color: '#000',
                                  opacity: 0.7,
                                }}
                                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                                onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
                                title="Удалить роль"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                          Нет ролей
                        </span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                          title="Настройки ролей"
                        >
                          <Settings size={14} />
                          Настройка
                        </button>

                        {/* Кнопка удаления участника (всегда видна) */}
                        <button
                          onClick={() =>
                            handleRemoveTeamMember(
                              user.id,
                              user.name || user.email,
                              user.platform_roles.length > 0
                            )
                          }
                          style={{
                            padding: '8px',
                            background:
                              user.platform_roles.length > 0
                                ? 'rgba(239, 68, 68, 0.1)'
                                : 'rgba(107, 114, 128, 0.1)',
                            color: user.platform_roles.length > 0 ? '#ef4444' : '#6b7280',
                            border:
                              user.platform_roles.length > 0
                                ? '1px solid rgba(239, 68, 68, 0.3)'
                                : '1px solid rgba(107, 114, 128, 0.2)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            opacity: user.platform_roles.length > 0 ? 1 : 0.5,
                          }}
                          title={
                            user.platform_roles.length > 0
                              ? 'Удалить участника из команды'
                              : 'У пользователя нет BF-ролей'
                          }
                          onMouseEnter={e => {
                            if (user.platform_roles.length > 0) {
                              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                            }
                          }}
                          onMouseLeave={e => {
                            if (user.platform_roles.length > 0) {
                              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                            }
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}
                  >
                    {loading
                      ? 'Загрузка...'
                      : searchQuery
                        ? 'Участников с таким именем или email не найдено'
                        : 'В команде пока нет участников. Нажмите "Добавить участника" для назначения BF-ролей.'}
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
          onUpdateBaseRole={handleUpdateBaseRole}
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
        <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Добавить участника в команду</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
          Введите 8-значный ID пользователя и назначьте ему BF-роль
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
              ID пользователя (8 цифр)
            </label>
            <input
              type="number"
              placeholder="Например: 97410876"
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
              Сохранить
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
  onUpdateBaseRole: (userId: number, role: string) => Promise<void>;
  onClose: () => void;
}

function AssignRoleModal({
  user,
  availableRoles,
  onAssign,
  onUpdateBaseRole,
  onClose,
}: AssignRoleModalProps) {
  const [selectedRole, setSelectedRole] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('');
  const [baseRole, setBaseRole] = useState(user.role);
  const [isUpdatingBaseRole, setIsUpdatingBaseRole] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;

    onAssign(user.id, selectedRole, expiresInDays ? Number(expiresInDays) : undefined);
  };

  const handleBaseRoleChange = async (newRole: string) => {
    if (newRole === user.role) return;

    setIsUpdatingBaseRole(true);
    try {
      await onUpdateBaseRole(user.id, newRole);
      setBaseRole(newRole);
      toast.success('Базовая роль успешно изменена!');
    } catch (error: any) {
      console.error('Failed to update base role:', error);
      const errorMsg =
        error.response?.data?.detail || error.message || 'Ошибка при изменении базовой роли';
      toast.error(errorMsg);
      setBaseRole(user.role); // Откатываем изменение
    } finally {
      setIsUpdatingBaseRole(false);
    }
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
        <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Настройки ролей</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
          Участник: <strong>{user.name || user.email}</strong> (ID: {user.public_id || user.id})
        </p>

        {/* Базовая роль */}
        <div
          style={{
            marginBottom: '24px',
            paddingBottom: '24px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Базовая роль в проекте
          </label>
          <select
            value={baseRole}
            onChange={e => handleBaseRoleChange(e.target.value)}
            disabled={isUpdatingBaseRole}
            style={{
              width: '100%',
              padding: '12px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text)',
              fontSize: '14px',
              opacity: isUpdatingBaseRole ? 0.6 : 1,
              cursor: isUpdatingBaseRole ? 'not-allowed' : 'pointer',
            }}
          >
            {Object.values(ROLES).map(role => (
              <option key={role} value={role}>
                {ROLE_NAMES[role] || role}
              </option>
            ))}
          </select>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
            Базовая роль определяет доступ к функциям платформы
          </p>
        </div>

        {/* BF-роли */}
        <form onSubmit={handleSubmit}>
          <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>BF-роли платформы</h3>
          <div style={{ marginBottom: '20px' }}>
            <label
              style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '14px',
                fontWeight: 600,
              }}
            >
              Добавить BF-роль
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
              Сохранить
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
