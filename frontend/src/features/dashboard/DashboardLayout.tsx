import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Bot,
  FileText,
  Wallet,
  BarChart3,
  Users,
  Shield,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { hasAccessToSection, ROLE_NAMES, type SectionKey } from '../../constants/roles';
import { getMe, logout } from '../../api/auth';

interface NavItem {
  id: SectionKey;
  label: string;
  path: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Главная', path: '/dashboard', icon: Home },
  { id: 'bots', label: 'Мои боты', path: '/dashboard/bots', icon: Bot },
  { id: 'templates', label: 'Шаблоны', path: '/dashboard/templates', icon: FileText },
  { id: 'balance', label: 'Баланс', path: '/dashboard/balance', icon: Wallet },
  { id: 'analytics', label: 'Аналитика', path: '/dashboard/analytics', icon: BarChart3 },
  { id: 'team', label: 'Команда', path: '/dashboard/team', icon: Users },
  { id: 'bf_team', label: 'BF команда', path: '/dashboard/bf-team', icon: Shield },
  { id: 'settings', label: 'Настройки', path: '/dashboard/settings', icon: Settings },
];

export default function DashboardLayout() {
  const { user, setUser, loading, setLoading, clearUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      clearUser();
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
      // В любом случае очищаем данные пользователя
      clearUser();
      navigate('/');
    }
  };

  // Загружаем данные пользователя при первом рендере
  useEffect(() => {
    async function loadUser() {
      if (!user) {
        try {
          const userData = await getMe();
          if (userData) {
            setUser(userData);
          }
        } catch (error) {
          console.error('Failed to load user:', error);
          setLoading(false);
        }
      }
    }
    loadUser();
  }, [user, setUser, setLoading]);

  // Фильтруем пункты меню по правам доступа
  const availableNavItems = NAV_ITEMS.filter(item => hasAccessToSection(user?.role, item.id));

  // Показываем загрузку пока проверяем пользователя
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            border: '4px solid var(--border)',
            borderTop: '4px solid var(--primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  // Проверка доступа к ЛК
  if (!user || user.role === 'user') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
      >
        <div
          style={{
            maxWidth: '500px',
            width: '100%',
            background: 'var(--surface)',
            borderRadius: '16px',
            padding: '40px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>🔒</div>
          <h1 style={{ fontSize: '28px', marginBottom: '16px', color: 'var(--text)' }}>
            Доступ ограничен
          </h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: '32px', lineHeight: 1.6 }}>
            {user
              ? 'У вас нет доступа к личному кабинету. Обратитесь к администратору для получения соответствующей роли.'
              : 'Для доступа к личному кабинету необходимо зарегистрироваться или войти в систему.'}
          </p>
          {!user ? (
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                padding: '14px 32px',
                background: 'var(--primary)',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
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
              Войти / Зарегистрироваться
            </button>
          ) : (
            <button
              onClick={() => navigate('/')}
              style={{
                padding: '14px 32px',
                background: 'var(--card)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--surface)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--card)';
              }}
            >
              На главную
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        color: 'var(--text)',
      }}
    >
      {/* Внутренний контейнер ЛК */}
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '32px 24px 100px 24px',
          display: 'flex',
          gap: '24px',
        }}
      >
        {/* Боковая навигация */}
        <aside
          style={{
            width: isSidebarCollapsed ? '80px' : '260px',
            flexShrink: 0,
            transition: 'width 0.3s ease',
          }}
        >
          <div
            style={{
              position: 'sticky',
              top: '32px',
              background: 'rgba(26, 34, 56, 0.9)',
              borderRadius: '16px',
              padding: '16px',
              border: '1px solid rgba(255, 210, 76, 0.2)',
            }}
          >
            {/* Профиль пользователя */}
            {!isSidebarCollapsed ? (
              <div
                style={{
                  marginBottom: '24px',
                  paddingBottom: '16px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(255, 210, 76, 0.1), rgba(255, 210, 76, 0.05))',
                    border: '1px solid rgba(255, 210, 76, 0.3)',
                    borderRadius: '12px',
                    padding: '16px',
                    position: 'relative',
                  }}
                >
                  <button
                    onClick={() => setIsSidebarCollapsed(true)}
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '4px',
                      color: 'var(--text-muted)',
                      transition: 'color 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                    title="Свернуть"
                  >
                    ←
                  </button>

                  <div style={{ paddingRight: '24px' }}>
                    {/* Имя */}
                    <h2
                      style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        marginBottom: '6px',
                        color: 'var(--text)',
                        wordBreak: 'break-word',
                      }}
                    >
                      {user.name || 'Пользователь'}
                    </h2>

                    {/* Статус (роль) */}
                    <div
                      style={{
                        display: 'inline-block',
                        padding: '3px 8px',
                        background: 'rgba(255, 210, 76, 0.2)',
                        borderRadius: '6px',
                        marginBottom: '8px',
                      }}
                    >
                      <p
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: 'var(--primary)',
                          margin: 0,
                        }}
                      >
                        {ROLE_NAMES[user.role]}
                      </p>
                    </div>

                    {/* ID */}
                    <p
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        fontFamily: 'monospace',
                        margin: 0,
                      }}
                    >
                      ID: {user.public_id || user.id}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginBottom: '24px',
                  paddingBottom: '16px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <button
                  onClick={() => setIsSidebarCollapsed(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '20px',
                    padding: '4px',
                    color: 'var(--text-muted)',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                  title="Развернуть"
                >
                  →
                </button>
              </div>
            )}

            {/* Навигация */}
            <nav>
              {availableNavItems.map(item => {
                const isActive = location.pathname === item.path;
                const IconComponent = item.icon;
                return (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      marginBottom: '4px',
                      borderRadius: '8px',
                      textDecoration: 'none',
                      color: isActive ? 'var(--primary)' : 'var(--text)',
                      background: isActive ? 'rgba(255, 210, 76, 0.1)' : 'transparent',
                      fontWeight: isActive ? 600 : 400,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'rgba(26, 34, 56, 0.5)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <IconComponent size={20} className="lucide-icon" />
                    {!isSidebarCollapsed && <span>{item.label}</span>}
                  </NavLink>
                );
              })}

              {/* Кнопка выхода */}
              <div
                style={{
                  marginTop: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <button
                  onClick={handleLogout}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    width: '100%',
                    borderRadius: '8px',
                    textDecoration: 'none',
                    color: '#ef4444',
                    background: 'transparent',
                    border: 'none',
                    fontWeight: 500,
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                  title="Выйти из аккаунта"
                >
                  <LogOut size={20} />
                  {!isSidebarCollapsed && <span>Выйти</span>}
                </button>
              </div>
            </nav>
          </div>
        </aside>

        {/* Основной контент */}
        <main
          style={{
            flex: 1,
            minWidth: 0, // Для правильного overflow
          }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
