import React from 'react';
import { FieldProps } from './types';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import {
  normalizeMessageButtonAction,
  type MessageButtonAction,
} from '../../../../utils/messageButton';

interface Button {
  id?: string;
  label: string;
  action?: string;
  url?: string;
}

export const ButtonListField: React.FC<FieldProps> = ({
  field,
  value,
  onChange,
  error,
  isReadOnly,
  actionStyle = 'select',
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
      {buttons.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {buttons.map((button, index) => {
            const uiAction: MessageButtonAction = normalizeMessageButtonAction(button.action);
            return (
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

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {actionStyle !== 'radio' && (
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
                  )}

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

                  {actionStyle === 'radio' ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        padding: '8px 0',
                      }}
                    >
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          cursor: isReadOnly ? 'default' : 'pointer',
                          fontSize: 13,
                          color: '#e5e7eb',
                        }}
                      >
                        <input
                          type="radio"
                          name={`msg_btn_${index}_${field.name}`}
                          checked={uiAction === 'next'}
                          disabled={isReadOnly}
                          onChange={() => updateButton(index, { action: 'next', url: undefined })}
                          style={{ accentColor: '#3b82f6' }}
                        />
                        Продолжить сценарий
                      </label>
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          cursor: isReadOnly ? 'default' : 'pointer',
                          fontSize: 13,
                          color: '#e5e7eb',
                        }}
                      >
                        <input
                          type="radio"
                          name={`msg_btn_${index}_${field.name}`}
                          checked={uiAction === 'url'}
                          disabled={isReadOnly}
                          onChange={() => updateButton(index, { action: 'url' })}
                          style={{ accentColor: '#3b82f6' }}
                        />
                        Открыть ссылку
                      </label>
                    </div>
                  ) : (
                    <select
                      value={uiAction}
                      onChange={e => {
                        const v = e.target.value as MessageButtonAction;
                        if (v === 'next') {
                          updateButton(index, { action: 'next', url: undefined });
                        } else {
                          updateButton(index, { action: 'url' });
                        }
                      }}
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
                      <option value="url">Открыть ссылку</option>
                    </select>
                  )}

                  {uiAction === 'url' && (
                    <input
                      type="url"
                      value={button.url || ''}
                      onChange={e => updateButton(index, { url: e.target.value })}
                      placeholder="https://…"
                      readOnly={isReadOnly}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: isReadOnly ? '#020617' : '#0f1729',
                        border: '1px solid #374151',
                        borderRadius: 6,
                        color: '#e5e7eb',
                        fontSize: 13,
                        cursor: isReadOnly ? 'default' : 'text',
                      }}
                    />
                  )}
                </div>

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
            );
          })}
        </div>
      )}

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

      {buttons.length === 0 && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: '#6b7280',
            textAlign: 'center',
            lineHeight: 1.45,
          }}
        >
          {actionStyle === 'radio'
            ? 'По желанию. «Продолжить сценарий» — проведите ребро от выхода кнопки на холсте. «Открыть ссылку» — укажите адрес.'
            : 'Кнопки помогают пользователю быстро ответить. Для «Продолжить сценарий» проведите ребро от выхода кнопки на холсте; для «Открыть ссылку» укажите URL.'}
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
