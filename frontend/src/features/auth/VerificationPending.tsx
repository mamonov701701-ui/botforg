import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { correctUnverifiedEmail, resendVerification } from '../../api/auth';
import PasswordField from '../../components/PasswordField';

export default function VerificationPending() {
  const [email, setEmail] = useState(
    () => sessionStorage.getItem('pendingVerificationEmail') || ''
  );
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const resend = async () => {
    if (!email) return;
    setLoading(true);
    try {
      sessionStorage.setItem('pendingVerificationEmail', email);
      await resendVerification(email);
      setMessage('Если адрес ожидает подтверждения, новое письмо будет отправлено.');
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось отправить письмо. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        background: '#0A1B3D',
        color: '#fff',
      }}
    >
      <section
        style={{ width: 'min(100%, 420px)', padding: 24, borderRadius: 16, background: '#15294b' }}
      >
        <h1>Проверьте почту</h1>
        <p>
          Если регистрация возможна, письмо для подтверждения придёт на указанный адрес. Откройте
          ссылку в письме и нажмите кнопку подтверждения.
        </p>
        <label htmlFor="verification-email">Адрес электронной почты</label>
        <input
          id="verification-email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ width: '100%', minHeight: 44, boxSizing: 'border-box', margin: '8px 0' }}
        />
        <button
          type="button"
          disabled={loading || !email}
          onClick={resend}
          style={{
            minHeight: 44,
            width: '100%',
            border: 0,
            borderRadius: 10,
            background: '#FFB300',
            color: '#0A1B3D',
            fontWeight: 700,
          }}
        >
          {loading ? 'Отправляем…' : 'Отправить письмо повторно'}
        </button>
        {message && <p role="status">{message}</p>}
        {email && (
          <details style={{ marginTop: 20 }}>
            <summary>Исправить адрес почты</summary>
            <form
              onSubmit={async event => {
                event.preventDefault();
                setLoading(true);
                try {
                  await correctUnverifiedEmail(email, password, newEmail);
                  sessionStorage.setItem('pendingVerificationEmail', newEmail);
                  setEmail(newEmail);
                  setPassword('');
                  setMessage('Подтвердите новый адрес по ссылке в письме.');
                } catch (error: any) {
                  setMessage(error?.message || 'Не удалось изменить адрес.');
                } finally {
                  setLoading(false);
                }
              }}
            >
              <label htmlFor="correct-email">Новый адрес</label>
              <input
                id="correct-email"
                type="email"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
                required
                style={{ display: 'block', width: '100%', minHeight: 44, boxSizing: 'border-box' }}
              />
              <label htmlFor="correct-password">Пароль аккаунта</label>
              <PasswordField
                id="correct-password"
                label="Пароль аккаунта"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                style={{ display: 'block' }}
              />
              <button disabled={loading} style={{ minHeight: 44, marginTop: 12 }}>
                Отправить подтверждение на новый адрес
              </button>
            </form>
          </details>
        )}
        <Link to="/" style={{ display: 'inline-block', marginTop: 16, color: '#FFB300' }}>
          На главную
        </Link>
      </section>
    </main>
  );
}
