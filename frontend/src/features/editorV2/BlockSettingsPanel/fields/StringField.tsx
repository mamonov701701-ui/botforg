import React from 'react';
import { FieldProps } from './types';

export const StringField: React.FC<FieldProps> = ({ field, value, onChange, error }) => {
  return (
    <div>
      <input
        type="text"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder || field.label}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 8,
          border: error ? '1px solid #ef4444' : '1px solid #334155',
          background: '#0f2436',
          color: '#e2e8f0',
          fontSize: 14,
        }}
      />
      {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
};
