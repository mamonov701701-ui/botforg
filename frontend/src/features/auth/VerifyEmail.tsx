import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { verifyEmail } from '../../api/auth';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage('Отсутствует токен подтверждения');
      return;
    }

    verifyEmail(token)
      .then(() => {
        setStatus('success');
        setMessage('Email успешно подтвержден! Перенаправление...');
        setTimeout(() => navigate('/dashboard'), 2000);
      })
      .catch(error => {
        setStatus('error');
        setMessage(error.message);
      });
  }, [searchParams, navigate]);

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
      <div
        style={{
          maxWidth: '400px',
          padding: '24px',
          background: 'var(--surface)',
          borderRadius: '12px',
          textAlign: 'center',
        }}
      >
        {status === 'loading' && <p>Подтверждение email...</p>}
        {status === 'success' && <p style={{ color: 'var(--success)' }}>{message}</p>}
        {status === 'error' && <p style={{ color: 'var(--error)' }}>{message}</p>}
      </div>
    </div>
  );
}
