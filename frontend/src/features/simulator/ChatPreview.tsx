import React, { useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import type { SimulatorMessage } from './scenarioRunner';

function BotFormattedText({
  text,
  parseMode,
}: {
  text: string;
  parseMode?: 'Plain' | 'Markdown' | 'HTML';
}) {
  const mode = parseMode ?? 'Plain';
  const baseStyle: React.CSSProperties = {
    minWidth: 0,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  };

  if (mode === 'HTML') {
    return (
      <div
        style={{ ...baseStyle, whiteSpace: 'pre-wrap' }}
        // Контент из сценария; просмотр только у доверенных авторов
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(text, { USE_PROFILES: { html: true } }),
        }}
      />
    );
  }

  if (mode === 'Markdown') {
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<em>$1</em>');
    html = html.replace(
      /\[(.+?)\]\((https?:[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
    html = html.replace(/\n/g, '<br />');
    return (
      <div
        style={{ ...baseStyle, lineHeight: 1.45 }}
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['strong', 'em', 'a', 'br', 'code'],
            ALLOWED_ATTR: ['href', 'target', 'rel'],
          }),
        }}
      />
    );
  }

  return <div style={{ ...baseStyle, whiteSpace: 'pre-wrap' }}>{text}</div>;
}

interface ChatPreviewProps {
  messages: SimulatorMessage[];
  onButtonClick: (button: {
    label: string;
    sourceHandle?: string | null;
    buttonId?: string;
  }) => void;
  /** Ожидается свободный текст (блок «Ввод») */
  showTextInput?: boolean;
  onSubmitText?: (text: string) => void;
  textInputPlaceholder?: string;
  /** Если true — можно отправить пустую строку (блок с required: false) */
  textInputAllowEmpty?: boolean;
  /** Сообщение, у которого кнопки сейчас активны (остальные — как архив, без клика) */
  activeButtonMessageId?: string | null;
  /** Индикатор «бот печатает» во время паузы wait */
  showTypingIndicator?: boolean;
}

/** Единый стиль reply-клавиатуры (как в мессенджере): прямоугольники, одна колонка, фиксированная высота. */
const BTN_ROW_HEIGHT = 40;
const BTN_RADIUS = 8;

const ChatPreview: React.FC<ChatPreviewProps> = ({
  messages,
  onButtonClick,
  showTextInput = false,
  onSubmitText,
  textInputPlaceholder = 'Введите ответ…',
  textInputAllowEmpty = false,
  activeButtonMessageId = null,
  showTypingIndicator = false,
}) => {
  const [draft, setDraft] = useState('');
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showTextInput) setDraft('');
  }, [showTextInput]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, showTextInput, showTypingIndicator]);

  const submit = () => {
    if (!onSubmitText) return;
    if (!textInputAllowEmpty && !draft.trim()) return;
    onSubmitText(draft);
    setDraft('');
  };

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        background: '#020617',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes simTypingDot {
          0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }
      `}</style>
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '16px 16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          scrollbarColor: '#334155 transparent',
        }}
      >
        {messages.map(msg => {
          const variant = msg.meta?.variant;
          if (variant === 'system' || variant === 'error') {
            return (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: '4px 8px',
                  minWidth: 0,
                  width: '100%',
                  maxWidth: '100%',
                }}
              >
                <div
                  style={{
                    maxWidth: '92%',
                    minWidth: 0,
                    fontSize: 11,
                    lineHeight: 1.45,
                    textAlign: 'center',
                    color: variant === 'error' ? '#fca5a5' : '#94a3b8',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.text}
                </div>
              </div>
            );
          }

          const isBot = msg.from === 'bot';
          const buttonsActive = Boolean(
            activeButtonMessageId && msg.id === activeButtonMessageId && msg.buttons?.length
          );

          return (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                justifyContent: isBot ? 'flex-start' : 'flex-end',
                minWidth: 0,
                width: '100%',
                maxWidth: '100%',
              }}
            >
              <div
                style={{
                  maxWidth: '72%',
                  minWidth: 0,
                  boxSizing: 'border-box',
                  padding: '10px 12px',
                  borderRadius: 18,
                  background: isBot ? '#1e293b' : '#22c55e',
                  color: isBot ? '#e5e7eb' : '#022c22',
                  fontSize: 14,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                  border: isBot ? '1px solid #334155' : 'none',
                  overflowX: 'hidden',
                }}
              >
                {isBot ? (
                  <BotFormattedText text={msg.text} parseMode={msg.parseMode} />
                ) : (
                  <div
                    style={{
                      whiteSpace: 'pre-wrap',
                      minWidth: 0,
                      overflowWrap: 'anywhere',
                      wordBreak: 'break-word',
                    }}
                  >
                    {msg.text}
                  </div>
                )}
                {isBot && msg.media && msg.media.length > 0 && (
                  <div
                    style={{
                      marginTop: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      minWidth: 0,
                      maxWidth: '100%',
                    }}
                  >
                    {msg.media.map((m, idx) =>
                      m.type === 'video' ? (
                        <video
                          key={`${msg.id}_m_${idx}`}
                          src={m.url}
                          controls
                          playsInline
                          style={{
                            width: '100%',
                            maxHeight: 240,
                            borderRadius: 10,
                            background: '#0f172a',
                          }}
                        />
                      ) : (
                        <img
                          key={`${msg.id}_m_${idx}`}
                          src={m.url}
                          alt=""
                          style={{
                            maxWidth: '100%',
                            maxHeight: 220,
                            objectFit: 'contain',
                            borderRadius: 10,
                            display: 'block',
                          }}
                        />
                      )
                    )}
                  </div>
                )}
                {msg.buttons && msg.buttons.length > 0 && (
                  <div
                    style={{
                      marginTop: 10,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                      width: '100%',
                    }}
                  >
                    {msg.buttons.map(btn => {
                      const canClick = buttonsActive;
                      const rowKey = `${msg.id}_${btn.id}`;
                      const hovered = canClick && hoveredBtn === rowKey;
                      return (
                        <button
                          key={btn.id}
                          type="button"
                          disabled={!canClick}
                          onMouseEnter={() => canClick && setHoveredBtn(rowKey)}
                          onMouseLeave={() => setHoveredBtn(null)}
                          onClick={() =>
                            canClick &&
                            onButtonClick({
                              label: btn.label,
                              sourceHandle: btn.sourceHandle,
                              buttonId: btn.id,
                            })
                          }
                          style={{
                            width: '100%',
                            minWidth: 0,
                            minHeight: BTN_ROW_HEIGHT,
                            padding: '0 14px',
                            borderRadius: BTN_RADIUS,
                            overflowWrap: 'anywhere',
                            wordBreak: 'break-word',
                            border: canClick
                              ? hovered
                                ? '1px solid #60a5fa'
                                : '1px solid #475569'
                              : '1px solid #1e293b',
                            background: canClick ? (hovered ? '#334155' : '#293548') : '#151e2e',
                            color: canClick ? '#e2e8f0' : '#64748b',
                            fontSize: 14,
                            fontWeight: 500,
                            lineHeight: 1.2,
                            cursor: canClick ? 'pointer' : 'default',
                            opacity: canClick ? 1 : 0.72,
                            transition: 'background 0.15s, border-color 0.15s',
                          }}
                        >
                          {btn.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {showTypingIndicator && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-start',
              minWidth: 0,
              width: '100%',
              maxWidth: '100%',
            }}
          >
            <div
              style={{
                maxWidth: '72%',
                minWidth: 0,
                boxSizing: 'border-box',
                padding: '12px 16px',
                borderRadius: 18,
                background: '#1e293b',
                border: '1px solid #334155',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
              }}
            >
              <span style={{ fontSize: 13, color: '#94a3b8' }}>Бот печатает</span>
              <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {[0, 1, 2].map(i => (
                  <span
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#64748b',
                      animation: `simTypingDot 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}
      </div>

      {showTextInput && (
        <div
          style={{
            padding: '10px 16px 14px',
            display: 'flex',
            gap: 8,
            alignItems: 'stretch',
            borderTop: '1px solid #1f2937',
            flexShrink: 0,
            background: '#020617',
          }}
        >
          <input
            type="text"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={textInputPlaceholder}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid #334155',
              background: '#0f172a',
              color: '#e5e7eb',
              fontSize: 14,
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!textInputAllowEmpty && !draft.trim()}
            style={{
              padding: '10px 16px',
              borderRadius: 12,
              border: 'none',
              background: textInputAllowEmpty || draft.trim() ? '#3b82f6' : '#1e293b',
              color: textInputAllowEmpty || draft.trim() ? '#fff' : '#64748b',
              fontSize: 13,
              fontWeight: 600,
              cursor: textInputAllowEmpty || draft.trim() ? 'pointer' : 'default',
              whiteSpace: 'nowrap',
            }}
          >
            Отправить
          </button>
        </div>
      )}
    </div>
  );
};

export default ChatPreview;
