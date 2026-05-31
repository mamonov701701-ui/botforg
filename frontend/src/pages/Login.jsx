import React, { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

const DEFAULT_NEXT = '/dashboard';

function resolveNextPath(searchParams) {
  const next = searchParams.get('next');
  if (next && next.startsWith('/')) {
    return next;
  }
  return DEFAULT_NEXT;
}

export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { openAuth } = useUiStore();
  const { user, authStatus } = useAuthStore();

  const nextPath = useMemo(() => resolveNextPath(searchParams), [searchParams]);

  const openLoginModal = useCallback(() => {
    openAuth(nextPath);
  }, [openAuth, nextPath]);

  useEffect(() => {
    if (user && authStatus === 'authenticated') {
      navigate(nextPath, { replace: true });
      return;
    }
    openLoginModal();
  }, [user, authStatus, navigate, nextPath, openLoginModal]);

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center" style={{ color: 'var(--text)' }}>
      <h1 className="text-2xl font-heading font-semibold mb-3">Открываем форму входа…</h1>
      <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
        Если окно входа не открылось, нажмите кнопку ниже.
      </p>
      <button
        type="button"
        onClick={openLoginModal}
        className="font-semibold py-2.5 px-6 rounded-full transition hover:opacity-90"
        style={{ backgroundColor: 'var(--accent)', color: '#000' }}
      >
        Открыть вход
      </button>
    </div>
  );
}
