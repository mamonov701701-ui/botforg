import React, { useState } from 'react';
import { getLoginUrl, loginEmail, registerEmail, requestPasswordReset } from '../../api/auth';

type Tab = 'oauth' | 'email';
type EmailMode = 'login' | 'register' | 'reset';

export default function SignIn() {
  const [tab, setTab] = useState<Tab>('oauth');
  const [emailMode, setEmailMode] = useState<EmailMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (emailMode === 'register') {
        await registerEmail(email, password, name);
        setMessage('✅ Регистрация успешна! Проверьте email для подтверждения.');
        setTimeout(() => setEmailMode('login'), 2000);
      } else if (emailMode === 'login') {
        await loginEmail(email, password);
        setMessage('✅ Вход выполнен! Перенаправление...');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1000);
      } else if (emailMode === 'reset') {
        await requestPasswordReset(email);
        setMessage('✅ Ссылка для сброса отправлена на email.');
        setTimeout(() => setEmailMode('login'), 2000);
      }
    } catch (error: any) {
      setMessage(`❌ ${error.message || 'Произошла ошибка'}`);
    } finally {
      setLoading(false);
    }
  };

  const providers = [
    { id: 'google', name: 'Google', color: '#4285F4', icon: '🔵' },
    { id: 'yandex', name: 'Яндекс ID', color: '#FC3F1D', icon: '🔴' },
    { id: 'mailru', name: 'Mail.ru', color: '#005FF9', icon: '📧' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        padding: '20px',
      }}
    >
      <div style={{ maxWidth: '400px', width: '100%' }}>
        <h1 style={{ fontSize: '32px', marginBottom: '12px', textAlign: 'center' }}>
          Войдите или зарегистрируйтесь
        </h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: '24px', textAlign: 'center' }}>
          Выберите способ авторизации
        </p>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '24px',
            borderBottom: '2px solid var(--border)',
          }}
        >
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
              fontWeight: 600,
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
              fontWeight: 600,
            }}
          >
            Почта
          </button>
        </div>

        {/* OAuth Tab */}
        {tab === 'oauth' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {providers.map(provider => (
              <a
                key={provider.id}
                href={getLoginUrl(provider.id as any)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  padding: '14px 20px',
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  textDecoration: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: 600,
                  border: '2px solid transparent',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = provider.color;
                  e.currentTarget.style.background = 'var(--card)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.background = 'var(--surface)';
                }}
              >
                <span style={{ fontSize: '20px' }}>{provider.icon}</span>
                <span>Войти через {provider.name}</span>
              </a>
            ))}
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
                  onChange={e => setEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginBottom: '12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '14px',
                  }}
                />
                <input
                  type="password"
                  placeholder="Пароль"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginBottom: '12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '14px',
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
                  }}
                >
                  {loading ? 'Загрузка...' : 'Войти'}
                </button>
                <div style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>
                  <button
                    type="button"
                    onClick={() => setEmailMode('register')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                    }}
                  >
                    Зарегистрироваться
                  </button>
                  {' | '}
                  <button
                    type="button"
                    onClick={() => setEmailMode('reset')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                    }}
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
                  onChange={e => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginBottom: '12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '14px',
                  }}
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginBottom: '12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '14px',
                  }}
                />
                <input
                  type="password"
                  placeholder="Пароль (минимум 8 символов)"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginBottom: '12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '14px',
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
                  }}
                >
                  {loading ? 'Загрузка...' : 'Зарегистрироваться'}
                </button>
                <div style={{ textAlign: 'center', fontSize: '14px' }}>
                  <button
                    type="button"
                    onClick={() => setEmailMode('login')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                    }}
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
                  onChange={e => setEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '12px',
                    marginBottom: '12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text)',
                    fontSize: '14px',
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
                  }}
                >
                  {loading ? 'Загрузка...' : 'Отправить ссылку'}
                </button>
                <div style={{ textAlign: 'center', fontSize: '14px' }}>
                  <button
                    type="button"
                    onClick={() => setEmailMode('login')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent)',
                      cursor: 'pointer',
                    }}
                  >
                    Вернуться ко входу
                  </button>
                </div>
              </>
            )}

            {message && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '12px',
                  background: message.startsWith('✅') ? 'var(--success)' : 'var(--error)',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '14px',
                }}
              >
                {message}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
