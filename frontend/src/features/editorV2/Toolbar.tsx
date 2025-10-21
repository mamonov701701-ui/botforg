import React from 'react';

type Props = {
  onExport: () => void;
  onImport: () => void;
  onValidate: () => void;
};

export default function Toolbar({ onExport, onImport, onValidate }: Props) {
  const Btn = ({ 
    label, 
    icon, 
    color, 
    onClick 
  }: { 
    label: string; 
    icon: string; 
    color: string; 
    onClick: () => void 
  }) => (
    <button
      onClick={onClick}
      style={{
        width: 140,
        padding: '12px 16px',
        borderRadius: 8,
        marginBottom: 10,
        background: color,
        color: '#0b1b2a',
        fontWeight: 700,
        border: 'none',
        cursor: 'pointer',
        boxShadow: '0 4px 10px rgba(0,0,0,.15)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        justifyContent: 'center'
      }}
    >
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
  
  return (
    <div style={{
      position: 'sticky',
      top: 16,
      left: 0,
      display: 'flex',
      flexDirection: 'column',
      width: 160,
      padding: 12,
      background: 'rgba(11,27,42,.90)',
      color: '#e2e8f0',
      borderRadius: 10
    }}>
      <Btn label="Сохранить" icon="💾" color="#22c55e" onClick={onExport} />
      <Btn label="Загрузить" icon="📂" color="#3b82f6" onClick={onImport} />
      <Btn label="Проверить" icon="✓" color="#FFD24C" onClick={onValidate} />
    </div>
  );
}

