import React, { useState, useEffect } from 'react';
import { FieldProps } from './types';

export const JsonField: React.FC<FieldProps> = ({ field, value, onChange, error }) => {
  const [jsonString, setJsonString] = useState('');
  const [parseError, setParseError] = useState('');

  useEffect(() => {
    const str =
      typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : value || '{}';
    setJsonString(str);
  }, [value]);

  const handleChange = (text: string) => {
    setJsonString(text);
    try {
      const parsed = JSON.parse(text);
      onChange(parsed);
      setParseError('');
    } catch (e) {
      setParseError('Неверный JSON');
    }
  };

  return (
    <div>
      <textarea
        value={jsonString}
        onChange={e => handleChange(e.target.value)}
        rows={6}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 8,
          border: error || parseError ? '1px solid #ef4444' : '1px solid #334155',
          background: '#0f2436',
          color: '#e2e8f0',
          fontSize: 13,
          fontFamily: 'monospace',
          resize: 'vertical',
        }}
      />
      {parseError && (
        <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{parseError}</div>
      )}
      {error && <div style={{ color: '#ef4444', fontSize: 12, marginTop: 4 }}>{error}</div>}
    </div>
  );
};
