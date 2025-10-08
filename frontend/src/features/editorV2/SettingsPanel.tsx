import React, { useState, useEffect } from 'react';

type Props = {
  selectedId?: string;
  type?: string;
  label?: string;
  json?: string;
  onChange: (p: { label?: string; type?: string; json?: string }) => void;
  onSave: () => void;
  onDelete: () => void;
};

export default function SettingsPanel({ selectedId, type, label, json, onChange, onSave, onDelete }: Props) {
  const [name, setName] = useState(label ?? '');
  const [t, setT] = useState(type ?? '');
  const [j, setJ] = useState(json ?? `{"key":"value"}`);
  useEffect(() => { setName(label ?? ''); }, [label]);
  useEffect(() => { setT(type ?? ''); }, [type]);
  useEffect(() => { setJ(json ?? `{"key":"value"}`); }, [json]);

  return (
    <div style={{ height: '100%', padding: 16, background: '#0b1b2a', color: '#e2e8f0' }}>
      <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}>⚡ Настройки блока</div>

      <div style={{ opacity: .7, marginBottom: 8 }}>ID: {selectedId ?? '-'}</div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 6 }}>Название блока</div>
        <input
          value={name}
          onChange={e => { setName(e.target.value); onChange({ label: e.target.value }); }}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f2436', color: '#e2e8f0' }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 6 }}>Тип блока</div>
        <select
          value={t}
          onChange={e => { setT(e.target.value); onChange({ type: e.target.value }); }}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f2436', color: '#e2e8f0' }}
        >
          <option value="">—</option>
          <option value="start">Старт</option>
          <option value="message">Сообщение</option>
          <option value="menu">Меню</option>
          <option value="question">Вопрос</option>
          <option value="end">Завершение</option>
          <option value="action">Действие</option>
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 6 }}>Параметры (JSON)</div>
        <textarea
          rows={8}
          value={j}
          onChange={e => { setJ(e.target.value); onChange({ json: e.target.value }); }}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #334155', background: '#0f2436', color: '#e2e8f0' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onSave} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: '#22c55e', color: '#062028', fontWeight: 800, border: 'none' }}>Сохранить</button>
        <button onClick={onDelete} style={{ width: 44, borderRadius: 8, background: '#ef4444', border: 'none', color: '#fff', fontWeight: 800 }}>🗑</button>
      </div>
    </div>
  );
}


