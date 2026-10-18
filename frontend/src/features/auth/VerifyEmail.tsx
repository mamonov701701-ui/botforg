import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { previewEmailVerification, verifyEmail } from '../../api/auth';

export default function VerifyEmail() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token'));
  const [status, setStatus] = useState<'loading' | 'ready' | 'sending' | 'success' | 'error'>(
    'loading'
  );
  const [message, setMessage] = useState('');

  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
    if (!token) {
      setStatus('error');
      setMessage('Ссылка подтверждения недействительна.');
      return;
    }
    let canceled = false;
    previewEmailVerification(token)
      .then(() => {
        if (!canceled) setStatus('ready');
      })
      .catch(() => {
        if (!canceled) {
          setStatus('error');
          setMessage('Ссылка недействительна или срок её действия истёк.');
        }
      });
    return () => {
      canceled = true;
    };
  }, [token]);

  const confirm = async () => {
    if (!token || status !== 'ready') return;
    setStatus('sending');
    try {
      await verifyEmail(token);
      setStatus('success');
      setMessage('Адрес подтверждён. Теперь войдите в аккаунт.');
    } catch {
      setStatus('error');
      setMessage('Не удалось подтвердить адрес. Запросите новое письмо.');
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
        <h1>Подтверждение почты</h1>
        {status === 'loading' && <p>Проверяем ссылку…</p>}
        {status === 'ready' && (
          <>
            <p>Нажмите кнопку, чтобы подтвердить адрес электронной почты.</p>
            <button
              type="button"
              onClick={confirm}
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
              Подтвердить адрес
            </button>
          </>
        )}
        {status === 'sending' && <p>Подтверждаем адрес…</p>}
        {(status === 'success' || status === 'error') && <p role="status">{message}</p>}
        <Link to="/" style={{ display: 'inline-block', marginTop: 16, color: '#FFB300' }}>
          На главную
        </Link>
      </section>
    </main>
  );
}
