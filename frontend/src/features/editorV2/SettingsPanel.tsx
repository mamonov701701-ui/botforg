import React, { useState, useEffect } from 'react';

type Props = {
  selectedId?: string;
  blockId?: string;
  title?: string;
  json?: string;
  onChange: (p: { title?: string; json?: string }) => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate?: () => void;
};

export default function SettingsPanel({ selectedId, blockId, title, json, onChange, onSave, onDelete, onDuplicate }: Props) {
  const [name, setName] = useState(title ?? '');
  const [j, setJ] = useState(json ?? `{}`);
  useEffect(() => { setName(title ?? ''); }, [title]);
  useEffect(() => { setJ(json ?? `{}`); }, [json]);

  return (
    <div style={{ height: '100%', padding: 16, background: '#0b1b2a', color: '#e2e8f0' }}>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>⚡ Настройки блока</div>

      <div style={{ opacity: .7, marginBottom: 8 }}>ID: {selectedId ?? '-'}</div>
      <div style={{ opacity: .7, marginBottom: 8 }}>Блок: {blockId ?? '-'}</div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 6 }}>Название блока</div>
        <input
          value={name}
          onChange={e => { setName(e.target.value); onChange({ title: e.target.value }); }}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f2436', color: '#e2e8f0' }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 6 }}>Настройки блока (JSON)</div>
        <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 4 }}>Все пользовательские данные хранятся в node.data.settings</div>
        <textarea
          rows={10}
          value={j}
          onChange={e => { setJ(e.target.value); onChange({ json: e.target.value }); }}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f2436', color: '#e2e8f0', fontFamily: 'monospace', fontSize: 12 }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <button onClick={onSave} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: '#22c55e', color: '#062028', fontWeight: 800, border: 'none' }}>Сохранить</button>
        {onDuplicate && (
          <button onClick={onDuplicate} style={{ width: 44, borderRadius: 8, background: '#3b82f6', border: 'none', color: '#fff', fontWeight: 800 }} title="Дублировать">📋</button>
        )}
        <button onClick={onDelete} style={{ width: 44, borderRadius: 8, background: '#ef4444', border: 'none', color: '#fff', fontWeight: 800 }} title="Удалить">🗑</button>
      </div>
    </div>
  );
}


