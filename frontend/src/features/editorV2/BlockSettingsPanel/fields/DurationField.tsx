import React, { useState, useEffect } from 'react';
import { FieldProps } from './types';

export const DurationField: React.FC<FieldProps> = ({ field, value, onChange, error }) => {
  const [amount, setAmount] = useState(value?.amount || 0);
  const [unit, setUnit] = useState(value?.unit || 'seconds');

  useEffect(() => {
    if (value && typeof value === 'object') {
      setAmount(value.amount || 0);
      setUnit(value.unit || 'seconds');
    }
  }, [value]);

  const handleChange = (newAmount?: number, newUnit?: string) => {
    const a = newAmount ?? amount;
    const u = newUnit ?? unit;
    setAmount(a);
    setUnit(u);
    onChange({ amount: a, unit: u });
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="number"
          value={amount}
          onChange={e => handleChange(Number(e.target.value), undefined)}
          min={0}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: 8,
            border: error ? '1px solid #ef4444' : '1px solid #334155',
            background: '#0f2436',
            color: '#e2e8f0',
            fontSize: 14,
          }}
        />
        <select
          value={unit}
          onChange={e => handleChange(undefined, e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #334155',
            background: '#0f2436',
            color: '#e2e8f0',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          <option value="seconds">секунд</option>
          <option value="minutes">минут</option>
          <option value="hours">часов</option>
          <option value="days">дней</option>
        </select>
      </div>
      {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
};
