import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { logout } from '../../api/auth';
import { useNavigate } from 'react-router-dom';
import { hasAccessToSection } from '../../constants/roles';
import { getMyPlatformRoles, type MyPlatformRole } from '../../api/myRoles';

export default function AccountPage() {
  const { user, clearUser } = useAuthStore();
  const navigate = useNavigate();
  const [platformRoles, setPlatformRoles] = useState<MyPlatformRole[]>([]);

  useEffect(() => {
    if (user) {
      loadPlatformRoles();
    }
  }, [user]);

  const loadPlatformRoles = async () => {
    try {
      const roles = await getMyPlatformRoles();
      setPlatformRoles(roles);
    } catch (error) {
      console.error('Failed to load platform roles:', error);
    }
  };

  if (!user) return null;

  // Проверяем, есть ли доступ к Dashboard
  const hasDashboardAccess = hasAccessToSection(user.role, 'dashboard');

  const handleLogout = async () => {
    try {
      await logout();
      clearUser();
      navigate('/account');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const providerNames: Record<string, string> = {
    google: 'Google',
    yandex: 'Яндекс ID',
    mailru: 'Mail.ru',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        padding: '40px 20px',
      }}
    >
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '32px', marginBottom: '32px' }}>Личный кабинет</h1>

        {/* User Profile */}
        <div
          style={{
            background: 'var(--surface)',
            borderRadius: '12px',
            padding: '24px',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '24px' }}>
            {user.avatar && (
              <img
                src={user.avatar}
                alt={user.name || 'User'}
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                }}
              />
            )}
            <div>
              <h2 style={{ fontSize: '24px', marginBottom: '4px' }}>
                {user.name || 'Пользователь'}
              </h2>
              <p style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>{user.email}</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                ID:{' '}
                <span style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>{user.id}</span>
              </p>
            </div>
          </div>

          {/* Connected Providers */}
          <div style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '18px', marginBottom: '12px' }}>Подключённые аккаунты</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {user.providers.map(provider => (
                <span
                  key={provider}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--card)',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                >
                  {providerNames[provider] || provider}
                </span>
              ))}
            </div>
          </div>

          {/* BF Platform Roles */}
          {platformRoles.length > 0 && (
            <div>
              <h3 style={{ fontSize: '18px', marginBottom: '12px' }}>BF-роли платформы</h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {platformRoles.map((role, idx) => (
                  <span
                    key={idx}
                    style={{
                      padding: '8px 12px',
                      background:
                        'linear-gradient(135deg, rgba(255, 210, 76, 0.2), rgba(255, 210, 76, 0.1))',
                      border: '1px solid var(--primary)',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--primary)',
                    }}
                  >
                    {role.role_name}
                    {role.expires_at && (
                      <span style={{ fontSize: '11px', opacity: 0.7, marginLeft: '6px' }}>
                        (до {new Date(role.expires_at).toLocaleDateString()})
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Кнопка перехода в Dashboard */}
        {hasDashboardAccess && (
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px',
              border: '2px solid var(--primary)',
            }}
          >
            <h3
              style={{
                fontSize: '20px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '24px' }}>🏠</span>
              Личный кабинет (Dashboard)
            </h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>
              Управляйте ботами, шаблонами, аналитикой и настройками проекта
            </p>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                width: '100%',
                padding: '16px',
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
              Открыть личный кабинет →
            </button>
          </div>
        )}

        {/* Actions */}
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            padding: '16px',
            background: 'var(--error)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#dc2626')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--error)')}
        >
          Выйти
        </button>
      </div>
    </div>
  );
}
