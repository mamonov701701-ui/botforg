import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { hasAccessToSection, ROLE_NAMES, type SectionKey } from '../../constants/roles';
import { getMe } from '../../api/auth';

interface NavItem {
  id: SectionKey;
  label: string;
  path: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Главная', path: '/dashboard', icon: '🏠' },
  { id: 'bots', label: 'Мои боты', path: '/dashboard/bots', icon: '🤖' },
  { id: 'templates', label: 'Шаблоны', path: '/dashboard/templates', icon: '📋' },
  { id: 'balance', label: 'Баланс', path: '/dashboard/balance', icon: '💰' },
  { id: 'analytics', label: 'Аналитика', path: '/dashboard/analytics', icon: '📊' },
  { id: 'team', label: 'Команда', path: '/dashboard/team', icon: '👥' },
  { id: 'settings', label: 'Настройки', path: '/dashboard/settings', icon: '⚙️' },
];

export default function DashboardLayout() {
  const { user, setUser, loading, setLoading } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

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
          background: 'var(--bg)',
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
          background: 'var(--bg)',
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
              onClick={() => navigate('/account')}
              style={{
                padding: '14px 32px',
                background: 'var(--primary)',
                color: '#fff',
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
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      {/* Внутренний контейнер ЛК */}
      <div
        style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '32px 24px',
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
              background: 'var(--surface)',
              borderRadius: '16px',
              padding: '16px',
              border: '1px solid var(--border)',
            }}
          >
            {/* Заголовок */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '24px',
                paddingBottom: '16px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {!isSidebarCollapsed && (
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '4px' }}>
                    Личный кабинет
                  </h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {ROLE_NAMES[user.role]}
                  </p>
                </div>
              )}
              <button
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
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
                title={isSidebarCollapsed ? 'Развернуть' : 'Свернуть'}
              >
                {isSidebarCollapsed ? '→' : '←'}
              </button>
            </div>

            {/* Навигация */}
            <nav>
              {availableNavItems.map(item => {
                const isActive = location.pathname === item.path;
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
                      background: isActive ? 'var(--primary-bg)' : 'transparent',
                      fontWeight: isActive ? 600 : 400,
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'var(--card)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>{item.icon}</span>
                    {!isSidebarCollapsed && <span>{item.label}</span>}
                  </NavLink>
                );
              })}
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
