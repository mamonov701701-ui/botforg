import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeTwoFactor } from '../../api/auth';

export default function TwoFactorLogin() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      await completeTwoFactor(null, code);
      navigate('/account');
    } catch {
      setError('Код неверен или срок подтверждения истёк.');
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
      <form
        onSubmit={submit}
        style={{ width: 'min(100%, 420px)', padding: 24, borderRadius: 16, background: '#15294b' }}
      >
        <h1>Подтверждение входа</h1>
        <label htmlFor="totp-login">Код из приложения или резервный код</label>
        <input
          id="totp-login"
          value={code}
          onChange={e => setCode(e.target.value)}
          required
          autoComplete="one-time-code"
          style={{ width: '100%', minHeight: 44, margin: '12px 0', boxSizing: 'border-box' }}
        />
        <button
          disabled={loading}
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
          {loading ? 'Проверяем…' : 'Войти'}
        </button>
        {error && (
          <p role="alert" style={{ color: '#FF3B30' }}>
            {error}
          </p>
        )}
      </form>
    </main>
  );
}
