import React from 'react';
import { FieldProps } from './types';

export const NumberField: React.FC<FieldProps> = ({
  field,
  value,
  onChange,
  error,
  onResetToDefault,
  isReadOnly,
}) => {
  const canReset = typeof field.default !== 'undefined' && !!onResetToDefault;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="number"
          value={value ?? ''}
          onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
          placeholder={field.label}
          readOnly={isReadOnly}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 8,
            border: error ? '1px solid #ef4444' : '1px solid #334155',
            background: isReadOnly ? '#020617' : '#0f2436',
            color: '#e2e8f0',
            fontSize: 14,
            cursor: isReadOnly ? 'default' : 'text',
            opacity: isReadOnly ? 0.85 : 1,
          }}
        />
        {canReset && !isReadOnly && (
          <button
            type="button"
            onClick={onResetToDefault}
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid #334155',
              background: 'transparent',
              color: '#9ca3af',
              fontSize: 11,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Сбросить
          </button>
        )}
      </div>
      {error && (
        <div
          style={{
            color: '#fecaca',
            fontSize: 11,
            marginTop: 4,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
};
