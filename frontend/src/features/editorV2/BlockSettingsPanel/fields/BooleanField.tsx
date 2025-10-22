import React from 'react';
import { FieldProps } from './types';

export const BooleanField: React.FC<FieldProps> = ({ field, value, onChange, error }) => {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={value || false}
          onChange={(e) => onChange(e.target.checked)}
          style={{
            width: 18,
            height: 18,
            cursor: 'pointer',
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
        </span>
      </label>
      {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
};

