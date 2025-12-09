import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { getMe } from '../../api/auth';

interface Props {
  children: React.ReactNode;
}

export default function AuthGate({ children }: Props) {
  const { user, loading, setUser, setLoading } = useAuthStore();
  const { openAuth } = useUiStore();
  const location = useLocation();

  useEffect(() => {
    async function loadUser() {
      // Если пользователь уже установлен, не перезагружаем
      if (user) {
        setLoading(false);
        return;
      }

      try {
        const userData = await getMe();
        if (userData) {
          setUser(userData);
        } else {
          // Если getMe вернул null (401), это нормально - пользователь не авторизован
          setUser(null);
        }
      } catch (error: any) {
        // Игнорируем ошибки сети/таймаута при первой загрузке
        // Пользователь может быть не авторизован или сервер недоступен
        if (error.status === 401 || error.status === 0) {
          setUser(null);
        } else {
          console.error('Failed to load user:', error);
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, [setUser, setLoading, user]);

  useEffect(() => {
    if (!loading && !user) {
      // Open modal instead of showing SignIn page
      openAuth(location.pathname + location.search);
    }
  }, [loading, user, openAuth, location]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          background: 'var(--bg)',
        }}
      >
        <div style={{ color: 'var(--text)' }}>Загрузка...</div>
      </div>
    );
  }

  if (!user) {
    // Return placeholder while modal is opening
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
        {/* Modal will open via useEffect */}
      </div>
    );
  }

  return <>{children}</>;
}
