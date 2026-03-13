import React from 'react';
import { FieldProps } from './types';
import { Plus, Trash2, GripVertical } from 'lucide-react';

interface Button {
  id?: string;
  label: string;
  branch?: string;
  action?: string;
}

export const ButtonListField: React.FC<FieldProps> = ({
  field,
  value,
  onChange,
  error,
  isReadOnly,
}) => {
  const buttons: Button[] = Array.isArray(value) ? value : [];

  const addButton = () => {
    if (isReadOnly) return;
    const nextIndex = buttons.length + 1;
    const newId = `btn_${nextIndex}`;
    onChange([
      ...buttons,
      {
        id: newId,
        label: `Кнопка ${nextIndex}`,
        action: 'next',
      },
    ]);
  };

  const removeButton = (index: number) => {
    if (isReadOnly) return;
    onChange(buttons.filter((_, i) => i !== index));
  };

  const updateButton = (index: number, updates: Partial<Button>) => {
    if (isReadOnly) return;
    const newButtons = [...buttons];
    newButtons[index] = { ...newButtons[index], ...updates };
    onChange(newButtons);
  };

  const moveButton = (from: number, to: number) => {
    if (isReadOnly || from === to || to < 0 || to >= buttons.length) return;
    const next = [...buttons];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
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
              {/* Drag handle / reorder */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  color: '#6b7280',
                  padding: '4px 0',
                }}
              >
                <button
                  type="button"
                  disabled={isReadOnly || index === 0}
                  onClick={() => moveButton(index, index - 1)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: isReadOnly || index === 0 ? '#1f2937' : '#6b7280',
                    cursor: isReadOnly || index === 0 ? 'default' : 'pointer',
                    fontSize: 12,
                    padding: 0,
                  }}
                >
                  ▲
                </button>
                <GripVertical size={16} />
                <button
                  type="button"
                  disabled={isReadOnly || index === buttons.length - 1}
                  onClick={() => moveButton(index, index + 1)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: isReadOnly || index === buttons.length - 1 ? '#1f2937' : '#6b7280',
                    cursor: isReadOnly || index === buttons.length - 1 ? 'default' : 'pointer',
                    fontSize: 12,
                    padding: 0,
                  }}
                >
                  ▼
                </button>
              </div>

              {/* Поля кнопки */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Идентификатор кнопки */}
                <div
                  style={{
                    fontSize: 11,
                    color: '#9ca3af',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>ID: {button.id || `btn_${index + 1}`}</span>
                  <span style={{ opacity: 0.8 }}>#{index + 1}</span>
                </div>

                {/* Текст кнопки */}
                <input
                  type="text"
                  value={button.label || ''}
                  onChange={e => updateButton(index, { label: e.target.value })}
                  placeholder="Текст кнопки..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: isReadOnly ? '#020617' : '#0f1729',
                    border: '1px solid #374151',
                    borderRadius: 6,
                    color: '#fff',
                    fontSize: 13,
                    cursor: isReadOnly ? 'default' : 'text',
                    opacity: isReadOnly ? 0.85 : 1,
                  }}
                />

                {/* Действие кнопки */}
                <select
                  value={button.action || 'next'}
                  onChange={e => updateButton(index, { action: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: isReadOnly ? '#020617' : '#0f1729',
                    border: '1px solid #374151',
                    borderRadius: 6,
                    color: '#9ca3af',
                    fontSize: 12,
                    cursor: isReadOnly ? 'default' : 'pointer',
                    opacity: isReadOnly ? 0.85 : 1,
                  }}
                  disabled={isReadOnly}
                >
                  <option value="next">Продолжить сценарий</option>
                  <option value="branch">Перейти по ветке (скоро)</option>
                  <option value="url">Открыть ссылку (скоро)</option>
                </select>
              </div>

              {/* Удалить кнопку */}
              <button
                type="button"
                onClick={() => removeButton(index)}
                disabled={isReadOnly}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  cursor: isReadOnly ? 'default' : 'pointer',
                  padding: 4,
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: isReadOnly ? 0.4 : 1,
                }}
                onMouseEnter={e => {
                  if (!isReadOnly) {
                    e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                  }
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
        type="button"
        onClick={addButton}
        disabled={isReadOnly}
        style={{
          width: '100%',
          padding: '10px 12px',
          background: 'transparent',
          border: '1px dashed #374151',
          borderRadius: 8,
          color: '#9ca3af',
          fontSize: 13,
          fontWeight: 500,
          cursor: isReadOnly ? 'default' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          transition: 'all 0.2s ease',
          opacity: isReadOnly ? 0.5 : 1,
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
          Кнопки помогают пользователю быстро ответить. ID кнопок используется в условиях и
          переходах.
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
