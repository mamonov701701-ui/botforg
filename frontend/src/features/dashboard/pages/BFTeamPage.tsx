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
  Edit,
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
  assignBaseRole,
  updateBaseRole,
  deleteBaseRole,
  type User,
  type PlatformRole,
  type BaseRoleListItem,
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
      console.log('[BFTeamPage] Loading team data with search:', searchQuery);
      const [usersResponse, rolesData] = await Promise.all([
        getAllUsers({ search: searchQuery, teamOnly: true, page: 1, pageSize: 100 }), // Всегда показываем только команду
        getAvailableRoles(),
      ]);
      console.log('[BFTeamPage] Received users response:', usersResponse);
      setUsers(usersResponse?.items || []);
      setAvailableRoles(rolesData || []);
    } catch (error: any) {
      console.error('[BFTeamPage] Failed to load data:', error);
      toast.error(error?.message || 'Не удалось загрузить данные команды');
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
    if (!confirm('Вы уверены, что хотите удалить эту BF-роль? Это действие нельзя отменить.'))
      return;

    try {
      await deletePlatformRole(roleId);
      toast.success('BF-роль успешно удалена!');
      await loadData(); // Обновляем список, но участник остается в списке
    } catch (error: any) {
      console.error('Failed to delete role:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Ошибка при удалении роли';
      toast.error(errorMsg);
    }
  };

  const handleRemoveTeamMember = async (userId: number, userName: string) => {
    if (
      !confirm(
        `Вы уверены, что хотите удалить "${userName}" из команды?\n\nВсе BF-роли этого пользователя будут удалены, базовая роль будет изменена на "user". Это действие нельзя отменить.`
      )
    )
      return;

    try {
      await removeTeamMember(userId);
      toast.success('Участник успешно удален из команды!');
      await loadData();
    } catch (error: any) {
      console.error('Failed to remove team member:', error);
      const errorMsg =
        error.response?.data?.detail || error.message || 'Ошибка при удалении участника';
      toast.error(errorMsg);
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

                        {/* Кнопка удаления участника (всегда активна) */}
                        <button
                          onClick={() => handleRemoveTeamMember(user.id, user.name || user.email)}
                          style={{
                            padding: '8px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                          }}
                          title="Удалить участника из команды"
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
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
          onAssign={async (userId, roleName, expiresInDays) => {
            await handleAssignRole(userId, roleName, expiresInDays);
            // Обновляем данные пользователя после назначения роли
            const updatedUsersResponse = await getAllUsers({
              search: searchQuery,
              teamOnly: true,
              page: 1,
              pageSize: 100,
            });
            const updatedUser = updatedUsersResponse?.items?.find(u => u.id === selectedUser.id);
            if (updatedUser) {
              setSelectedUser(updatedUser);
            }
          }}
          onUpdateBaseRole={handleUpdateBaseRole}
          onClose={() => {
            setShowAssignModal(false);
            setSelectedUser(null);
          }}
          onRefresh={async () => {
            await loadData();
            // Обновляем данные пользователя в модальном окне
            const updatedUsersResponse = await getAllUsers({
              search: searchQuery,
              teamOnly: true,
              page: 1,
              pageSize: 100,
            });
            const updatedUser = updatedUsersResponse?.items?.find(u => u.id === selectedUser.id);
            if (updatedUser) {
              setSelectedUser(updatedUser);
            }
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
  onRefresh: () => Promise<void>;
}

function AssignRoleModal({
  user,
  availableRoles,
  onAssign,
  onUpdateBaseRole,
  onClose,
  onRefresh,
}: AssignRoleModalProps) {
  const [selectedRole, setSelectedRole] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('');
  const [baseRole, setBaseRole] = useState(user.role);
  const [isUpdatingBaseRole, setIsUpdatingBaseRole] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
  const [editExpiresInDays, setEditExpiresInDays] = useState<number | ''>('');
  const [currentUser, setCurrentUser] = useState(user);
  const [activeTab, setActiveTab] = useState<'bf-roles' | 'base-role'>('bf-roles');
  const [selectedBaseRole, setSelectedBaseRole] = useState('');
  const [baseRoleExpiresInDays, setBaseRoleExpiresInDays] = useState<number | ''>('');
  const [editingBaseRoleId, setEditingBaseRoleId] = useState<number | null>(null);
  const [editBaseRoleExpiresInDays, setEditBaseRoleExpiresInDays] = useState<number | ''>('');

  // Обновляем текущего пользователя при изменении пропса user
  useEffect(() => {
    setCurrentUser(user);
    setBaseRole(user.role);
    // Отладочный вывод для проверки данных
    if (user.base_roles) {
      console.log('Base roles loaded:', user.base_roles);
    }
  }, [user]);

  // Функция для расчета оставшихся дней
  const getDaysRemaining = (expiresAt: string | null): string => {
    if (!expiresAt) return 'Бессрочно';
    const expires = new Date(expiresAt);
    const now = new Date();
    const diffMs = expires.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'Истекла';
    if (diffDays === 0) return 'Истекает сегодня';
    if (diffDays === 1) return 'Остался 1 день';
    return `Осталось ${diffDays} дней`;
  };

  // Функция для форматирования даты
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Бессрочно';
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;

    await onAssign(currentUser.id, selectedRole, expiresInDays ? Number(expiresInDays) : undefined);
    setSelectedRole('');
    setExpiresInDays('');
  };

  const handleBaseRoleChange = async (newRole: string) => {
    if (newRole === currentUser.role) return;

    setIsUpdatingBaseRole(true);
    try {
      await onUpdateBaseRole(currentUser.id, newRole);
      setBaseRole(newRole);
      toast.success('Базовая роль успешно изменена!');
      // Обновляем данные пользователя
      await onRefresh();
    } catch (error: any) {
      console.error('Failed to update base role:', error);
      const errorMsg =
        error.response?.data?.detail || error.message || 'Ошибка при изменении базовой роли';
      toast.error(errorMsg);
      setBaseRole(currentUser.role); // Откатываем изменение
    } finally {
      setIsUpdatingBaseRole(false);
    }
  };

  const handleStartEditRole = (role: PlatformRole) => {
    setEditingRoleId(role.id);
    if (role.expires_at) {
      const expires = new Date(role.expires_at);
      const now = new Date();
      const diffMs = expires.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      setEditExpiresInDays(diffDays > 0 ? diffDays : '');
    } else {
      setEditExpiresInDays('');
    }
  };

  const handleSaveRoleExpiration = async (roleId: number) => {
    try {
      const expires_at = editExpiresInDays
        ? new Date(Date.now() + Number(editExpiresInDays) * 24 * 60 * 60 * 1000).toISOString()
        : null;

      await updatePlatformRole(roleId, { expires_at });
      toast.success('Срок действия роли обновлен!');
      setEditingRoleId(null);
      setEditExpiresInDays('');
      // Обновляем данные пользователя
      await onRefresh();
    } catch (error: any) {
      console.error('Failed to update role expiration:', error);
      const errorMsg =
        error.response?.data?.detail || error.message || 'Ошибка при обновлении срока действия';
      toast.error(errorMsg);
    }
  };

  const handleCancelEdit = () => {
    setEditingRoleId(null);
    setEditExpiresInDays('');
  };

  const handleStartEditBaseRole = (role: BaseRoleListItem) => {
    setEditingBaseRoleId(role.id);
    if (role.expires_at) {
      const expires = new Date(role.expires_at);
      const now = new Date();
      const diffMs = expires.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      setEditBaseRoleExpiresInDays(diffDays > 0 ? diffDays : '');
    } else {
      setEditBaseRoleExpiresInDays('');
    }
  };

  const handleSaveBaseRoleExpiration = async (roleId: number) => {
    try {
      const expires_at = editBaseRoleExpiresInDays
        ? new Date(
            Date.now() + Number(editBaseRoleExpiresInDays) * 24 * 60 * 60 * 1000
          ).toISOString()
        : null;

      await updateBaseRole(roleId, { expires_at });
      toast.success('Срок действия роли обновлен!');
      setEditingBaseRoleId(null);
      setEditBaseRoleExpiresInDays('');
      await onRefresh();
    } catch (error: any) {
      console.error('Failed to update base role expiration:', error);
      const errorMsg =
        error.response?.data?.detail || error.message || 'Ошибка при обновлении срока действия';
      toast.error(errorMsg);
    }
  };

  const handleDeleteBaseRole = async (roleId: number) => {
    if (!confirm('Вы уверены, что хотите удалить эту базовую роль?')) return;

    try {
      await deleteBaseRole(roleId);
      toast.success('Базовая роль успешно удалена!');
      await onRefresh();
    } catch (error: any) {
      console.error('Failed to delete base role:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Ошибка при удалении роли';
      toast.error(errorMsg);
    }
  };

  const handleSubmitBaseRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBaseRole) return;

    try {
      await assignBaseRole({
        user_id: currentUser.id,
        role_name: selectedBaseRole,
        expires_at: baseRoleExpiresInDays
          ? new Date(Date.now() + Number(baseRoleExpiresInDays) * 24 * 60 * 60 * 1000).toISOString()
          : null,
      });
      toast.success('Базовая роль успешно назначена!');
      setSelectedBaseRole('');
      setBaseRoleExpiresInDays('');
      await onRefresh();
    } catch (error: any) {
      console.error('Failed to assign base role:', error);
      const errorMsg =
        error.response?.data?.detail || error.message || 'Ошибка при назначении базовой роли';
      toast.error(errorMsg);
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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '8px',
          }}
        >
          <h2 style={{ fontSize: '24px', margin: 0 }}>Настройки ролей</h2>
          <button
            onClick={onClose}
            style={{
              padding: '8px',
              background: 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text-muted)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--card)';
              e.currentTarget.style.color = 'var(--text)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
            title="Закрыть"
          >
            <X size={20} />
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', marginBottom: '20px', marginTop: '8px' }}>
          Участник: <strong>{currentUser.name || currentUser.email}</strong> (ID:{' '}
          {currentUser.public_id || currentUser.id})
        </p>

        {/* Вкладки */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '24px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <button
            onClick={() => setActiveTab('bf-roles')}
            style={{
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom:
                activeTab === 'bf-roles' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'bf-roles' ? 'var(--text)' : 'var(--text-muted)',
              fontSize: '14px',
              fontWeight: activeTab === 'bf-roles' ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            BF-роли
          </button>
          <button
            onClick={() => setActiveTab('base-role')}
            style={{
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom:
                activeTab === 'base-role' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'base-role' ? 'var(--text)' : 'var(--text-muted)',
              fontSize: '14px',
              fontWeight: activeTab === 'base-role' ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Базовая роль в проекте
          </button>
        </div>

        {/* Контент вкладки BF-роли */}
        {activeTab === 'bf-roles' && (
          <div>
            {/* Существующие BF-роли */}
            {currentUser.platform_roles && currentUser.platform_roles.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px', fontWeight: 600 }}>
                  Назначенные BF-роли
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {currentUser.platform_roles.map(role => (
                    <div
                      key={role.id}
                      style={{
                        padding: '12px',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            marginBottom: '4px',
                            color: role.is_active ? 'var(--text)' : 'var(--text-muted)',
                          }}
                        >
                          {role.role_name}
                          {!role.is_active && (
                            <span
                              style={{
                                marginLeft: '8px',
                                fontSize: '12px',
                                color: 'var(--text-muted)',
                              }}
                            >
                              (неактивна)
                            </span>
                          )}
                        </div>
                        {editingRoleId === role.id ? (
                          <div
                            style={{
                              display: 'flex',
                              gap: '8px',
                              alignItems: 'center',
                              marginTop: '8px',
                            }}
                          >
                            <input
                              type="number"
                              min="1"
                              placeholder="Дней до истечения"
                              value={editExpiresInDays}
                              onChange={e =>
                                setEditExpiresInDays(e.target.value ? Number(e.target.value) : '')
                              }
                              style={{
                                flex: 1,
                                padding: '8px',
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                color: 'var(--text)',
                                fontSize: '13px',
                              }}
                            />
                            <button
                              onClick={() => handleSaveRoleExpiration(role.id)}
                              style={{
                                padding: '8px 12px',
                                background: 'var(--primary)',
                                color: '#000',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Сохранить
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              style={{
                                padding: '8px 12px',
                                background: 'var(--card)',
                                color: 'var(--text)',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Отмена
                            </button>
                          </div>
                        ) : (
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            <div>
                              <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                              {getDaysRemaining(role.expires_at)}
                            </div>
                            {role.expires_at && (
                              <div style={{ marginTop: '4px' }}>
                                До: {formatDate(role.expires_at)}
                              </div>
                            )}
                            {role.granted_at && (
                              <div style={{ marginTop: '4px' }}>
                                Назначена: {formatDate(role.granted_at)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {editingRoleId !== role.id && (
                          <button
                            onClick={() => handleStartEditRole(role)}
                            style={{
                              padding: '6px',
                              background: 'transparent',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              color: 'var(--text)',
                            }}
                            title="Изменить срок действия"
                          >
                            <Edit size={14} />
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (
                              !confirm(
                                'Вы уверены, что хотите удалить эту BF-роль? Это действие нельзя отменить.'
                              )
                            )
                              return;

                            try {
                              await deletePlatformRole(role.id);
                              toast.success('BF-роль успешно удалена!');
                              await onRefresh();
                            } catch (error: any) {
                              console.error('Failed to delete role:', error);
                              const errorMsg =
                                error.response?.data?.detail ||
                                error.message ||
                                'Ошибка при удалении роли';
                              toast.error(errorMsg);
                            }
                          }}
                          style={{
                            padding: '6px',
                            background: 'transparent',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            color: '#ef4444',
                          }}
                          title="Удалить роль"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Форма добавления BF-роли */}
            <form onSubmit={handleSubmit}>
              <h3 style={{ fontSize: '16px', marginBottom: '16px', fontWeight: 600 }}>
                {currentUser.platform_roles && currentUser.platform_roles.length > 0
                  ? 'Добавить BF-роль'
                  : 'Назначить BF-роль'}
              </h3>
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
                  {availableRoles
                    .filter(
                      role =>
                        !currentUser.platform_roles?.some(
                          pr => pr.role_name === role && pr.is_active
                        )
                    )
                    .map(role => (
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
        )}

        {/* Контент вкладки Базовая роль */}
        {activeTab === 'base-role' && (
          <div>
            {/* Существующие базовые роли */}
            {currentUser.base_roles && currentUser.base_roles.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px', fontWeight: 600 }}>
                  Назначенные базовые роли
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {currentUser.base_roles.map(role => (
                    <div
                      key={role.id}
                      style={{
                        padding: '12px',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            marginBottom: '4px',
                            color: role.is_active ? 'var(--text)' : 'var(--text-muted)',
                          }}
                        >
                          {ROLE_NAMES[role.role_name as keyof typeof ROLE_NAMES] || role.role_name}
                          {!role.is_active && (
                            <span
                              style={{
                                marginLeft: '8px',
                                fontSize: '12px',
                                color: 'var(--text-muted)',
                              }}
                            >
                              (неактивна)
                            </span>
                          )}
                          {currentUser.role === role.role_name && role.is_active && (
                            <span
                              style={{
                                marginLeft: '8px',
                                fontSize: '12px',
                                color: 'var(--primary)',
                                fontWeight: 600,
                              }}
                            >
                              (текущая)
                            </span>
                          )}
                        </div>
                        {editingBaseRoleId === role.id ? (
                          <div
                            style={{
                              display: 'flex',
                              gap: '8px',
                              alignItems: 'center',
                              marginTop: '8px',
                            }}
                          >
                            <input
                              type="number"
                              min="1"
                              placeholder="Дней до истечения"
                              value={editBaseRoleExpiresInDays}
                              onChange={e =>
                                setEditBaseRoleExpiresInDays(
                                  e.target.value ? Number(e.target.value) : ''
                                )
                              }
                              style={{
                                flex: 1,
                                padding: '8px',
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                color: 'var(--text)',
                                fontSize: '13px',
                              }}
                            />
                            <button
                              onClick={() => handleSaveBaseRoleExpiration(role.id)}
                              style={{
                                padding: '8px 12px',
                                background: 'var(--primary)',
                                color: '#000',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Сохранить
                            </button>
                            <button
                              onClick={() => {
                                setEditingBaseRoleId(null);
                                setEditBaseRoleExpiresInDays('');
                              }}
                              style={{
                                padding: '8px 12px',
                                background: 'var(--card)',
                                color: 'var(--text)',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Отмена
                            </button>
                          </div>
                        ) : (
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            <div>
                              <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                              {getDaysRemaining(role.expires_at)}
                            </div>
                            {role.expires_at && (
                              <div style={{ marginTop: '4px' }}>
                                До: {formatDate(role.expires_at)}
                              </div>
                            )}
                            {role.granted_at && (
                              <div style={{ marginTop: '4px' }}>
                                Назначена: {formatDate(role.granted_at)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {editingBaseRoleId !== role.id && (
                          <button
                            onClick={() => handleStartEditBaseRole(role)}
                            style={{
                              padding: '6px',
                              background: 'transparent',
                              border: '1px solid var(--border)',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              color: 'var(--text)',
                            }}
                            title="Изменить срок действия"
                          >
                            <Edit size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteBaseRole(role.id)}
                          style={{
                            padding: '6px',
                            background: 'transparent',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            color: '#ef4444',
                          }}
                          title="Удалить роль"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Форма добавления базовой роли */}
            <form onSubmit={handleSubmitBaseRole}>
              <h3 style={{ fontSize: '16px', marginBottom: '16px', fontWeight: 600 }}>
                {currentUser.base_roles && currentUser.base_roles.length > 0
                  ? 'Добавить базовую роль'
                  : 'Назначить базовую роль'}
              </h3>
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
                  value={selectedBaseRole}
                  onChange={e => setSelectedBaseRole(e.target.value)}
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
                  {Object.values(ROLES)
                    .filter(
                      role =>
                        !currentUser.base_roles?.some(br => br.role_name === role && br.is_active)
                    )
                    .map(role => (
                      <option key={role} value={role}>
                        {ROLE_NAMES[role] || role}
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
                  value={baseRoleExpiresInDays}
                  onChange={e =>
                    setBaseRoleExpiresInDays(e.target.value ? Number(e.target.value) : '')
                  }
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
        )}
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
