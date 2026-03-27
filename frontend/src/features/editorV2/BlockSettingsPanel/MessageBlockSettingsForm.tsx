import React, { useLayoutEffect, useRef } from 'react';
import type { BlockConfigField } from '../../../types/blocks';
import type { ValidationResult } from '../../../utils/schemaValidation';
import { isMessageBlockMediaValidationMessage } from '../../../utils/schemaValidation';
import { MediaListField } from './fields/MediaListField';
import { ButtonListField } from './fields/ButtonListField';
import { Bold, Italic, Link2 } from 'lucide-react';

function wrapSelection(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string
): { next: string; selStart: number; selEnd: number } {
  if (start === end) {
    const insert = before + after;
    const next = text.slice(0, start) + insert + text.slice(end);
    const pos = start + before.length;
    return { next, selStart: pos, selEnd: pos };
  }
  const selected = text.slice(start, end);
  const wrapped = before + selected + after;
  const next = text.slice(0, start) + wrapped + text.slice(end);
  return { next, selStart: start + before.length, selEnd: end + before.length };
}

function applyMarkdownLink(
  text: string,
  start: number,
  end: number
): { next: string; selStart: number; selEnd: number } {
  if (start === end) {
    const ins = '[текст](https://)';
    const next = text.slice(0, start) + ins + text.slice(end);
    return { next, selStart: start + 1, selEnd: start + 6 };
  }
  const sel = text.slice(start, end);
  const ins = `[${sel}](https://)`;
  const next = text.slice(0, start) + ins + text.slice(end);
  const cursor = start + ins.length;
  return { next, selStart: cursor, selEnd: cursor };
}

const divider: React.CSSProperties = {
  marginBottom: 16,
  paddingBottom: 16,
  borderBottom: '1px solid #1e293b',
};

const selectStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 280,
  padding: '6px 10px',
  fontSize: 13,
  borderRadius: 6,
  border: '1px solid #475569',
  background: '#0f172a',
  color: '#e2e8f0',
  outline: 'none',
};

const toolbarBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 9px',
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 4,
  border: '1px solid #475569',
  background: '#1e293b',
  color: '#cbd5e1',
  cursor: 'pointer',
};

export interface MessageBlockSettingsFormProps {
  settings: Record<string, unknown>;
  onFieldChange: (fieldName: string, value: unknown) => void;
  isReadOnly: boolean;
  textFieldConfig: BlockConfigField;
  buttonsFieldConfig: BlockConfigField;
  liveMessageSchema: ValidationResult | null;
  validateField: (field: BlockConfigField, value: unknown) => string | undefined;
}

export const MessageBlockSettingsForm: React.FC<MessageBlockSettingsFormProps> = ({
  settings,
  onFieldChange,
  isReadOnly,
  textFieldConfig,
  buttonsFieldConfig,
  liveMessageSchema,
  validateField,
}) => {
  const textValue = String(settings.text ?? '');
  const parseModeRaw = settings.parseMode;
  const parseMode: 'Plain' | 'Markdown' | 'HTML' =
    parseModeRaw === 'Markdown' || parseModeRaw === 'HTML' || parseModeRaw === 'Plain'
      ? parseModeRaw
      : 'Plain';

  const mediaType = (settings.mediaType as 'none' | 'image' | 'gif' | 'video') || 'none';

  const taRef = useRef<HTMLTextAreaElement>(null);
  const pendingSel = useRef<{ start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    const el = taRef.current;
    const p = pendingSel.current;
    if (el && p) {
      el.setSelectionRange(p.start, p.end);
      pendingSel.current = null;
    }
  }, [textValue]);

  const applyToSelection = (
    fn: (t: string, a: number, b: number) => { next: string; selStart: number; selEnd: number }
  ) => {
    if (isReadOnly) return;
    const el = taRef.current;
    if (!el) return;
    const t = textValue;
    const a = el.selectionStart;
    const b = el.selectionEnd;
    const { next, selStart, selEnd } = fn(t, a, b);
    pendingSel.current = { start: selStart, end: selEnd };
    onFieldChange('text', next);
  };

  const textError = validateField(textFieldConfig, settings.text);
  const mediaListErrors =
    liveMessageSchema?.missingFields.filter(isMessageBlockMediaValidationMessage) ?? [];
  const mediaListError = mediaListErrors.length > 0 ? mediaListErrors.join(' · ') : undefined;
  const buttonsError = validateField(buttonsFieldConfig, settings.buttons);
  const buttonsSchemaExtra =
    liveMessageSchema?.missingFields.filter(
      m => /кнопк/i.test(m) || /^URL кнопки/i.test(m) || /^Текст кнопки/i.test(m)
    ) ?? [];
  const buttonsDisplayError =
    [buttonsError, ...buttonsSchemaExtra].filter(Boolean).join(' · ') || undefined;

  return (
    <div style={{ marginTop: 2 }}>
      {/* Текст */}
      <div style={divider}>
        <div
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: '#e5e7eb',
            marginBottom: 8,
          }}
        >
          {textFieldConfig.label}
          {textFieldConfig.required && <span style={{ color: '#ef4444', marginLeft: 4 }}>*</span>}
        </div>

        <div
          style={{
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <label
            style={{
              fontSize: 12,
              color: '#9ca3af',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            Формат
            <select
              value={parseMode}
              disabled={isReadOnly}
              onChange={e => onFieldChange('parseMode', e.target.value)}
              style={{ ...selectStyle, maxWidth: 200 }}
            >
              <option value="Plain">Plain</option>
              <option value="Markdown">Markdown</option>
              <option value="HTML">HTML</option>
            </select>
          </label>
        </div>

        <div
          style={{
            marginBottom: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 11, color: '#64748b' }}>Вставка</span>
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => applyToSelection((t, a, b) => wrapSelection(t, a, b, '**', '**'))}
            title="Жирный"
            style={{
              ...toolbarBtn,
              opacity: isReadOnly ? 0.45 : 1,
              cursor: isReadOnly ? 'not-allowed' : 'pointer',
            }}
          >
            <Bold size={14} /> B
          </button>
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => applyToSelection((t, a, b) => wrapSelection(t, a, b, '_', '_'))}
            title="Курсив"
            style={{
              ...toolbarBtn,
              opacity: isReadOnly ? 0.45 : 1,
              cursor: isReadOnly ? 'not-allowed' : 'pointer',
            }}
          >
            <Italic size={14} /> I
          </button>
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => applyToSelection((t, a, b) => applyMarkdownLink(t, a, b))}
            title="Ссылка"
            style={{
              ...toolbarBtn,
              opacity: isReadOnly ? 0.45 : 1,
              cursor: isReadOnly ? 'not-allowed' : 'pointer',
            }}
          >
            <Link2 size={14} /> Ссылка
          </button>
        </div>

        <textarea
          ref={taRef}
          value={textValue}
          onChange={e => onFieldChange('text', e.target.value)}
          placeholder={textFieldConfig.placeholder || textFieldConfig.label}
          readOnly={isReadOnly}
          rows={6}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 6,
            border: textError ? '1px solid #ef4444' : '1px solid #334155',
            background: isReadOnly ? '#0a1624' : '#0f2436',
            color: '#e2e8f0',
            fontSize: 14,
            fontFamily: 'inherit',
            resize: 'vertical',
            opacity: isReadOnly ? 0.85 : 1,
          }}
        />

        <p
          style={{
            margin: '8px 0 0',
            fontSize: 11,
            color: '#64748b',
            lineHeight: 1.45,
          }}
        >
          Markdown: <code style={{ color: '#94a3b8' }}>**жирный**</code>,{' '}
          <code style={{ color: '#94a3b8' }}>_курсив_</code>,{' '}
          <code style={{ color: '#94a3b8' }}>[текст](url)</code>. HTML — с ограничениями в
          предпросмотре.
        </p>
        {textError && (
          <div style={{ color: '#fca5a5', fontSize: 12, marginTop: 8 }}>{textError}</div>
        )}
      </div>

      {/* Медиа */}
      <div
        style={{
          ...divider,
          borderBottom: mediaListError ? '1px solid rgba(239,68,68,0.25)' : divider.borderBottom,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: '#e5e7eb',
            marginBottom: 6,
          }}
        >
          Медиа
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
          Один тип на сообщение; несколько файлов или ссылок того же формата.
        </p>

        <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 10 }}>
          Тип
          <select
            value={mediaType}
            disabled={isReadOnly}
            onChange={e =>
              onFieldChange('mediaType', e.target.value as 'none' | 'image' | 'gif' | 'video')
            }
            style={{ ...selectStyle, display: 'block', marginTop: 6, maxWidth: '100%' }}
          >
            <option value="none">Без медиа</option>
            <option value="image">Картинка</option>
            <option value="gif">GIF</option>
            <option value="video">Видео</option>
          </select>
        </label>

        {mediaType !== 'none' && (
          <MediaListField
            value={(settings.mediaList as any) ?? []}
            onChange={v => onFieldChange('mediaList', v)}
            error={mediaListError}
            mediaType={mediaType}
            hideScopeHint
            variant="compact"
          />
        )}
      </div>

      {/* Кнопки */}
      <div
        style={{
          marginBottom: 8,
          paddingBottom: 4,
          borderBottom: buttonsDisplayError ? '1px solid rgba(239,68,68,0.25)' : 'none',
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: 13,
            color: '#e5e7eb',
            marginBottom: 8,
          }}
        >
          {buttonsFieldConfig.label || 'Кнопки'}
        </div>
        <ButtonListField
          field={buttonsFieldConfig}
          value={settings.buttons as any}
          onChange={v => onFieldChange('buttons', v)}
          error={buttonsDisplayError}
          isReadOnly={isReadOnly}
          allSettings={settings as any}
          actionStyle="radio"
        />
      </div>
    </div>
  );
};
