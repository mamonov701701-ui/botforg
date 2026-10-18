import React, { useState } from 'react';
import { loginEmail, registerEmail, requestPasswordReset } from '../../api/auth';
import { listLegalDocuments } from '../../api/legal';
import PasswordField from '../../components/PasswordField';

type EmailMode = 'login' | 'register' | 'reset';

export default function SignIn() {
  const [emailMode, setEmailMode] = useState<EmailMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
  const [personalDataConsentAccepted, setPersonalDataConsentAccepted] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    setUsernameStatus('');
    if (emailMode !== 'register' || username.length < 3) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/auth/email/username-availability?username=${encodeURIComponent(username)}`,
          { signal: controller.signal }
        );
        if (response.ok) setUsernameStatus((await response.json()).message);
      } catch (error: any) {
        if (error?.name !== 'AbortError') setUsernameStatus('Проверка ника временно недоступна');
      }
    }, 600);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [emailMode, username]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (emailMode === 'register') {
        const docs = await listLegalDocuments();
        const required = ['public_offer', 'privacy_policy', 'personal_data_consent'];
        const revisions = Object.fromEntries(
          required.map(type => {
            const doc = docs.find(item => item.doc_type === type && item.status === 'published');
            if (!doc) throw new Error('Юридические документы недоступны');
            return [type, doc.id];
          })
        );
        if (!termsAccepted || !privacyAcknowledged || !personalDataConsentAccepted)
          throw new Error('Подтвердите юридические условия');
        await registerEmail(email, password, name, username, dateOfBirth, revisions, {
          termsAccepted,
          privacyAcknowledged,
          personalDataConsentAccepted,
        });
        setMessage('Если регистрация возможна, проверьте почту для подтверждения адреса.');
        setTimeout(() => setEmailMode('login'), 2000);
      } else if (emailMode === 'login') {
        await loginEmail(email, password);
        setMessage('✅ Вход выполнен! Перенаправление...');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1000);
      } else if (emailMode === 'reset') {
        await requestPasswordReset(email);
        setMessage(
          'Если адрес подтверждён и почта доступна, новое письмо придёт. Откройте последнее письмо.'
        );
        setTimeout(() => setEmailMode('login'), 2000);
      }
    } catch (error: any) {
      setMessage(`❌ ${error.message || 'Произошла ошибка'}`);
    } finally {
      setLoading(false);
    }
  };

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
              <PasswordField
                id="signin-password"
                label="Пароль для входа"
                placeholder="Пароль"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="current-password"
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
                placeholder="Отображаемое имя"
                value={name}
                onChange={e => setName(e.target.value)}
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
              <label htmlFor="signin-register-username">
                Публичный ник — после выбора изменить нельзя
              </label>
              <input
                id="signin-register-username"
                value={username}
                onChange={event => setUsername(event.target.value)}
                minLength={3}
                maxLength={30}
                required
                autoComplete="off"
                aria-describedby="signin-username-status"
                style={{
                  width: '100%',
                  padding: 12,
                  marginBottom: 8,
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}
              />
              <div id="signin-username-status" role="status" aria-live="polite">
                {usernameStatus}
              </div>
              <label>
                Дата рождения{' '}
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={e => setDateOfBirth(e.target.value)}
                  required
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={e => setTermsAccepted(e.target.checked)}
                  required
                />{' '}
                Принимаю <a href="/legal/public-offer">оферту</a>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={privacyAcknowledged}
                  onChange={e => setPrivacyAcknowledged(e.target.checked)}
                  required
                />{' '}
                Ознакомился с <a href="/legal/privacy-policy">политикой конфиденциальности</a>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={personalDataConsentAccepted}
                  onChange={e => setPersonalDataConsentAccepted(e.target.checked)}
                  required
                />{' '}
                Даю <a href="/legal/personal-data-consent">согласие на обработку данных</a>
              </label>
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
              <PasswordField
                id="signin-register-password"
                label="Пароль для регистрации"
                placeholder="Пароль (минимум 8 символов)"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
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
                background: message.startsWith('❌')
                  ? 'var(--error)'
                  : message.startsWith('✅')
                    ? 'var(--success)'
                    : 'var(--surface)',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '14px',
              }}
            >
              {message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
