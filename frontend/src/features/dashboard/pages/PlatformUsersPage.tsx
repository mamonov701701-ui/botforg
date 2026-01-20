import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import {
  Users,
  Search,
  ChevronRight,
  Shield,
  ChevronLeft,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { getAllUsers } from '../../../api/platformAdmin';
import type { User } from '../../../api/platformAdmin';
import { toast } from '../../../utils/toast';

type SortField = 'id' | 'email' | 'name' | 'role' | 'created_at';
type SortOrder = 'asc' | 'desc';

export default function PlatformUsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [sortBy, setSortBy] = useState<SortField>('id');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchInput, setSearchInput] = useState('');

  useEffect(() => {
    loadUsers();
  }, [currentPage, pageSize, sortBy, sortOrder, searchQuery]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      console.log('[PlatformUsersPage] Loading users with params:', {
        page: currentPage,
        pageSize: pageSize,
        search: searchQuery,
        sortBy: sortBy,
        sortOrder: sortOrder,
      });
      const response = await getAllUsers({
        page: currentPage,
        pageSize: pageSize,
        search: searchQuery || undefined,
        sortBy: sortBy,
        sortOrder: sortOrder,
      });
      console.log('[PlatformUsersPage] Received response:', response);
      setUsers(response.items || []);
      setTotalUsers(response.total || 0);
      setTotalPages(response.total_pages || 0);
    } catch (error: any) {
      console.error('[PlatformUsersPage] Failed to load users:', error);
      toast.error(error.message || 'Не удалось загрузить пользователей');
      setUsers([]);
      setTotalUsers(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setSearchQuery(searchInput);
    setCurrentPage(1); // Сбрасываем на первую страницу при поиске
  };

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      // Переключаем порядок сортировки
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Новое поле сортировки
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortBy !== field) {
      return <ArrowUpDown size={14} style={{ color: 'var(--text-muted)' }} />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp size={14} style={{ color: 'var(--primary)' }} />
    ) : (
      <ArrowDown size={14} style={{ color: 'var(--primary)' }} />
    );
  };

  // Показываем загрузку только при первой загрузке (когда нет данных)
  const isInitialLoad = loading && users.length === 0 && totalUsers === 0;

  if (isInitialLoad) {
    return (
      <DashboardPage
        title="Пользователи и проекты"
        subtitle="Управление пользователями платформы и их проектами"
      >
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

  return (
    <DashboardPage
      title="Пользователи и проекты"
      subtitle={`Просмотр всех пользователей платформы (всего: ${totalUsers.toLocaleString('ru-RU')})`}
    >
      {/* Поиск и фильтры */}
      <Card style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={20}
              style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Поиск по email, имени, ID или роли..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleSearch()}
              style={{
                width: '100%',
                padding: '12px 16px 12px 48px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text)',
                fontSize: '14px',
              }}
            />
          </div>
          <button
            onClick={handleSearch}
            style={{
              padding: '12px 24px',
              background: 'var(--primary)',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Найти
          </button>
          {searchQuery && (
            <button
              onClick={() => {
                setSearchInput('');
                setSearchQuery('');
                setCurrentPage(1);
              }}
              style={{
                padding: '12px 24px',
                background: 'var(--surface)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Сбросить
            </button>
          )}
        </div>

        {/* Размер страницы */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '14px' }}>
          <span style={{ color: 'var(--text-muted)' }}>Пользователей на странице:</span>
          <select
            value={pageSize}
            onChange={e => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            style={{
              padding: '6px 12px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              color: 'var(--text)',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
      </Card>

      {/* Заголовки таблицы с сортировкой */}
      {users.length > 0 && (
        <Card style={{ marginBottom: '12px', padding: '12px 16px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '60px 1fr 1fr 120px 150px 1fr',
              gap: '16px',
              alignItems: 'center',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-muted)',
            }}
          >
            <div
              onClick={() => handleSort('id')}
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                userSelect: 'none',
              }}
            >
              ID {getSortIcon('id')}
            </div>
            <div
              onClick={() => handleSort('name')}
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                userSelect: 'none',
              }}
            >
              Имя {getSortIcon('name')}
            </div>
            <div
              onClick={() => handleSort('email')}
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                userSelect: 'none',
              }}
            >
              Email {getSortIcon('email')}
            </div>
            <div
              onClick={() => handleSort('role')}
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                userSelect: 'none',
              }}
            >
              Роль {getSortIcon('role')}
            </div>
            <div
              onClick={() => handleSort('created_at')}
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                userSelect: 'none',
              }}
            >
              Дата {getSortIcon('created_at')}
            </div>
            <div style={{ textAlign: 'right' }}>Действия</div>
          </div>
        </Card>
      )}

      {/* Индикатор загрузки при обновлении */}
      {loading && users.length > 0 && (
        <Card
          style={{
            marginBottom: '16px',
            padding: '12px',
            background: 'rgba(255, 210, 76, 0.1)',
            border: '1px solid rgba(255, 210, 76, 0.3)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '14px',
              color: 'var(--text)',
            }}
          >
            <div
              style={{
                width: '20px',
                height: '20px',
                border: '2px solid var(--border)',
                borderTop: '2px solid var(--primary)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <span>Загрузка...</span>
          </div>
        </Card>
      )}

      {/* Список пользователей */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
        {users.length === 0 && !loading ? (
          <Card>
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Users size={64} style={{ color: 'var(--text-muted)', margin: '0 auto 16px' }} />
              <h3
                style={{
                  fontSize: '18px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  color: 'var(--text)',
                }}
              >
                Пользователи не найдены
              </h3>
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>
                {searchQuery
                  ? 'Попробуйте изменить параметры поиска'
                  : 'В системе пока нет пользователей'}
              </p>
            </div>
          </Card>
        ) : users.length > 0 ? (
          users.map(user => (
            <Card
              key={user.id}
              style={{ cursor: 'pointer', padding: '16px' }}
              onClick={() => navigate(`/dashboard/platform/users/${user.id}`)}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                e.currentTarget.style.borderColor = 'var(--primary)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 1fr 1fr 120px 150px 1fr',
                  gap: '16px',
                  alignItems: 'center',
                }}
              >
                {/* ID */}
                <div
                  style={{
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    color: 'var(--text-muted)',
                    fontWeight: 500,
                  }}
                >
                  #{user.id}
                </div>

                {/* Имя */}
                <div>
                  <h3
                    style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      margin: '0 0 4px 0',
                      color: 'var(--text)',
                    }}
                  >
                    {user.name || 'Без имени'}
                  </h3>
                  {user.public_id && (
                    <p
                      style={{
                        fontSize: '12px',
                        color: 'var(--text-muted)',
                        margin: 0,
                        fontFamily: 'monospace',
                      }}
                    >
                      Public ID: {user.public_id}
                    </p>
                  )}
                </div>

                {/* Email */}
                <div>
                  <p style={{ fontSize: '14px', color: 'var(--text)', margin: 0 }}>{user.email}</p>
                </div>

                {/* Роль */}
                <div>
                  <span
                    style={{
                      fontSize: '12px',
                      padding: '4px 8px',
                      background: 'rgba(255, 210, 76, 0.2)',
                      borderRadius: '4px',
                      color: 'var(--primary)',
                      fontWeight: 500,
                    }}
                  >
                    {user.role}
                  </span>
                  {user.platform_roles && user.platform_roles.length > 0 && (
                    <div
                      style={{
                        marginTop: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Shield size={12} style={{ color: 'var(--text-muted)' }} />
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {user.platform_roles.length} BF-ролей
                      </span>
                    </div>
                  )}
                </div>

                {/* Дата регистрации */}
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  {user.created_at ? new Date(user.created_at).toLocaleDateString('ru-RU') : '—'}
                </div>

                {/* Действия */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <ChevronRight size={20} style={{ color: 'var(--text-muted)' }} />
                </div>
              </div>
            </Card>
          ))
        ) : null}
      </div>

      {/* Пагинация */}
      {totalPages > 1 && (
        <Card>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px',
            }}
          >
            <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
              Показано {(currentPage - 1) * pageSize + 1} -{' '}
              {Math.min(currentPage * pageSize, totalUsers)} из {totalUsers.toLocaleString('ru-RU')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '8px 16px',
                  background: currentPage === 1 ? 'var(--surface)' : 'var(--primary)',
                  color: currentPage === 1 ? 'var(--text-muted)' : '#000',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: currentPage === 1 ? 0.5 : 1,
                }}
              >
                <ChevronLeft size={18} />
                Назад
              </button>

              <div style={{ display: 'flex', gap: '4px' }}>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      style={{
                        minWidth: '40px',
                        padding: '8px 12px',
                        background: currentPage === pageNum ? 'var(--primary)' : 'var(--surface)',
                        color: currentPage === pageNum ? '#000' : 'var(--text)',
                        border: `1px solid ${currentPage === pageNum ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: currentPage === pageNum ? 600 : 400,
                        cursor: 'pointer',
                      }}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '8px 16px',
                  background: currentPage === totalPages ? 'var(--surface)' : 'var(--primary)',
                  color: currentPage === totalPages ? 'var(--text-muted)' : '#000',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: currentPage === totalPages ? 0.5 : 1,
                }}
              >
                Вперед
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </Card>
      )}
    </DashboardPage>
  );
}
