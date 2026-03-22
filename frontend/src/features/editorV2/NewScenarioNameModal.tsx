import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Вызывается с непустым именем после нажатия «Создать» */
  onSubmit: (name: string) => void | Promise<void>;
  busy?: boolean;
}

/**
 * Компактное окно: название нового сценария (обязательное поле).
 */
export default function NewScenarioNameModal({ isOpen, onClose, onSubmit, busy = false }: Props) {
  const [name, setName] = useState('');

  useEffect(() => {
    if (isOpen) setName('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await onSubmit(trimmed);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
      }}
      onClick={e => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        style={{
          background: '#0f172a',
          borderRadius: 12,
          width: '90%',
          maxWidth: 400,
          border: '1px solid #334155',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div
          style={{
            padding: '16px 18px',
            borderBottom: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>
            Новый сценарий
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: busy ? 'not-allowed' : 'pointer',
              padding: 4,
              display: 'flex',
            }}
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>
        <div style={{ padding: '18px' }}>
          <label
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 500,
              color: '#e2e8f0',
              marginBottom: 8,
            }}
          >
            Название сценария
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && name.trim() && !busy) void handleCreate();
            }}
            placeholder="Например: Приветствие"
            autoFocus
            disabled={busy}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #475569',
              background: '#020617',
              color: '#f8fafc',
              fontSize: 14,
            }}
          />
        </div>
        <div
          style={{
            padding: '12px 18px 18px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #475569',
              background: 'transparent',
              color: '#e2e8f0',
              fontSize: 13,
              fontWeight: 500,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => void handleCreate()}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: name.trim() && !busy ? 'var(--primary)' : '#334155',
              color: name.trim() && !busy ? '#0f172a' : '#64748b',
              fontSize: 13,
              fontWeight: 600,
              cursor: name.trim() && !busy ? 'pointer' : 'not-allowed',
            }}
          >
            Создать
          </button>
        </div>
      </div>
    </div>
  );
}
