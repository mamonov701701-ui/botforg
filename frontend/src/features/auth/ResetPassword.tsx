import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { resetPassword } from '../../api/auth';
import PasswordField from '../../components/PasswordField';

export default function ResetPassword() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token'));
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || completed) return;

    if (newPassword !== confirmPassword) {
      setMessage('❌ Пароли не совпадают');
      return;
    }

    if (!token) {
      setMessage('❌ Отсутствует токен сброса');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setCompleted(true);
      setNewPassword('');
      setConfirmPassword('');
      setMessage('✅ Пароль изменён. Теперь войдите в аккаунт.');
      setTimeout(() => navigate('/'), 2000);
    } catch (error: any) {
      setMessage(
        `❌ ${error.message}. Если ссылка уже использована, запросите новую и откройте последнее письмо.`
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          maxWidth: '400px',
          width: '100%',
          padding: '24px',
          background: 'var(--bf-shell-bg)',
          borderRadius: 'var(--bf-shell-radius)',
          border: '1px solid var(--bf-shell-border)',
          boxShadow: 'var(--bf-shell-shadow)',
        }}
      >
        <h1 style={{ marginBottom: '24px', textAlign: 'center' }}>Сброс пароля</h1>
        <p>Если вы запросили несколько писем, используйте ссылку из последнего.</p>

        <PasswordField
          id="reset-new-password"
          label="Новый пароль"
          placeholder="Новый пароль"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '12px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text)',
          }}
        />

        <PasswordField
          id="reset-confirm-password"
          label="Подтвердите пароль"
          placeholder="Подтвердите пароль"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          autoComplete="new-password"
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '16px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text)',
          }}
        />

        <button
          type="submit"
          disabled={loading || completed}
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
          }}
        >
          {loading ? 'Загрузка...' : 'Изменить пароль'}
        </button>

        {message && (
          <div
            style={{
              marginTop: '16px',
              padding: '12px',
              background: message.startsWith('✅') ? 'var(--success)' : 'var(--error)',
              borderRadius: '8px',
              color: '#fff',
            }}
          >
            {message}
          </div>
        )}
      </form>
    </div>
  );
}
