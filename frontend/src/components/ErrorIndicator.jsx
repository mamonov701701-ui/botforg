import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

const ErrorIndicator = ({ error, onDismiss }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!error) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        backgroundColor: '#ef4444',
        color: 'white',
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid #dc2626',
        boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        maxWidth: '500px',
        minWidth: '200px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onClick={() => setIsExpanded(!isExpanded)}
      onMouseEnter={e => {
        e.target.style.backgroundColor = '#dc2626';
        e.target.style.transform = 'translateX(-50%) translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.target.style.backgroundColor = '#ef4444';
        e.target.style.transform = 'translateX(-50%) translateY(0)';
      }}
    >
      <AlertTriangle className="w-4 h-4" />
      <span style={{ fontSize: '12px', fontWeight: '500' }}>Ошибка</span>
      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}

      {isExpanded && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: '0',
            right: '0',
            backgroundColor: '#dc2626',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '0 0 6px 6px',
            fontSize: '11px',
            lineHeight: '1.4',
            border: '1px solid #b91c1c',
            borderTop: 'none',
            marginTop: '1px',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
};

export default ErrorIndicator;
