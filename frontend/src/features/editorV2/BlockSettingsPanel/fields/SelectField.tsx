import React from 'react';
import { FieldProps } from './types';

export const SelectField: React.FC<FieldProps> = ({ field, value, onChange, error }) => {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
        {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 8,
          border: error ? '1px solid #ef4444' : '1px solid #334155',
          background: '#0f2436',
          color: '#e2e8f0',
          fontSize: 14,
          cursor: 'pointer',
        }}
      >
        <option value="">-- Выберите --</option>
        {field.options?.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
};

