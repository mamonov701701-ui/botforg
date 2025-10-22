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
      try {
        const userData = await getMe();
        setUser(userData);
      } catch (error) {
        console.error('Failed to load user:', error);
        setUser(null);
      }
    }
    
    loadUser();
  }, [setUser]);
  
  useEffect(() => {
    if (!loading && !user) {
      // Open modal instead of showing SignIn page
      openAuth(location.pathname + location.search);
    }
  }, [loading, user, openAuth, location]);
  
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--bg)' }}>
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
