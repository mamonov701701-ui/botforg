import React from 'react';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * Компонент пустого состояния (когда нет данных)
 */
export default function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 20px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '64px', marginBottom: '24px' }}>{icon}</div>
      <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>{title}</h3>
      {description && (
        <p
          style={{
            color: 'var(--text-muted)',
            marginBottom: action ? '24px' : '0',
            maxWidth: '400px',
          }}
        >
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          style={{
            padding: '12px 24px',
            background: 'var(--primary)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--primary-hover)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--primary)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
