import React, { useMemo, useState } from 'react';
import {
  generateInputVariableKeyFromLabel,
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
  onSettingsPatch?: (patch: Record<string, unknown>) => void;
  isReadOnly: boolean;
}

const VALIDATION_TYPES: { value: InputValidationType; label: string }[] = [
  { value: 'string', label: 'Текст (любой ввод)' },
  { value: 'number', label: 'Число (только цифры)' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Телефон' },
  { value: 'date', label: 'Дата' },
];

export const InputBlockSettingsForm: React.FC<InputBlockSettingsFormProps> = ({
  settings,
  onFieldChange,
  onSettingsPatch,
  isReadOnly,
}) => {
  const merged = useMemo(() => migrateInputNodeSettings(settings), [settings]);
  const norm = useMemo(() => getNormalizedInputSettings(merged), [merged]);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  const handleAnswerNameChange = (value: string) => {
    if (onSettingsPatch) {
      const patch: Record<string, unknown> = { variable_label: value };
      if (!norm.variable_key_manual) {
        patch.variable_key = generateInputVariableKeyFromLabel(value);
      }
      onSettingsPatch(patch);
      return;
    }
    onFieldChange('variable_label', value);
    if (!norm.variable_key_manual) {
      onFieldChange('variable_key', generateInputVariableKeyFromLabel(value));
    }
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
          borderColor: !norm.variable_label ? 'rgba(239,68,68,0.35)' : 'transparent',
        }}
      >
        <div style={labelStyle}>
          Название ответа <span style={{ color: '#ef4444' }}>*</span>
        </div>
        <input
          type="text"
          value={norm.variable_label ?? ''}
          onChange={e => handleAnswerNameChange(e.target.value)}
          readOnly={isReadOnly}
          placeholder="Например: Имя"
          style={inputStyle}
        />
        <div style={hintStyle}>Например: Имя, Телефон, Город</div>
        {!norm.variable_label?.trim() && (
          <div style={{ ...hintStyle, color: '#f87171' }}>Укажите название ответа</div>
        )}
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
      </div>
      <div style={{ ...hintStyle, marginBottom: 14 }}>
        Ответ пользователя будет доступен как {'{{input}}'}
      </div>

      <div style={fieldBox}>
        <div style={labelStyle}>Тип ответа</div>
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
        <div style={{ ...hintStyle, marginTop: -2, marginBottom: 10 }}>
          Тип нужен, чтобы бот проверял правильность ответа
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setShowAdvanced(v => !v)}
          style={{
            width: '100%',
            padding: '10px 12px',
            background: showAdvanced ? '#1a1a2e' : 'transparent',
            border: '1px solid #374151',
            borderRadius: 8,
            color: '#9ca3af',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>Дополнительные настройки</span>
          <span
            style={{
              transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0)',
              transition: 'transform 0.2s',
            }}
          >
            ▼
          </span>
        </button>
      </div>

      {showAdvanced && (
        <div
          style={{
            ...fieldBox,
            borderColor:
              variableKeyError || rangeErr || regexErr ? 'rgba(239,68,68,0.35)' : 'transparent',
          }}
        >
          <div style={{ ...labelStyle, marginBottom: 10 }}>Системное имя</div>
          <input
            type="text"
            value={norm.variable_key}
            onChange={e => {
              onFieldChange('variable_key', e.target.value);
              onFieldChange('variable_key_manual', true);
            }}
            readOnly={isReadOnly}
            placeholder="Например: city"
            style={inputStyle}
          />
          <div style={hintStyle}>Используется для подстановки ответа в сообщениях</div>
          {!isReadOnly && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={norm.variable_key_manual === true}
                onChange={e => {
                  onFieldChange('variable_key_manual', e.target.checked);
                  if (!e.target.checked) {
                    onFieldChange(
                      'variable_key',
                      generateInputVariableKeyFromLabel(norm.variable_label ?? '')
                    );
                  }
                }}
              />
              <span style={{ fontSize: 12, color: '#cbd5e1' }}>Изменять вручную</span>
            </label>
          )}
          {variableKeyError && (
            <div style={{ ...hintStyle, color: '#f87171', marginTop: 8 }}>{variableKeyError}</div>
          )}

          <div style={{ ...labelStyle, marginTop: 14 }}>Подсказка в поле ввода</div>
          <input
            type="text"
            value={norm.placeholder ?? ''}
            onChange={e => onFieldChange('placeholder', e.target.value || undefined)}
            readOnly={isReadOnly}
            placeholder="Подсказка пользователю в инпуте"
            style={inputStyle}
          />

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 12,
              cursor: isReadOnly ? 'default' : 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={norm.trim}
              disabled={isReadOnly}
              onChange={e => onFieldChange('trim', e.target.checked)}
            />
            <span style={{ fontSize: 13, color: '#e5e7eb' }}>Автоматически очищать пробелы</span>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 12,
              cursor: isReadOnly ? 'default' : 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={norm.separate_error_branch !== false}
              disabled={isReadOnly}
              onChange={e => onFieldChange('separate_error_branch', e.target.checked)}
            />
            <span style={{ fontSize: 13, color: '#e5e7eb' }}>
              Если включено — можно задать отдельный сценарий при ошибке (например: «Введите число
              ещё раз»)
            </span>
          </label>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <div style={{ ...hintStyle, marginBottom: 4, width: '100%' }}>
              Ограничение длины ответа пользователя
            </div>
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
            <div style={{ ...hintStyle, marginBottom: 4 }}>
              Дополнительная проверка (для опытных пользователей)
            </div>
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
            <div style={{ ...hintStyle, color: '#f87171', marginTop: 8 }}>
              {rangeErr || regexErr}
            </div>
          )}
          <div style={{ ...labelStyle, marginTop: 14 }}>Сообщение об ошибке (опционально)</div>
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
      )}

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
