import React, { useLayoutEffect, useRef, useEffect, useState, useMemo } from 'react';
import type { BlockConfigField } from '../../../types/blocks';
import type { ValidationResult } from '../../../utils/schemaValidation';
import { isMessageBlockMediaValidationMessage } from '../../../utils/schemaValidation';
import { MediaListField } from './fields/MediaListField';
import { ButtonListField } from './fields/ButtonListField';
import { Bold, Braces, Italic, Link2 } from 'lucide-react';
import { PLACEHOLDER_PATTERN } from '../../../lib/templateRender';
import {
  fetchVariableDefinitions,
  postMessageTemplateDiagnostics,
  type VariableDefinitionItem,
  type MessageTemplateDiagnosticsResponse,
} from '../../../api/botMessageTemplate';

const USER_PROFILE_SNIPPETS: string[] = [
  'user.first_name',
  'user.last_name',
  'user.username',
  'user.phone',
  'user.email',
];

function PlaceholderAnnotatedPreview({
  text,
  unknownSet,
}: {
  text: string;
  unknownSet: Set<string>;
}) {
  if (!text) return null;
  const nodes: React.ReactNode[] = [];
  const re = new RegExp(PLACEHOLDER_PATTERN.source, 'g');
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(
        <span key={`t-${last}-${m.index}`} style={{ whiteSpace: 'pre-wrap' }}>
          {text.slice(last, m.index)}
        </span>
      );
    }
    const token = m[1];
    const bad = unknownSet.has(token);
    nodes.push(
      <mark
        key={`ph-${m.index}`}
        style={{
          background: bad ? 'rgba(239,68,68,0.38)' : 'rgba(34,197,94,0.22)',
          color: '#e2e8f0',
          borderRadius: 3,
          padding: '0 3px',
          whiteSpace: 'pre-wrap',
        }}
      >
        {m[0]}
      </mark>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    nodes.push(
      <span key={`t-end`} style={{ whiteSpace: 'pre-wrap' }}>
        {text.slice(last)}
      </span>
    );
  }
  return (
    <div
      title="Зелёный — ключ из определений бота / допустимый user.*; красный — не найден в списке определений"
      style={{
        marginTop: 8,
        padding: '8px 10px',
        borderRadius: 6,
        border: '1px solid #334155',
        background: '#0b1220',
        fontSize: 12,
        lineHeight: 1.5,
        maxHeight: 120,
        overflowY: 'auto',
        fontFamily: 'ui-monospace, monospace',
        color: '#cbd5e1',
      }}
    >
      {nodes}
    </div>
  );
}

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
  /** Platform Bot.id из редактора — определения ctor и диагностика плейсхолдеров */
  platformBotId?: number | null;
}

export const MessageBlockSettingsForm: React.FC<MessageBlockSettingsFormProps> = ({
  settings,
  onFieldChange,
  isReadOnly,
  textFieldConfig,
  buttonsFieldConfig,
  liveMessageSchema,
  validateField,
  platformBotId = null,
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

  const [varDefs, setVarDefs] = useState<VariableDefinitionItem[]>([]);
  const [ctorLinked, setCtorLinked] = useState<boolean | null>(null);
  const [varMenuOpen, setVarMenuOpen] = useState(false);
  const [diag, setDiag] = useState<MessageTemplateDiagnosticsResponse | null>(null);

  useEffect(() => {
    if (!platformBotId) {
      setVarDefs([]);
      setCtorLinked(null);
      return;
    }
    let cancelled = false;
    fetchVariableDefinitions(platformBotId)
      .then(res => {
        if (cancelled) return;
        setCtorLinked(res.ctor_bot_linked);
        setVarDefs(res.items || []);
      })
      .catch(() => {
        if (!cancelled) {
          setCtorLinked(false);
          setVarDefs([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [platformBotId]);

  useEffect(() => {
    if (!platformBotId || !textValue.includes('{{')) {
      setDiag(null);
      return;
    }
    const id = window.setTimeout(() => {
      postMessageTemplateDiagnostics(platformBotId, textValue)
        .then(setDiag)
        .catch(() => setDiag(null));
    }, 420);
    return () => clearTimeout(id);
  }, [platformBotId, textValue]);

  const unknownSet = useMemo(() => new Set(diag?.unknown_keys ?? []), [diag?.unknown_keys]);

  const hasUnknownPlaceholders = (diag?.unknown_keys?.length ?? 0) > 0;

  const insertSnippet = (inner: string) => {
    if (isReadOnly) return;
    const el = taRef.current;
    const snippet = inner.includes('{{') ? inner : `{{${inner}}}`;
    if (!el) {
      onFieldChange('text', `${textValue}${snippet}`);
      return;
    }
    const a = el.selectionStart;
    const b = el.selectionEnd;
    const t = textValue;
    const next = t.slice(0, a) + snippet + t.slice(b);
    const pos = a + snippet.length;
    pendingSel.current = { start: pos, end: pos };
    onFieldChange('text', next);
    setVarMenuOpen(false);
  };

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

          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              type="button"
              disabled={isReadOnly || !platformBotId}
              onClick={() => setVarMenuOpen(v => !v)}
              title={
                platformBotId
                  ? 'Вставить переменную {{ key }}'
                  : 'Выберите бота сценария для списка переменных'
              }
              style={{
                ...toolbarBtn,
                opacity: isReadOnly || !platformBotId ? 0.45 : 1,
                cursor: isReadOnly || !platformBotId ? 'not-allowed' : 'pointer',
              }}
            >
              <Braces size={14} /> Переменная
            </button>
            {varMenuOpen && platformBotId && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 6,
                  zIndex: 50,
                  minWidth: 260,
                  maxWidth: 320,
                  maxHeight: 220,
                  overflowY: 'auto',
                  background: '#0f172a',
                  border: '1px solid #475569',
                  borderRadius: 8,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                  padding: 8,
                }}
              >
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6, fontWeight: 600 }}>
                  Ключи бота
                </div>
                {varDefs.length === 0 && (
                  <div style={{ fontSize: 11, color: '#94a3b8', padding: 6 }}>
                    {ctorLinked === false
                      ? 'Конструктор переменных не связан с этим ботом — список пуст.'
                      : 'Загрузка…'}
                  </div>
                )}
                {varDefs.map(row => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => insertSnippet(row.key)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 8px',
                      marginBottom: 4,
                      border: 'none',
                      borderRadius: 4,
                      background: '#1e293b',
                      color: '#e2e8f0',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <code style={{ color: '#7dd3fc' }}>{`{{${row.key}}}`}</code>
                    {row.label ? (
                      <span style={{ marginLeft: 8, opacity: 0.75 }}>{row.label}</span>
                    ) : null}
                  </button>
                ))}
                <div
                  style={{
                    fontSize: 10,
                    color: '#64748b',
                    margin: '10px 0 6px',
                    fontWeight: 600,
                  }}
                >
                  Профиль (user.*)
                </div>
                {USER_PROFILE_SNIPPETS.map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => insertSnippet(k)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '6px 8px',
                      marginBottom: 4,
                      border: 'none',
                      borderRadius: 4,
                      background: '#162032',
                      color: '#cbd5e1',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    <code>{`{{${k}}}`}</code>
                  </button>
                ))}
              </div>
            )}
          </div>
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
            border: textError
              ? '1px solid #ef4444'
              : hasUnknownPlaceholders
                ? '1px solid rgba(245,158,11,0.65)'
                : '1px solid #334155',
            background: isReadOnly ? '#0a1624' : '#0f2436',
            color: '#e2e8f0',
            fontSize: 14,
            fontFamily: 'inherit',
            resize: 'vertical',
            opacity: isReadOnly ? 0.85 : 1,
          }}
        />

        {textValue.includes('{{') && (
          <>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
              Подсказка по плейсхолдерам (только подстановка <code>{'{{ }}'}</code>, без исполнения
              кода)
            </div>
            <PlaceholderAnnotatedPreview text={textValue} unknownSet={unknownSet} />
            {diag?.placeholder_keys && diag.placeholder_keys.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: '#94a3b8',
                  lineHeight: 1.45,
                }}
              >
                <span style={{ fontWeight: 600, color: '#cbd5e1' }}>В этом сообщении: </span>
                {diag.placeholder_keys.map((k, i) => (
                  <span key={`${k}-${i}`}>
                    <code
                      style={{
                        color: hasUnknownPlaceholders && unknownSet.has(k) ? '#fbbf24' : '#86efac',
                      }}
                    >{`{{${k}}}`}</code>
                    {i < diag.placeholder_keys.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            )}
            {hasUnknownPlaceholders && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: '#fbbf24',
                  lineHeight: 1.4,
                }}
              >
                Не найдены в определениях бота:{' '}
                <strong>{(diag?.unknown_keys ?? []).join(', ')}</strong> — при отправке подставится
                пустая строка, в логах будет предупреждение.
              </div>
            )}
          </>
        )}

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
