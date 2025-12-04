import React from 'react';
import { FieldProps } from './types';

// Опция может быть строкой или объектом с value и label
type SelectOption = string | { value: string; label: string };

export const SelectField: React.FC<FieldProps> = ({ field, value, onChange, error }) => {
  // Нормализуем опции для единого формата
  const normalizeOption = (opt: SelectOption): { value: string; label: string } => {
    if (typeof opt === 'string') {
      return { value: opt, label: opt };
    }
    return opt;
  };

  return (
    <div>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value || null)}
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
        {(field.options as SelectOption[] | undefined)?.map(opt => {
          const { value: optValue, label: optLabel } = normalizeOption(opt);
          return (
            <option key={optValue} value={optValue}>
              {optLabel}
            </option>
          );
        })}
      </select>
      {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
};
