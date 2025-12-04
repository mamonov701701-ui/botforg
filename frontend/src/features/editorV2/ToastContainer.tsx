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
        top: 20,
        right: 20,
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none', // Не блокируем клики на элементы под ним
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
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            animation: 'slideIn 0.3s ease',
            pointerEvents: 'auto', // Включаем клики на самих toast
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

      {/* CSS for animations */}
      <style>
        {`
          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateX(100px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
        `}
      </style>
    </div>
  );
};

export default ToastContainer;
