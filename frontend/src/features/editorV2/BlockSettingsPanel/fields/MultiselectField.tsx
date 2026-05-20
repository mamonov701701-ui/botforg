import React from 'react';
import { FieldProps } from './types';
import type { SelectOption } from '../../../../types/blocks';

function optionValue(opt: SelectOption): string {
  return typeof opt === 'string' ? opt : opt.value;
}

function optionLabel(opt: SelectOption): string {
  return typeof opt === 'string' ? opt : opt.label;
}

export const MultiselectField: React.FC<FieldProps> = ({ field, value, onChange, error }) => {
  const selectedValues = Array.isArray(value) ? value : [];

  const toggleOption = (option: SelectOption) => {
    const key = optionValue(option);
    const newValues = selectedValues.includes(key)
      ? selectedValues.filter(v => v !== key)
      : [...selectedValues, key];
    onChange(newValues);
  };

  return (
    <div>
      <div
        style={{
          padding: 8,
          borderRadius: 8,
          border: error ? '1px solid #ef4444' : '1px solid #334155',
          background: '#0f2436',
        }}
      >
        {field.options?.map(opt => (
          <label
            key={optionValue(opt)}
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
              checked={selectedValues.includes(optionValue(opt))}
              onChange={() => toggleOption(opt)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <span>{optionLabel(opt)}</span>
          </label>
        ))}
      </div>
      {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
};
