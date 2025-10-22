import React from 'react';
import { useAuthStore } from '../../stores/authStore';
import { logout } from '../../api/auth';
import { useNavigate } from 'react-router-dom';

export default function AccountPage() {
  const { user, clearUser } = useAuthStore();
  const navigate = useNavigate();
  
  if (!user) return null;
  
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
    mailru: 'Mail.ru'
  };
  
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      padding: '40px 20px'
    }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '32px', marginBottom: '32px' }}>Личный кабинет</h1>
        
        {/* User Profile */}
        <div style={{
          background: 'var(--surface)',
          borderRadius: '12px',
          padding: '24px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '24px' }}>
            {user.avatar && (
              <img
                src={user.avatar}
                alt={user.name || 'User'}
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  objectFit: 'cover'
                }}
              />
            )}
            <div>
              <h2 style={{ fontSize: '24px', marginBottom: '4px' }}>{user.name || 'Пользователь'}</h2>
              <p style={{ color: 'var(--text-muted)' }}>{user.email}</p>
            </div>
          </div>
          
          {/* Connected Providers */}
          <div>
            <h3 style={{ fontSize: '18px', marginBottom: '12px' }}>Подключённые аккаунты</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {user.providers.map(provider => (
                <span
                  key={provider}
                  style={{
                    padding: '6px 12px',
                    background: 'var(--card)',
                    borderRadius: '6px',
                    fontSize: '14px'
                  }}
                >
                  {providerNames[provider] || provider}
                </span>
              ))}
            </div>
          </div>
        </div>
        
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
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#dc2626'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--error)'}
        >
          Выйти
        </button>
      </div>
    </div>
  );
}

