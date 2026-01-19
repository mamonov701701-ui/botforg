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
  Workflow,
  Building2,
  TrendingUp,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { hasAccessToSection, ROLE_NAMES, type SectionKey } from '../../constants/roles';
import { getMe, logout } from '../../api/auth';

type DashboardMode = 'projects' | 'platform';

interface NavItem {
  id: SectionKey | 'platform_overview' | 'platform_users' | 'platform_analytics';
  label: string;
  path: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  mode: DashboardMode; // В каком режиме показывать этот пункт
}

// Пункты меню для режима "Мои проекты"
const PROJECT_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Главная', path: '/dashboard', icon: Home, mode: 'projects' },
  { id: 'bots', label: 'Мои боты', path: '/dashboard/bots', icon: Bot, mode: 'projects' },
  {
    id: 'scenarios',
    label: 'Сценарии',
    path: '/dashboard/scenarios',
    icon: Workflow,
    mode: 'projects',
  },
  {
    id: 'templates',
    label: 'Шаблоны',
    path: '/dashboard/templates',
    icon: FileText,
    mode: 'projects',
  },
  { id: 'balance', label: 'Баланс', path: '/dashboard/balance', icon: Wallet, mode: 'projects' },
  {
    id: 'analytics',
    label: 'Аналитика',
    path: '/dashboard/analytics',
    icon: BarChart3,
    mode: 'projects',
  },
  { id: 'team', label: 'Команда', path: '/dashboard/team', icon: Users, mode: 'projects' },
  {
    id: 'settings',
    label: 'Настройки',
    path: '/dashboard/settings',
    icon: Settings,
    mode: 'projects',
  },
];

// Пункты меню для режима "Управление платформой"
const PLATFORM_NAV_ITEMS: NavItem[] = [
  {
    id: 'platform_overview',
    label: 'Обзор платформы',
    path: '/dashboard/platform',
    icon: Home,
    mode: 'platform',
  },
  {
    id: 'platform_users',
    label: 'Пользователи и проекты',
    path: '/dashboard/platform/users',
    icon: Users,
    mode: 'platform',
  },
  {
    id: 'platform_analytics',
    label: 'Платформенная аналитика',
    path: '/dashboard/platform/analytics',
    icon: TrendingUp,
    mode: 'platform',
  },
  {
    id: 'bf_team',
    label: 'BF команда',
    path: '/dashboard/bf-team',
    icon: Shield,
    mode: 'platform',
  },
  {
    id: 'settings',
    label: 'Настройки платформы',
    path: '/dashboard/platform/settings',
    icon: Settings,
    mode: 'platform',
  },
];

/**
 * Проверяет, есть ли у пользователя доступ к платформенному режиму
 */
function hasPlatformAccess(user: { role: string } | null | undefined): boolean {
  if (!user) return false;
  // Доступ только для owner и участников BF команды
  // Пока проверяем только owner, позже можно добавить проверку platform_roles
  return user.role === 'owner';
}

export default function DashboardLayout() {
  const { user, setUser, loading, setLoading, clearUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Режим работы: 'projects' (Мои проекты) или 'platform' (Управление платформой)
  const [dashboardMode, setDashboardMode] = useState<DashboardMode>(() => {
    const saved = localStorage.getItem('dashboard_mode');
    return (saved as DashboardMode) || 'projects';
  });

  // Сохраняем режим в localStorage при изменении
  useEffect(() => {
    localStorage.setItem('dashboard_mode', dashboardMode);
  }, [dashboardMode]);

  const handleLogout = async () => {
    try {
      await logout();
      clearUser();
      navigate('/');
    } catch (error) {
      console.error('Logout failed:', error);
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

  // Определяем текущие пункты меню в зависимости от режима
  const currentNavItems = dashboardMode === 'platform' ? PLATFORM_NAV_ITEMS : PROJECT_NAV_ITEMS;

  // Фильтруем пункты меню по правам доступа
  const availableNavItems = currentNavItems.filter(item => {
    // Для платформенных пунктов проверяем дополнительный доступ
    if (item.mode === 'platform') {
      return hasPlatformAccess(user);
    }
    // Для обычных пунктов используем стандартную проверку
    if ('id' in item && typeof item.id === 'string' && item.id.startsWith('platform_')) {
      return hasPlatformAccess(user);
    }
    return hasAccessToSection(user?.role, item.id as SectionKey);
  });

  // Автоматически переключаем режим при переходе на платформенные страницы
  useEffect(() => {
    const isPlatformPage =
      location.pathname.startsWith('/dashboard/platform') ||
      location.pathname.startsWith('/dashboard/bf-team');

    if (isPlatformPage && dashboardMode !== 'platform' && hasPlatformAccess(user)) {
      setDashboardMode('platform');
    } else if (
      !isPlatformPage &&
      dashboardMode === 'platform' &&
      !location.pathname.startsWith('/dashboard/platform') &&
      !location.pathname.startsWith('/dashboard/bf-team')
    ) {
      // Если ушли с платформенных страниц - переключаемся на проекты
      setDashboardMode('projects');
    }

    // Если переключились в платформенный режим, но нет доступа - переключаем обратно
    if (dashboardMode === 'platform' && !hasPlatformAccess(user)) {
      setDashboardMode('projects');
      if (isPlatformPage) {
        navigate('/dashboard');
      }
    }
  }, [location.pathname, dashboardMode, user, navigate]);

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
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
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
              }}
            >
              На главную
            </button>
          )}
        </div>
      </div>
    );
  }

  const canAccessPlatform = hasPlatformAccess(user);

  return (
    <div style={{ minHeight: '100vh', color: 'var(--text)' }}>
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
                    title="Свернуть"
                  >
                    ←
                  </button>
                  <div style={{ paddingRight: '24px' }}>
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
                        {ROLE_NAMES[user.role as keyof typeof ROLE_NAMES] || user.role}
                      </p>
                    </div>
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
                  title="Развернуть"
                >
                  →
                </button>
              </div>
            )}

            {/* Переключатель режимов (только если есть доступ к платформе) */}
            {canAccessPlatform && !isSidebarCollapsed && (
              <div
                style={{
                  marginBottom: '24px',
                  paddingBottom: '16px',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Режим работы
                  </label>
                  <div
                    style={{
                      display: 'flex',
                      gap: '4px',
                      background: 'rgba(15, 23, 42, 0.5)',
                      borderRadius: '8px',
                      padding: '4px',
                    }}
                  >
                    <button
                      onClick={() => {
                        setDashboardMode('projects');
                        if (location.pathname.startsWith('/dashboard/platform')) {
                          navigate('/dashboard');
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        background:
                          dashboardMode === 'projects' ? 'rgba(255, 210, 76, 0.2)' : 'transparent',
                        color:
                          dashboardMode === 'projects' ? 'var(--primary)' : 'var(--text-muted)',
                        fontSize: '13px',
                        fontWeight: dashboardMode === 'projects' ? 600 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                      onMouseEnter={e => {
                        if (dashboardMode !== 'projects') {
                          e.currentTarget.style.background = 'rgba(26, 34, 56, 0.5)';
                          e.currentTarget.style.color = 'var(--text)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (dashboardMode !== 'projects') {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--text-muted)';
                        }
                      }}
                    >
                      <Building2 size={14} />
                      <span>Проекты</span>
                    </button>
                    <button
                      onClick={() => {
                        setDashboardMode('platform');
                        if (
                          !location.pathname.startsWith('/dashboard/platform') &&
                          !location.pathname.startsWith('/dashboard/bf-team')
                        ) {
                          navigate('/dashboard/platform');
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: 'none',
                        background:
                          dashboardMode === 'platform' ? 'rgba(255, 210, 76, 0.2)' : 'transparent',
                        color:
                          dashboardMode === 'platform' ? 'var(--primary)' : 'var(--text-muted)',
                        fontSize: '13px',
                        fontWeight: dashboardMode === 'platform' ? 600 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                      onMouseEnter={e => {
                        if (dashboardMode !== 'platform') {
                          e.currentTarget.style.background = 'rgba(26, 34, 56, 0.5)';
                          e.currentTarget.style.color = 'var(--text)';
                        }
                      }}
                      onMouseLeave={e => {
                        if (dashboardMode !== 'platform') {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = 'var(--text-muted)';
                        }
                      }}
                    >
                      <Shield size={14} />
                      <span>Платформа</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Навигация */}
            <nav>
              {availableNavItems.map(item => {
                const isActive =
                  location.pathname === item.path ||
                  (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
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
        <main style={{ flex: 1, minWidth: 0 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
