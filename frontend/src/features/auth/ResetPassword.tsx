import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { resetPassword } from '../../api/auth';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      setMessage('❌ Пароли не совпадают');
      return;
    }

    const token = searchParams.get('token');
    if (!token) {
      setMessage('❌ Отсутствует токен сброса');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setMessage('✅ Пароль успешно изменен! Перенаправление...');
      setTimeout(() => navigate('/account'), 2000);
    } catch (error: any) {
      setMessage(`❌ ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)'
    }}>
      <form onSubmit={handleSubmit} style={{
        maxWidth: '400px',
        width: '100%',
        padding: '24px',
        background: 'var(--surface)',
        borderRadius: '12px'
      }}>
        <h1 style={{ marginBottom: '24px', textAlign: 'center' }}>Сброс пароля</h1>
        
        <input
          type="password"
          placeholder="Новый пароль"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          minLength={8}
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '12px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text)'
          }}
        />
        
        <input
          type="password"
          placeholder="Подтвердите пароль"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={8}
          style={{
            width: '100%',
            padding: '12px',
            marginBottom: '16px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            color: 'var(--text)'
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
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Загрузка...' : 'Изменить пароль'}
        </button>

        {message && (
          <div style={{
            marginTop: '16px',
            padding: '12px',
            background: message.startsWith('✅') ? 'var(--success)' : 'var(--error)',
            borderRadius: '8px',
            color: '#fff'
          }}>
            {message}
          </div>
        )}
      </form>
    </div>
  );
}

