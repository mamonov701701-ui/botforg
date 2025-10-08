import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info } from 'lucide-react';

const Toast = ({ 
  type = 'info', // 'success', 'error', 'warning', 'info'
  message, 
  duration = 3000,
  onClose 
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => {
      setIsVisible(false);
      if (onClose) onClose();
    }, 300);
  };

  if (!isVisible) return null;

  const getToastConfig = () => {
    switch (type) {
      case 'success':
        return {
          icon: <CheckCircle className="w-5 h-5" />,
          bgColor: '#10b981',
          borderColor: '#059669',
          textColor: 'white'
        };
      case 'error':
        return {
          icon: <XCircle className="w-5 h-5" />,
          bgColor: '#ef4444',
          borderColor: '#dc2626',
          textColor: 'white'
        };
      case 'warning':
        return {
          icon: <AlertCircle className="w-5 h-5" />,
          bgColor: '#f59e0b',
          borderColor: '#d97706',
          textColor: 'white'
        };
      default:
        return {
          icon: <Info className="w-5 h-5" />,
          bgColor: '#3b82f6',
          borderColor: '#2563eb',
          textColor: 'white'
        };
    }
  };

  const config = getToastConfig();

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000,
        backgroundColor: config.bgColor,
        color: config.textColor,
        padding: '12px 16px',
        borderRadius: '8px',
        border: `1px solid ${config.borderColor}`,
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        maxWidth: '400px',
        minWidth: '300px',
        transform: isExiting ? 'translateX(100%)' : 'translateX(0)',
        opacity: isExiting ? 0 : 1,
        transition: 'all 0.3s ease',
        backdropFilter: 'blur(8px)'
      }}
    >
      <div style={{ flexShrink: 0 }}>
        {config.icon}
      </div>
      <div style={{ flex: 1, fontSize: '14px', fontWeight: '500' }}>
        {message}
      </div>
      <button
        onClick={handleClose}
        style={{
          background: 'none',
          border: 'none',
          color: config.textColor,
          cursor: 'pointer',
          padding: '4px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.7,
          transition: 'opacity 0.2s'
        }}
        onMouseEnter={(e) => e.target.style.opacity = '1'}
        onMouseLeave={(e) => e.target.style.opacity = '0.7'}
      >
        ×
      </button>
    </div>
  );
};

export default Toast;






















