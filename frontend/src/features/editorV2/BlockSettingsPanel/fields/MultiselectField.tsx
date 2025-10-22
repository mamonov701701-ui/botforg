import React from 'react';
import { FieldProps } from './types';

export const MultiselectField: React.FC<FieldProps> = ({ field, value, onChange, error }) => {
  const selectedValues = Array.isArray(value) ? value : [];
  
  const toggleOption = (option: string) => {
    const newValues = selectedValues.includes(option)
      ? selectedValues.filter(v => v !== option)
      : [...selectedValues, option];
    onChange(newValues);
  };
  
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
        {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>
      <div style={{
        padding: 8,
        borderRadius: 8,
        border: error ? '1px solid #ef4444' : '1px solid #334155',
        background: '#0f2436',
      }}>
        {field.options?.map(opt => (
          <label
            key={opt}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 4px',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            <input
              type="checkbox"
              checked={selectedValues.includes(opt)}
              onChange={() => toggleOption(opt)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
      {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
};

