import React from 'react';
import type { SimulatorMessage } from './scenarioRunner';

interface ChatPreviewProps {
  messages: SimulatorMessage[];
  onButtonClick: (button: {
    label: string;
    sourceHandle?: string | null;
    buttonId?: string;
  }) => void;
}

const ChatPreview: React.FC<ChatPreviewProps> = ({ messages, onButtonClick }) => {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '16px 16px 12px',
        background: '#020617',
        overflowY: 'auto',
        gap: 8,
      }}
    >
      {messages.map(msg => {
        const isBot = msg.from === 'bot';
        return (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              justifyContent: isBot ? 'flex-start' : 'flex-end',
            }}
          >
            <div
              style={{
                maxWidth: '72%',
                padding: '10px 12px',
                borderRadius: 18,
                background: isBot ? '#1e293b' : '#22c55e',
                color: isBot ? '#e5e7eb' : '#022c22',
                fontSize: 14,
                boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                border: isBot ? '1px solid #334155' : 'none',
              }}
            >
              <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
              {msg.buttons && msg.buttons.length > 0 && (
                <div
                  style={{
                    marginTop: 8,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}
                >
                  {msg.buttons.map(btn => (
                    <button
                      key={btn.id}
                      onClick={() =>
                        onButtonClick({
                          label: btn.label,
                          sourceHandle: btn.sourceHandle,
                          buttonId: btn.id,
                        })
                      }
                      style={{
                        padding: '6px 10px',
                        borderRadius: 999,
                        border: '1px solid #3b82f6',
                        background: 'transparent',
                        color: '#bfdbfe',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ChatPreview;
