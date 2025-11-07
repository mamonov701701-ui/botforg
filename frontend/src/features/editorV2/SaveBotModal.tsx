import React, { useState } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';

interface SaveBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    description: string;
    action: 'update' | 'copy' | 'rename';
  }) => void;
  currentBotName?: string;
  currentBotDescription?: string;
  scenarioCount?: number;
  lastSaved?: Date | null;
  hasUnsavedChanges?: boolean;
}

export default function SaveBotModal({
  isOpen,
  onClose,
  onSave,
  currentBotName = '',
  currentBotDescription = '',
  scenarioCount = 0,
  lastSaved = null,
  hasUnsavedChanges = false,
}: SaveBotModalProps) {
  const [name, setName] = useState(currentBotName);
  const [description, setDescription] = useState(currentBotDescription);
  const [action, setAction] = useState<'update' | 'copy' | 'rename'>('update');

  if (!isOpen) return null;

  const handleSave = () => {
    if (!name.trim()) {
      alert('Введите название бота');
      return;
    }

    let finalName = name;
    if (action === 'copy') {
      finalName = `${name} (копия)`;
    }

    onSave({
      name: finalName,
      description,
      action,
    });

    onClose();
  };

  const formatLastSaved = () => {
    if (!lastSaved) return 'никогда';

    const now = new Date();
    const diff = Math.floor((now.getTime() - lastSaved.getTime()) / 1000); // в секундах

    if (diff < 60) return `${diff} сек. назад`;
    if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ч. назад`;
    return lastSaved.toLocaleDateString('ru-RU');
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1a1a2e',
          borderRadius: 12,
          width: '90%',
          maxWidth: 520,
          border: '1px solid #374151',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #374151',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: 0 }}>Сохранить бот</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.color = '#9ca3af';
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '24px' }}>
          {/* Название бота */}
          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: 'block',
                color: '#fff',
                fontSize: 14,
                marginBottom: 8,
                fontWeight: 500,
              }}
            >
              Название бота:
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Например: Магазин одежды"
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#0f1729',
                border: '1px solid #374151',
                borderRadius: 6,
                color: '#fff',
                fontSize: 14,
              }}
            />
          </div>

          {/* Описание */}
          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: 'block',
                color: '#fff',
                fontSize: 14,
                marginBottom: 8,
                fontWeight: 500,
              }}
            >
              Описание:
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Бот для интернет-магазина..."
              rows={3}
              style={{
                width: '100%',
                padding: '10px 12px',
                background: '#0f1729',
                border: '1px solid #374151',
                borderRadius: 6,
                color: '#fff',
                fontSize: 14,
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Информация о боте */}
          <div
            style={{
              padding: 16,
              background: '#0f1729',
              border: '1px solid #374151',
              borderRadius: 8,
              marginBottom: 20,
            }}
          >
            <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>Что сохраняется:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle size={16} color="var(--primary)" />
                <span style={{ color: '#fff', fontSize: 14 }}>
                  {scenarioCount}{' '}
                  {scenarioCount === 1 ? 'сценарий' : scenarioCount < 5 ? 'сценария' : 'сценариев'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle size={16} color="var(--primary)" />
                <span style={{ color: '#fff', fontSize: 14 }}>Все настройки и переменные</span>
              </div>
            </div>
          </div>

          {/* Информация о существующем боте */}
          {currentBotName && (
            <div
              style={{
                padding: 16,
                background: hasUnsavedChanges
                  ? 'rgba(245, 158, 11, 0.1)'
                  : 'rgba(59, 130, 246, 0.1)',
                border: `1px solid ${hasUnsavedChanges ? 'rgba(245, 158, 11, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                borderRadius: 8,
                marginBottom: 20,
              }}
            >
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <AlertCircle size={20} color={hasUnsavedChanges ? '#f59e0b' : '#3b82f6'} />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      color: hasUnsavedChanges ? '#f59e0b' : '#3b82f6',
                      fontWeight: 600,
                      fontSize: 14,
                      marginBottom: 4,
                    }}
                  >
                    {hasUnsavedChanges ? 'Есть несохраненные изменения' : 'Бот уже существует'}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: 13 }}>
                    Последнее сохранение: {formatLastSaved()}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginLeft: 32 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="action"
                    checked={action === 'update'}
                    onChange={() => setAction('update')}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ color: '#fff', fontSize: 14 }}>
                    Обновить существующий
                    {hasUnsavedChanges && (
                      <span style={{ color: 'var(--primary)' }}> (рекомендуется)</span>
                    )}
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="action"
                    checked={action === 'copy'}
                    onChange={() => setAction('copy')}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ color: '#fff', fontSize: 14 }}>
                    Создать копию "{name} (копия)"
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="action"
                    checked={action === 'rename'}
                    onChange={() => setAction('rename')}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ color: '#fff', fontSize: 14 }}>Изменить название</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #374151',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 12,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: '1px solid #374151',
              borderRadius: 6,
              color: '#fff',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#252540';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '10px 20px',
              background: 'var(--primary)',
              border: 'none',
              borderRadius: 6,
              color: '#000',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--primary-hover)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--primary)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}
