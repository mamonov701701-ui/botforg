import React, { useState, useEffect } from 'react';
import { get } from '../api/client';

/**
 * HealthBanner - Shows warning when backend API is not responding
 * Only active in development mode
 */
const HealthBanner: React.FC = () => {
  const [apiDown, setApiDown] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only check health in development
    if (!import.meta.env.DEV) return;
    
    get('/healthz')
      .catch(() => setApiDown(true));
  }, []);

  if (!apiDown || dismissed) return null;

  return (
    <div
      style={{
        background: '#f59e0b',
        color: '#000',
        padding: '12px 20px',
        textAlign: 'center',
        fontSize: '14px',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        position: 'relative',
        zIndex: 10000,
      }}
    >
      <span>⚠️</span>
      <span>
        API не отвечает (localhost:8000). Запустите backend и обновите страницу.
      </span>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#000',
          fontSize: '20px',
          cursor: 'pointer',
          padding: '0 8px',
          fontWeight: 'bold',
          lineHeight: 1,
        }}
        aria-label="Закрыть"
      >
        ×
      </button>
    </div>
  );
};

export default HealthBanner;


