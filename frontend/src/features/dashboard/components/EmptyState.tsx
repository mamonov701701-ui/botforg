import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: string | React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
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
export default function EmptyState({ icon = Inbox, title, description, action }: EmptyStateProps) {
  const isIconComponent = typeof icon !== 'string';

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
      <div
        style={{
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          background: 'rgba(255, 210, 76, 0.1)',
        }}
      >
        {isIconComponent ? (
          React.createElement(icon as React.ComponentType<any>, {
            size: 40,
            style: { color: 'var(--primary)' },
          })
        ) : (
          <div style={{ fontSize: '64px' }}>{icon}</div>
        )}
      </div>
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
            color: '#000',
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
