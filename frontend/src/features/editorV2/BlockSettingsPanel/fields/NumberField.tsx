import React from 'react';
import { FieldProps } from './types';

export const NumberField: React.FC<FieldProps> = ({ field, value, onChange, error }) => {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
        {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      <input
        type="number"
        value={value ?? ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
        placeholder={field.label}
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
