import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { getMe } from '../../api/auth';

interface Props {
  children: React.ReactNode;
}

export default function AuthGate({ children }: Props) {
  const { user, loading, authStatus, setUser, setLoading, setAuthStatus } = useAuthStore();
  const { openAuth } = useUiStore();
  const location = useLocation();
  const bootstrappedRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setLoading(true);
    setBootstrapError(null);
    try {
      const userData = await getMe();
      if (userData) {
        setUser(userData);
        setAuthStatus('authenticated');
      } else {
        setUser(null);
        setAuthStatus('guest');
      }
    } catch (error: any) {
      // Временные сетевые/timeout ошибки НЕ переводят в guest и НЕ открывают login.
      if (error?.status === 0) {
        setAuthStatus('unknown');
        setBootstrapError('Сервер временно недоступен. Повторяем проверку сессии...');
        retryTimerRef.current = window.setTimeout(() => {
          loadUser();
        }, 3000);
      } else {
        setUser(null);
        setAuthStatus('guest');
      }
    } finally {
      setLoading(false);
    }
  }, [setAuthStatus, setLoading, setUser]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    if (user) {
      setLoading(false);
      setAuthStatus('authenticated');
      bootstrappedRef.current = true;
      return;
    }
    bootstrappedRef.current = true;
    loadUser();
  }, [loadUser, setAuthStatus, setLoading, user]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!loading && !user && authStatus === 'guest') {
      // Open modal instead of showing SignIn page
      openAuth(location.pathname + location.search);
    }
  }, [loading, user, authStatus, openAuth, location]);

  if (loading || authStatus === 'unknown') {
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
        <div style={{ color: 'var(--text)' }}>{bootstrapError || 'Загрузка...'}</div>
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
