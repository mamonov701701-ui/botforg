import React from 'react';

interface LoadingStateProps {
  text?: string;
}

/**
 * Компонент состояния загрузки
 */
export default function LoadingState({ text = 'Загрузка...' }: LoadingStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 20px',
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          border: '4px solid var(--border)',
          borderTop: '4px solid var(--primary)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '16px',
        }}
      />
      <p style={{ color: 'var(--text-muted)' }}>{text}</p>
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
}
