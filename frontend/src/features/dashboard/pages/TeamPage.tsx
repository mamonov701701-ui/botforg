import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Search, Settings, X, Edit, Clock } from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import { useAuthStore } from '../../../stores/authStore';
import { hasAccessToAction } from '../../../constants/roles';
import { ROLE_NAMES, type RoleValue } from '../../../constants/roles';
import {
  getMyTeam,
  deleteTeamMember,
  updateTeamMemberRole,
  addTeamMember,
  findUserByIdentifier,
  type TeamMember,
} from '../../../api/team';
import {
  assignBaseRole,
  updateBaseRole,
  deleteBaseRole,
  type BaseRoleListItem,
} from '../../../api/platformAdmin';
import { ROLES } from '../../../constants/roles';
import { toast } from '../../../utils/toast';

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

// === Модальное окно добавления по ID ===

interface AddByIdModalProps {
  onAdd: (userId: number, role: RoleValue, expiresInDays?: number) => void;
  onClose: () => void;
}

function AddByIdModal({ onAdd, onClose }: AddByIdModalProps) {
  const [userId, setUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<RoleValue>('developer');
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('');
  const [searching, setSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<{
    id: number;
    public_id: number;
    email: string;
    name: string | null;
  } | null>(null);
  const [searchError, setSearchError] = useState('');

  const handleSearch = async () => {
    if (!userId.trim()) {
      setSearchError('Введите ID или email');
      return;
    }

    try {
      setSearching(true);
      setSearchError('');
      setFoundUser(null);

      const user = await findUserByIdentifier(userId.trim());
      if (user) {
        setFoundUser(user);
        setSearchError('');
      } else {
        setSearchError('Пользователь не найден. Проверьте ID или email.');
        setFoundUser(null);
      }
    } catch (error: any) {
      console.error('Failed to search user:', error);
      const errorMessage =
        error.response?.data?.detail || error.message || 'Ошибка при поиске пользователя';
      setSearchError(`Ошибка: ${errorMessage}`);
      setFoundUser(null);
    } finally {
      setSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundUser || !selectedRole) return;

    try {
      await onAdd(foundUser.id, selectedRole, expiresInDays ? Number(expiresInDays) : undefined);
    } catch (error) {
      // Ошибка уже обработана в handleAddById
      console.error('Error in handleSubmit:', error);
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
        <h2 style={{ fontSize: '24px', marginBottom: '8px' }}>Добавить участника в команду</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
          Введите 8-значный ID или email пользователя
        </p>

        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            ID пользователя или email
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Например: 97410876 или user@example.com"
              value={userId}
              onChange={e => {
                setUserId(e.target.value);
                setFoundUser(null);
                setSearchError('');
              }}
              style={{
                flex: 1,
                padding: '12px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text)',
                fontSize: '14px',
              }}
            />
            <button
              type="button"
              onClick={handleSearch}
              disabled={searching || !userId.trim()}
              style={{
                padding: '12px 20px',
                background: searching ? 'var(--text-muted)' : 'var(--primary)',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: searching || !userId.trim() ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {searching ? 'Поиск...' : 'Найти'}
            </button>
          </div>
          {searchError && (
            <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px' }}>{searchError}</p>
          )}
          {foundUser && (
            <div
              style={{
                marginTop: '12px',
                padding: '12px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
                {foundUser.name || 'Без имени'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {foundUser.email} (ID: {foundUser.public_id})
              </div>
            </div>
          )}
        </div>

        {foundUser && (
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
                onChange={e => setSelectedRole(e.target.value as RoleValue)}
                required
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--text)',
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                <option value="admin">{ROLE_NAMES.admin}</option>
                <option value="developer">{ROLE_NAMES.developer}</option>
                <option value="templates_manager">{ROLE_NAMES.templates_manager}</option>
                <option value="support">{ROLE_NAMES.support}</option>
                <option value="viewer">{ROLE_NAMES.viewer}</option>
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
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function TeamPage() {
  const { user } = useAuthStore();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddByIdModal, setShowAddByIdModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Загрузка данных команды
  const loadTeamData = async () => {
    try {
      setLoading(true);
      const data = await getMyTeam(searchQuery || undefined);
      setTeamMembers(data);
    } catch (error: any) {
      console.error('Failed to load team:', error);
      toast.error('Ошибка при загрузке команды');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeamData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const canInvite = hasAccessToAction(user?.role as RoleValue, 'team_invite');
  const canEditRole = hasAccessToAction(user?.role as RoleValue, 'team_edit_role');
  const canRemove = hasAccessToAction(user?.role as RoleValue, 'team_remove');

  // Функция для получения активной базовой роли участника
  const getActiveBaseRole = (member: TeamMember): string => {
    if (member.base_roles && member.base_roles.length > 0) {
      // Ищем активную роль, которая не истекла
      const activeRole = member.base_roles.find(br => {
        if (!br.is_active) return false;
        if (!br.expires_at) return true; // Бессрочная роль
        const expires = new Date(br.expires_at);
        const now = new Date();
        return expires > now; // Роль не истекла
      });
      if (activeRole) {
        return activeRole.role_name;
      }
    }
    // Если нет активной базовой роли, возвращаем роль из TeamMember (для обратной совместимости)
    return member.role || 'user';
  };

  const handleAddById = async (userId: number, role: RoleValue, expiresInDays?: number) => {
    try {
      console.log('Adding team member:', { userId, role, expiresInDays });
      const result = await addTeamMember({ user_id: userId, role }, expiresInDays);
      console.log('Team member added successfully:', result);
      toast.success('Участник успешно добавлен в команду');
      setShowAddByIdModal(false);
      // Перезагружаем данные команды
      await loadTeamData();
    } catch (error: any) {
      console.error('Failed to add team member:', error);
      const errorMsg =
        error.response?.data?.detail || error.message || 'Ошибка при добавлении участника';
      console.error('Error details:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
      });
      toast.error(errorMsg);
      throw error; // Пробрасываем ошибку дальше
    }
  };

  const handleChangeRole = async (memberId: number, newRole: RoleValue) => {
    try {
      const member = teamMembers.find(m => m.id === memberId);
      if (!member) return;

      await updateTeamMemberRole(memberId, newRole);
      toast.success('Роль успешно изменена');
      await loadTeamData();
    } catch (error: any) {
      console.error('Failed to change role:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Ошибка при изменении роли';
      toast.error(errorMsg);
    }
  };

  const handleRemove = async (memberId: number) => {
    try {
      await deleteTeamMember(memberId);
      toast.success('Участник успешно удален из команды');
      await loadTeamData();
      setConfirmDelete(null);
    } catch (error: any) {
      console.error('Failed to remove team member:', error);
      const errorMsg =
        error.response?.data?.detail || error.message || 'Ошибка при удалении участника';
      toast.error(errorMsg);
    }
  };

  return (
    <DashboardPage title="Команда" subtitle={`Участников: ${teamMembers.length}`}>
      {/* Toolbar с поиском и кнопкой пригласить */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          marginBottom: '24px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        {/* Поиск */}
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
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
        </div>

        {/* Кнопка пригласить */}
        {canInvite && (
          <button
            onClick={() => setShowAddByIdModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 24px',
              background: 'var(--primary)',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
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
            <Plus size={18} />
            Пригласить
          </button>
        )}
      </div>

      {/* Таблица участников */}
      <Card style={{ marginBottom: '32px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Участники</h3>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Загрузка...
          </div>
        ) : teamMembers.length === 0 ? (
          <EmptyState
            icon="👥"
            title="Команда пуста"
            description="Пригласите первого участника для совместной работы"
            action={
              canInvite
                ? {
                    label: 'Пригласить участника',
                    onClick: () => setShowAddByIdModal(true),
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
                gridTemplateColumns: '1fr 2fr 2fr 1.5fr 1fr',
                gap: '16px',
                padding: '12px 16px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div>ID</div>
              <div>Имя</div>
              <div>Email</div>
              <div>Роль</div>
              <div>Действия</div>
            </div>

            {/* Строки */}
            {teamMembers.map(member => (
              <div
                key={member.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 2fr 2fr 1.5fr 1fr',
                  gap: '16px',
                  padding: '16px',
                  borderBottom: '1px solid var(--border)',
                  alignItems: 'center',
                  fontSize: '14px',
                }}
              >
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                  {member.public_id}
                </div>
                <div style={{ fontWeight: 600 }}>{member.name || '—'}</div>
                <div style={{ color: 'var(--text-muted)' }}>{member.email}</div>
                <div>
                  {canEditRole ? (
                    <select
                      value={getActiveBaseRole(member)}
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
                    <span>
                      {ROLE_NAMES[getActiveBaseRole(member) as RoleValue] ||
                        getActiveBaseRole(member)}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => {
                      setSelectedMember(member);
                      setShowSettingsModal(true);
                    }}
                    style={{
                      padding: '6px 12px',
                      background: 'var(--primary)',
                      color: '#000',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.9')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                    title="Настройки ролей"
                  >
                    <Settings size={14} />
                    Настройка
                  </button>
                  {canRemove && (
                    <button
                      onClick={() => setConfirmDelete(member.id)}
                      style={{
                        padding: '6px 12px',
                        background: 'transparent',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        color: '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#ef444410')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      title="Удалить"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Модалки */}
      {showAddByIdModal && (
        <AddByIdModal onAdd={handleAddById} onClose={() => setShowAddByIdModal(false)} />
      )}

      {showSettingsModal && selectedMember && (
        <SettingsModal
          member={selectedMember}
          onClose={() => {
            setShowSettingsModal(false);
            setSelectedMember(null);
          }}
          onRefresh={loadTeamData}
        />
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

// === Модальное окно настроек ролей ===

interface SettingsModalProps {
  member: TeamMember;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

function SettingsModal({ member, onClose, onRefresh }: SettingsModalProps) {
  const [currentMember, setCurrentMember] = useState(member);
  const [selectedBaseRole, setSelectedBaseRole] = useState('');
  const [baseRoleExpiresInDays, setBaseRoleExpiresInDays] = useState<number | ''>('');
  const [editingBaseRoleId, setEditingBaseRoleId] = useState<number | null>(null);
  const [editBaseRoleExpiresInDays, setEditBaseRoleExpiresInDays] = useState<number | ''>('');

  // Обновляем текущего участника при изменении пропса
  useEffect(() => {
    setCurrentMember(member);
  }, [member]);

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
      // Обновляем данные участника
      const updatedData = await getMyTeam();
      const updatedMember = updatedData.find(m => m.id === member.id);
      if (updatedMember) {
        setCurrentMember(updatedMember);
      }
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
      // Обновляем данные участника
      const updatedData = await getMyTeam();
      const updatedMember = updatedData.find(m => m.id === member.id);
      if (updatedMember) {
        setCurrentMember(updatedMember);
      }
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
      const expires_at = baseRoleExpiresInDays
        ? new Date(Date.now() + Number(baseRoleExpiresInDays) * 24 * 60 * 60 * 1000).toISOString()
        : null;

      await assignBaseRole({
        user_id: member.user_id,
        role_name: selectedBaseRole,
        expires_at,
      });

      toast.success('Базовая роль успешно назначена!');
      setSelectedBaseRole('');
      setBaseRoleExpiresInDays('');
      await onRefresh();
      // Обновляем данные участника
      const updatedData = await getMyTeam();
      const updatedMember = updatedData.find(m => m.id === member.id);
      if (updatedMember) {
        setCurrentMember(updatedMember);
      }
    } catch (error: any) {
      console.error('Failed to assign base role:', error);
      const errorMsg =
        error.response?.data?.detail || error.message || 'Ошибка при назначении роли';
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
          maxWidth: '800px',
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
          Участник: <strong>{currentMember.name || currentMember.email}</strong> (ID:{' '}
          {currentMember.public_id})
        </p>

        {/* Контент базовых ролей */}
        <div>
          {/* Существующие базовые роли */}
          {currentMember.base_roles && currentMember.base_roles.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', marginBottom: '12px', fontWeight: 600 }}>
                Назначенные базовые роли
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {currentMember.base_roles.map(role => (
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
                        {currentMember.role === role.role_name && role.is_active && (
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
              {currentMember.base_roles && currentMember.base_roles.length > 0
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
                      !currentMember.base_roles?.some(br => br.role_name === role && br.is_active)
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
      </div>
    </div>
  );
}
