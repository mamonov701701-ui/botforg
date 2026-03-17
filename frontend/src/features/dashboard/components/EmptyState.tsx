import React from 'react';
import { Inbox } from 'lucide-react';
import { toast } from '../../../utils/toast';

interface EmptyStateProps {
  icon?: string | React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    disabledMessage?: string;
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
          onClick={() => {
            if (action.disabled && action.disabledMessage) {
              toast.warning(action.disabledMessage);
            } else if (action.onClick) {
              action.onClick();
            }
          }}
          style={{
            padding: '12px 24px',
            background: action.disabled ? 'var(--card)' : 'var(--primary)',
            color: action.disabled ? 'var(--text-muted)' : '#000',
            border: action.disabled ? '1px solid var(--border)' : 'none',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: 600,
            cursor: action.disabled ? 'not-allowed' : 'pointer',
            opacity: action.disabled ? 0.7 : 1,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => {
            if (!action.disabled) {
              e.currentTarget.style.background = 'var(--primary-hover)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }
          }}
          onMouseLeave={e => {
            if (!action.disabled) {
              e.currentTarget.style.background = 'var(--primary)';
              e.currentTarget.style.transform = 'translateY(0)';
            }
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
