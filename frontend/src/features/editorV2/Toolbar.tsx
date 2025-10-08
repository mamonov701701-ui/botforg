import React from 'react';

type Props = {
  onAddBlock: () => void;
  onSave: () => void;
  onExport: () => void;
  onImport: () => void;
  onError: () => void;
};

export default function Toolbar({ onAddBlock, onSave, onExport, onImport, onError }: Props) {
  const Btn = ({ label, color, onClick }: { label: string; color: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      style={{
        width: 110,
        padding: '10px 12px',
        borderRadius: 8,
        marginBottom: 10,
        background: color,
        color: '#0b1b2a',
        fontWeight: 700,
        border: 'none',
        cursor: 'pointer',
        boxShadow: '0 4px 10px rgba(0,0,0,.15)'
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      style={{
        position: 'sticky',
        top: 16,
        left: 0,
        display: 'flex',
        flexDirection: 'column',
        width: 130,
        padding: 8,
        background: 'rgba(11,27,42,.85)',
        color: '#e2e8f0',
        borderRadius: 10
      }}
    >
      <Btn label="Добавить блок" color="#60a5fa" onClick={onAddBlock} />
      <Btn label="Сохранить" color="#34d399" onClick={onSave} />
      <Btn label="Экспорт" color="#a78bfa" onClick={onExport} />
      <Btn label="Импорт" color="#f59e0b" onClick={onImport} />
      <Btn label="Ошибка" color="#f87171" onClick={onError} />
    </div>
  );
}


