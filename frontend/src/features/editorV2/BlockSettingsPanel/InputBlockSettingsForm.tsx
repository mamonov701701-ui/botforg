import React, { useMemo } from 'react';
import {
  getNormalizedInputSettings,
  migrateInputNodeSettings,
  validateInputVariableKey,
  validateRegexPattern,
  type InputValidationType,
} from '../../../utils/inputBlock';

const fieldBox: React.CSSProperties = {
  marginBottom: 16,
  padding: 12,
  background: 'rgba(30, 41, 59, 0.5)',
  borderRadius: 8,
  border: '1px solid transparent',
};

const labelStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 13,
  color: '#e5e7eb',
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 6,
  color: '#e5e7eb',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box' as const,
};

const hintStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#9ca3af',
  marginTop: 6,
};

export interface InputBlockSettingsFormProps {
  settings: Record<string, unknown>;
  onFieldChange: (fieldName: string, value: unknown) => void;
  isReadOnly: boolean;
}

const VALIDATION_TYPES: { value: InputValidationType; label: string }[] = [
  { value: 'string', label: 'Строка' },
  { value: 'number', label: 'Число' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Телефон' },
  { value: 'date', label: 'Дата (ГГГГ-ММ-ДД)' },
];

export const InputBlockSettingsForm: React.FC<InputBlockSettingsFormProps> = ({
  settings,
  onFieldChange,
  isReadOnly,
}) => {
  const merged = useMemo(() => migrateInputNodeSettings(settings), [settings]);
  const norm = useMemo(() => getNormalizedInputSettings(merged), [merged]);

  const v = norm.validation;
  const variableKeyError = validateInputVariableKey(norm.variable_key);

  const minL = v.min_length;
  const maxL = v.max_length;
  const rangeErr =
    minL != null && maxL != null && minL > maxL
      ? 'Мин. длина не может быть больше макс.'
      : undefined;
  const regexErr = v.regex ? validateRegexPattern(v.regex) : undefined;

  const setValidationPatch = (patch: Record<string, unknown>) => {
    onFieldChange('validation', { ...v, ...patch });
  };

  return (
    <>
      <div
        style={{
          marginBottom: 12,
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          color: '#6b7280',
        }}
      >
        Блок «Ввод»
      </div>

      <div
        style={{
          ...fieldBox,
          borderColor: !norm.question_text.trim() ? 'rgba(239,68,68,0.35)' : 'transparent',
        }}
      >
        <div style={labelStyle}>
          Текст вопроса <span style={{ color: '#ef4444' }}>*</span>
        </div>
        <textarea
          value={norm.question_text}
          onChange={e => onFieldChange('question_text', e.target.value)}
          readOnly={isReadOnly}
          placeholder="Например: Как вас зовут?"
          rows={3}
          style={{ ...inputStyle, minHeight: 72, resize: 'vertical' as const }}
        />
        {!norm.question_text.trim() && (
          <div style={{ ...hintStyle, color: '#f87171' }}>Введите текст вопроса</div>
        )}
      </div>

      <div
        style={{
          ...fieldBox,
          borderColor: variableKeyError ? 'rgba(239,68,68,0.35)' : 'transparent',
        }}
      >
        <div style={labelStyle}>
          Ключ переменной (snake_case) <span style={{ color: '#ef4444' }}>*</span>
        </div>
        <input
          type="text"
          value={norm.variable_key}
          onChange={e => onFieldChange('variable_key', e.target.value)}
          readOnly={isReadOnly}
          placeholder="например user_name"
          style={inputStyle}
        />
        <div style={hintStyle}>Латиница, цифры и _; первая символ — буква a–z</div>
        {variableKeyError && (
          <div style={{ ...hintStyle, color: '#f87171', marginTop: 8 }}>{variableKeyError}</div>
        )}
      </div>

      <div style={fieldBox}>
        <div style={labelStyle}>Название переменной</div>
        <input
          type="text"
          value={norm.variable_label ?? ''}
          onChange={e => onFieldChange('variable_label', e.target.value || undefined)}
          readOnly={isReadOnly}
          placeholder="Для подсказок в конструкторе (необязательно)"
          style={inputStyle}
        />
      </div>

      <div style={fieldBox}>
        <div style={labelStyle}>Placeholder в поле ввода</div>
        <input
          type="text"
          value={norm.placeholder ?? ''}
          onChange={e => onFieldChange('placeholder', e.target.value || undefined)}
          readOnly={isReadOnly}
          placeholder="Подсказка пользователю в инпуте"
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: isReadOnly ? 'default' : 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={norm.required}
            disabled={isReadOnly}
            onChange={e => onFieldChange('required', e.target.checked)}
          />
          <span style={{ fontSize: 13, color: '#e5e7eb' }}>Обязательный ответ</span>
        </label>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: isReadOnly ? 'default' : 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={norm.trim}
            disabled={isReadOnly}
            onChange={e => onFieldChange('trim', e.target.checked)}
          />
          <span style={{ fontSize: 13, color: '#e5e7eb' }}>Убирать пробелы по краям</span>
        </label>
      </div>

      <div
        style={{
          ...fieldBox,
          borderColor: rangeErr || regexErr ? 'rgba(239,68,68,0.35)' : 'transparent',
        }}
      >
        <div style={labelStyle}>Тип и правила валидации</div>
        <select
          value={v.type}
          disabled={isReadOnly}
          onChange={e => setValidationPatch({ type: e.target.value as InputValidationType })}
          style={{ ...inputStyle, maxWidth: 280, marginBottom: 10 }}
        >
          {VALIDATION_TYPES.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <div style={{ flex: '1 1 120px' }}>
            <div style={{ ...hintStyle, marginBottom: 4 }}>Мин. длина</div>
            <input
              type="number"
              value={minL ?? ''}
              disabled={isReadOnly}
              onChange={e => {
                const raw = e.target.value;
                setValidationPatch({
                  min_length: raw === '' ? undefined : Number(raw),
                });
              }}
              style={inputStyle}
              min={0}
            />
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <div style={{ ...hintStyle, marginBottom: 4 }}>Макс. длина</div>
            <input
              type="number"
              value={maxL ?? ''}
              disabled={isReadOnly}
              onChange={e => {
                const raw = e.target.value;
                setValidationPatch({
                  max_length: raw === '' ? undefined : Number(raw),
                });
              }}
              style={inputStyle}
              min={0}
            />
          </div>
        </div>
        <div>
          <div style={{ ...hintStyle, marginBottom: 4 }}>Регулярное выражение (опционально)</div>
          <input
            type="text"
            value={v.regex ?? ''}
            disabled={isReadOnly}
            onChange={e =>
              setValidationPatch({
                regex: e.target.value.trim() === '' ? undefined : e.target.value,
              })
            }
            placeholder="Например ^[A-Z]+$"
            style={inputStyle}
          />
        </div>
        {(rangeErr || regexErr) && (
          <div style={{ ...hintStyle, color: '#f87171', marginTop: 8 }}>{rangeErr || regexErr}</div>
        )}
      </div>

      <div style={fieldBox}>
        <div style={labelStyle}>Сообщение об ошибке (опционально)</div>
        <input
          type="text"
          value={norm.error_message ?? ''}
          onChange={e =>
            onFieldChange(
              'error_message',
              e.target.value.trim() === '' ? undefined : e.target.value
            )
          }
          readOnly={isReadOnly}
          placeholder="Заменяет стандартный текст при ошибке валидации"
          style={inputStyle}
        />
      </div>

      <div
        style={{
          marginTop: 8,
          padding: 12,
          background: 'rgba(59,130,246,0.08)',
          borderRadius: 8,
          fontSize: 12,
          color: '#93c5fd',
          lineHeight: 1.5,
        }}
      >
        Исходящие связи: ветка <strong>Успех</strong> (после корректного ввода) и опционально{' '}
        <strong>Ошибка</strong> (если подключена — переход при ошибке валидации; иначе сообщение об
        ошибке остаётся в чате и блок повторяет запрос).
      </div>
    </>
  );
};
