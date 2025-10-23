import React from 'react';
import { useEditorStore } from '../../stores/editorStore';

const ToastContainer: React.FC = () => {
  const toasts = useEditorStore(state => state.toasts);
  const removeToast = useEditorStore(state => state.removeToast);

  if (toasts.length === 0) return null;

  const getToastColor = (type: string) => {
    switch (type) {
      case 'success':
        return '#22c55e';
      case 'warning':
        return '#f59e0b';
      case 'error':
        return '#ef4444';
      default:
        return '#3b82f6';
    }
  };

  const getToastIcon = (type: string) => {
    switch (type) {
      case 'success':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'error':
        return '❌';
      default:
        return 'ℹ️';
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 80,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {toasts.map(toast => (
        <div
          key={toast.id}
          style={{
            background: '#1a1a2e',
            border: `2px solid ${getToastColor(toast.type)}`,
            borderRadius: 8,
            padding: '12px 16px',
            minWidth: 300,
            maxWidth: 400,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            animation: 'slideIn 0.3s ease',
          }}
        >
          <span style={{ fontSize: 20 }}>{getToastIcon(toast.type)}</span>
          <div style={{ flex: 1 }}>
            <div
              style={{
                color: '#fff',
                fontSize: 14,
                lineHeight: 1.4,
                fontWeight: 500,
              }}
            >
              {toast.message}
            </div>
          </div>
          <button
            onClick={() => removeToast(toast.id)}
            style={{
              background: 'none',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              fontSize: 18,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
