import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useUiStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';
import { useNavigate } from 'react-router-dom';
import { 
  getLoginUrl, 
  loginEmail, 
  registerEmail, 
  requestPasswordReset,
  getMe 
} from '../../api/auth';
import { toast } from '../../utils/toast';

type Tab = 'oauth' | 'email';
type EmailMode = 'login' | 'register' | 'reset';

export default function AuthModal() {
  const { authModalOpen, nextPath, closeAuth } = useUiStore();
  const { setUser } = useAuthStore();
  const navigate = useNavigate();
  const modalRef = useRef<HTMLDivElement>(null);
  
  const [tab, setTab] = useState<Tab>('oauth');
  const [emailMode, setEmailMode] = useState<EmailMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  // ESC key handler
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && authModalOpen) {
        closeAuth();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [authModalOpen, closeAuth]);

  // Focus trap
  useEffect(() => {
    if (authModalOpen && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      const handleTab = (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement?.focus();
          } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      };

      modalRef.current.addEventListener('keydown', handleTab as any);
      firstElement?.focus();

      return () => {
        modalRef.current?.removeEventListener('keydown', handleTab as any);
      };
    }
  }, [authModalOpen, tab, emailMode]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (emailMode === 'register') {
        await registerEmail(email, password, name);
        toast.success('Регистрация успешна! Проверьте email для подтверждения.');
        setEmailMode('login');
      } else if (emailMode === 'login') {
        await loginEmail(email, password);
        toast.success('Вход выполнен успешно!');
        // Verify session
        const user = await getMe();
        if (user) {
          setUser(user);
          closeAuth();
          if (nextPath) {
            navigate(nextPath);
          } else {
            navigate('/account');
          }
        }
      } else if (emailMode === 'reset') {
        await requestPasswordReset(email);
        toast.success('Ссылка для сброса отправлена на email.');
        setEmailMode('login');
      }
    } catch (error: any) {
      toast.error(error.message || 'Произошла ошибка. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeAuth();
    }
  };

  const providers = [
    { id: 'google', name: 'Google', color: '#4285F4', icon: '🔵' },
    { id: 'yandex', name: 'Яндекс ID', color: '#FC3F1D', icon: '🔴' },
    { id: 'mailru', name: 'Mail.ru', color: '#005FF9', icon: '📧' },
  ];

  if (!authModalOpen) return null;

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px'
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        ref={modalRef}
        style={{
          maxWidth: '480px',
          width: '100%',
          background: 'var(--surface)',
          borderRadius: '12px',
          padding: '32px',
          position: 'relative',
          maxHeight: '90vh',
          overflowY: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={closeAuth}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '24px',
            cursor: 'pointer',
            padding: '4px 8px'
          }}
          aria-label="Закрыть"
        >
          ×
        </button>

        <h2 id="auth-modal-title" style={{ fontSize: '28px', marginBottom: '8px', textAlign: 'center' }}>
          Войдите или зарегистрируйтесь
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px', textAlign: 'center', fontSize: '14px' }}>
          Выберите способ авторизации
        </p>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          borderBottom: '2px solid var(--border)'
        }}>
          <button
            onClick={() => setTab('oauth')}
            style={{
              flex: 1,
              padding: '12px',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === 'oauth' ? '2px solid var(--accent)' : 'none',
              color: tab === 'oauth' ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 600
            }}
          >
            Соцсети
          </button>
          <button
            onClick={() => setTab('email')}
            style={{
              flex: 1,
              padding: '12px',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === 'email' ? '2px solid var(--accent)' : 'none',
              color: tab === 'email' ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 600
            }}
          >
            Почта
          </button>
        </div>

        {/* OAuth Tab */}
        {tab === 'oauth' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {providers.map(provider => {
              const loginUrl = `${getLoginUrl(provider.id as any)}${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`;
              return (
                <a
                  key={provider.id}
                  href={loginUrl}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    padding: '14px 20px',
                    background: 'var(--card)',
                    color: 'var(--text)',
                    textDecoration: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 600,
                    border: '2px solid transparent',
                    transition: 'all 0.2s',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = provider.color;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'transparent';
                  }}
                >
                  <span style={{ fontSize: '20px' }}>{provider.icon}</span>
                  <span>Войти через {provider.name}</span>
                </a>
              );
            })}
          </div>
        )}

        {/* Email Tab */}
        {tab === 'email' && (
          <form onSubmit={handleEmailAuth}>
            {/* Login Mode */}
            {emailMode === 'login' && (
              <>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginBottom: '12px',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '14px'
                  }}
                />
                <input
                  type="password"
                  placeholder="Пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginBottom: '12px',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '14px'
                  }}
                />
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'var(--accent)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    marginBottom: '12px',
                    opacity: loading ? 0.7 : 1
                  }}
                >
                  {loading ? 'Загрузка...' : 'Войти'}
                </button>
                <div style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>
                  <button
                    type="button"
                    onClick={() => setEmailMode('register')}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
                  >
                    Зарегистрироваться
                  </button>
                  {' | '}
                  <button
                    type="button"
                    onClick={() => setEmailMode('reset')}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
                  >
                    Забыли пароль?
                  </button>
                </div>
              </>
            )}

            {/* Register Mode */}
            {emailMode === 'register' && (
              <>
                <input
                  type="text"
                  placeholder="Имя (необязательно)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginBottom: '12px',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '14px'
                  }}
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginBottom: '12px',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '14px'
                  }}
                />
                <input
                  type="password"
                  placeholder="Пароль (минимум 8 символов)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginBottom: '12px',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '14px'
                  }}
                />
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'var(--accent)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    marginBottom: '12px',
                    opacity: loading ? 0.7 : 1
                  }}
                >
                  {loading ? 'Загрузка...' : 'Зарегистрироваться'}
                </button>
                <div style={{ textAlign: 'center', fontSize: '14px' }}>
                  <button
                    type="button"
                    onClick={() => setEmailMode('login')}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
                  >
                    Уже есть аккаунт? Войти
                  </button>
                </div>
              </>
            )}

            {/* Reset Mode */}
            {emailMode === 'reset' && (
              <>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginBottom: '12px',
                    background: 'var(--card)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '14px'
                  }}
                />
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: 'var(--accent)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    marginBottom: '12px',
                    opacity: loading ? 0.7 : 1
                  }}
                >
                  {loading ? 'Загрузка...' : 'Отправить ссылку'}
                </button>
                <div style={{ textAlign: 'center', fontSize: '14px' }}>
                  <button
                    type="button"
                    onClick={() => setEmailMode('login')}
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
                  >
                    Вернуться ко входу
                  </button>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

