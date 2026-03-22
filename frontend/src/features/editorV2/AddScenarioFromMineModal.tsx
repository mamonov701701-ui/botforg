import React, { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { getMyScenarios, type Scenario } from '../../api/scenarios';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Создать копию выбранного сценария у текущего бота */
  onAddCopy: (source: Scenario) => void | Promise<void>;
  busy?: boolean;
}

/**
 * Модалка: поиск по названию и выбор сценария из «все мои» для копирования в текущего бота.
 */
export default function AddScenarioFromMineModal({
  isOpen,
  onClose,
  onAddCopy,
  busy = false,
}: Props) {
  const [list, setList] = useState<Scenario[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setSelectedId(null);
    setLoadError(null);
    let cancelled = false;
    setLoadingList(true);
    getMyScenarios()
      .then(rows => {
        if (!cancelled) setList(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setList([]);
          setLoadError('Не удалось загрузить список сценариев');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(s => s.name.toLowerCase().includes(q));
  }, [list, query]);

  if (!isOpen) return null;

  const selected = selectedId != null ? list.find(s => s.id === selectedId) : undefined;

  const handleAdd = async () => {
    if (!selected) return;
    await onAddCopy(selected);
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
        padding: 16,
      }}
      onClick={e => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        style={{
          background: '#0f172a',
          borderRadius: 12,
          width: '100%',
          maxWidth: 440,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
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
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>
            Добавить сценарий
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
            }}
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '14px 18px 0', flexShrink: 0 }}>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Поиск по названию…"
            disabled={busy || loadingList}
            autoFocus
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
            margin: '12px 18px',
            flex: 1,
            minHeight: 200,
            maxHeight: 360,
            overflowY: 'auto',
            borderRadius: 8,
            border: '1px solid #1e293b',
            background: '#020617',
          }}
        >
          {loadingList && (
            <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              Загрузка…
            </div>
          )}
          {loadError && !loadingList && (
            <div style={{ padding: 20, textAlign: 'center', color: '#f87171', fontSize: 13 }}>
              {loadError}
            </div>
          )}
          {!loadingList && !loadError && filtered.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              {list.length === 0 ? 'Нет сохранённых сценариев' : 'Ничего не найдено'}
            </div>
          )}
          {!loadingList &&
            !loadError &&
            filtered.map(s => {
              const isSel = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={busy}
                  onClick={() => setSelectedId(s.id)}
                  style={{
                    width: '100%',
                    display: 'block',
                    padding: '12px 14px',
                    border: 'none',
                    borderBottom: '1px solid #1e293b',
                    background: isSel ? 'rgba(59, 130, 246, 0.18)' : 'transparent',
                    color: '#f1f5f9',
                    fontSize: 14,
                    textAlign: 'left',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={e => {
                    if (!busy && !isSel) e.currentTarget.style.background = 'rgba(51, 65, 85, 0.5)';
                  }}
                  onMouseLeave={e => {
                    if (!isSel) e.currentTarget.style.background = 'transparent';
                    else e.currentTarget.style.background = 'rgba(59, 130, 246, 0.18)';
                  }}
                >
                  {s.name}
                </button>
              );
            })}
        </div>

        <div
          style={{
            padding: '14px 18px 18px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            flexShrink: 0,
            borderTop: '1px solid #334155',
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
            disabled={busy || !selected}
            onClick={() => void handleAdd()}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: selected && !busy ? 'var(--primary)' : '#334155',
              color: selected && !busy ? '#0f172a' : '#64748b',
              fontSize: 13,
              fontWeight: 600,
              cursor: selected && !busy ? 'pointer' : 'not-allowed',
            }}
          >
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
}
