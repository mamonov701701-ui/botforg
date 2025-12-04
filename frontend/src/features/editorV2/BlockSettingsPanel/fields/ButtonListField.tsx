import React, { useState } from 'react';
import { FieldProps } from './types';
import { Plus, Trash2, GripVertical } from 'lucide-react';

interface Button {
  label: string;
  branch?: string;
  action?: string;
}

export const ButtonListField: React.FC<FieldProps> = ({ field, value, onChange, error }) => {
  const buttons: Button[] = Array.isArray(value) ? value : [];

  const addButton = () => {
    onChange([...buttons, { label: '', action: 'next' }]);
  };

  const removeButton = (index: number) => {
    onChange(buttons.filter((_, i) => i !== index));
  };

  const updateButton = (index: number, updates: Partial<Button>) => {
    const newButtons = [...buttons];
    newButtons[index] = { ...newButtons[index], ...updates };
    onChange(newButtons);
  };

  return (
    <div>
      {/* Список кнопок */}
      {buttons.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {buttons.map((button, index) => (
            <div
              key={index}
              style={{
                background: '#1a1a2e',
                border: '1px solid #374151',
                borderRadius: 8,
                padding: 12,
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              {/* Drag handle (визуальный элемент) */}
              <div
                style={{
                  color: '#6b7280',
                  cursor: 'grab',
                  padding: '4px 0',
                }}
              >
                <GripVertical size={16} />
              </div>

              {/* Поля кнопки */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Текст кнопки */}
                <input
                  type="text"
                  value={button.label || ''}
                  onChange={e => updateButton(index, { label: e.target.value })}
                  placeholder="Текст кнопки..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#0f1729',
                    border: '1px solid #374151',
                    borderRadius: 6,
                    color: '#fff',
                    fontSize: 13,
                  }}
                />

                {/* Действие кнопки */}
                <select
                  value={button.action || 'next'}
                  onChange={e => updateButton(index, { action: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: '#0f1729',
                    border: '1px solid #374151',
                    borderRadius: 6,
                    color: '#9ca3af',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  <option value="next">Продолжить сценарий</option>
                  <option value="branch">Перейти по ветке (скоро)</option>
                  <option value="url">Открыть ссылку (скоро)</option>
                </select>
              </div>

              {/* Удалить кнопку */}
              <button
                onClick={() => removeButton(index)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Кнопка добавления */}
      <button
        onClick={addButton}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'transparent',
          border: '1px dashed #374151',
          borderRadius: 8,
          color: '#9ca3af',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = '#3b82f6';
          e.currentTarget.style.color = '#3b82f6';
          e.currentTarget.style.background = 'rgba(59, 130, 246, 0.05)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = '#374151';
          e.currentTarget.style.color = '#9ca3af';
          e.currentTarget.style.background = 'transparent';
        }}
      >
        <Plus size={16} />
        {buttons.length === 0 ? 'Добавить кнопку' : 'Добавить ещё кнопку'}
      </button>

      {/* Подсказка */}
      {buttons.length === 0 && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: '#6b7280',
            textAlign: 'center',
          }}
        >
          Кнопки помогают пользователю быстро ответить
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: '#ef4444',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
};
