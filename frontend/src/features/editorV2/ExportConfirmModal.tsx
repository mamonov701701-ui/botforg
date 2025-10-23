import React from 'react';

interface Props {
  isOpen: boolean;
  errorCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}

const ExportConfirmModal: React.FC<Props> = ({ isOpen, errorCount, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div
        style={{
          background: '#1a1a2e',
          borderRadius: 12,
          padding: 24,
          maxWidth: 500,
          width: '90%',
          border: '2px solid #f59e0b',
        }}
      >
        <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 12 }}>⚠️</div>

        <h2
          style={{
            color: '#fff',
            fontSize: 20,
            fontWeight: 700,
            textAlign: 'center',
            marginBottom: 12,
            margin: '0 0 12px 0',
          }}
        >
          Есть ошибки в узлах
        </h2>

        <p
          style={{
            color: '#9ca3af',
            fontSize: 14,
            textAlign: 'center',
            lineHeight: 1.6,
            marginBottom: 24,
            margin: '0 0 24px 0',
          }}
        >
          Найдено ошибок: {errorCount}. Рекомендуется исправить их перед сохранением. Сохранить файл
          всё равно?
        </p>

        <div
          style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
          }}
        >
          <button
            onClick={onCancel}
            style={{
              background: '#374151',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            style={{
              background: '#f59e0b',
              color: '#0a1b2a',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Всё равно сохранить
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportConfirmModal;
