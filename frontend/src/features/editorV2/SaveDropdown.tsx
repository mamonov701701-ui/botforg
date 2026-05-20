import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Save, FolderOpen, FileDown } from 'lucide-react';

interface SaveDropdownProps {
  onQuickSave?: () => void;
  onSaveBot?: () => void;
  onSaveScenario?: () => void;
  onExportToFile?: () => void;
  hasUnsavedChanges?: boolean;
}

export default function SaveDropdown({
  onQuickSave,
  onSaveBot,
  onSaveScenario,
  onExportToFile,
  hasUnsavedChanges = false,
}: SaveDropdownProps) {
  const hasSaveActions = onQuickSave || onSaveBot || onSaveScenario;
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        event.target instanceof HTMLElement &&
        !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Hotkey Ctrl+S для быстрого сохранения
  useEffect(() => {
    if (!onQuickSave) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        onQuickSave();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onQuickSave]);

  // Read-only: только кнопка экспорта
  if (!hasSaveActions && onExportToFile) {
    return (
      <button
        onClick={onExportToFile}
        style={{
          background: 'var(--primary)',
          color: '#000',
          border: 'none',
          borderRadius: 6,
          padding: '10px 16px',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--primary-hover)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'var(--primary)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        title="Экспортировать сценарий"
      >
        <FileDown size={18} />
        <span>Экспорт</span>
      </button>
    );
  }

  return (
    <div style={{ position: 'relative', display: 'flex', gap: 0 }} ref={dropdownRef}>
      {/* Основная кнопка Сохранить */}
      <button
        onClick={onQuickSave!}
        style={{
          background: 'var(--primary)',
          color: '#000',
          border: 'none',
          borderRadius: '6px 0 0 6px',
          padding: '10px 16px',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          transition: 'all 0.2s ease',
          position: 'relative',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--primary-hover)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'var(--primary)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        title="Быстрое сохранение (Ctrl+S)"
      >
        <Save size={18} />
        <span>Сохранить</span>
        {hasUnsavedChanges && (
          <span
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 8,
              height: 8,
              background: '#ef4444',
              borderRadius: '50%',
              border: '2px solid var(--primary)',
            }}
          />
        )}
      </button>

      {/* Dropdown кнопка */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: 'var(--primary)',
          color: '#000',
          border: 'none',
          borderLeft: '1px solid rgba(0,0,0,0.2)',
          borderRadius: '0 6px 6px 0',
          padding: '10px 8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--primary-hover)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'var(--primary)';
        }}
        title="Дополнительные опции сохранения"
      >
        <ChevronDown
          size={16}
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>

      {/* Dropdown меню */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            background: '#1a1a2e',
            border: '1px solid #374151',
            borderRadius: 8,
            padding: 4,
            minWidth: 280,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 1000,
          }}
        >
          {/* Быстрое сохранение */}
          {onQuickSave && (
            <button
              onClick={() => {
                onQuickSave();
                setIsOpen(false);
              }}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                transition: 'background 0.2s',
                marginBottom: 2,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#252540';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <Save size={18} color="var(--primary)" />
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 500, fontSize: 14, marginBottom: 2 }}>
                  Быстрое сохранение
                </div>
                <div style={{ color: '#9ca3af', fontSize: 12 }}>Сохранить весь бот (Ctrl+S)</div>
              </div>
            </button>
          )}

          {/* Разделитель */}
          {onQuickSave && (onSaveBot || onSaveScenario) && (
            <div style={{ height: 1, background: '#374151', margin: '4px 0' }} />
          )}

          {/* Сохранить бот как... */}
          {onSaveBot && (
            <button
              onClick={() => {
                onSaveBot();
                setIsOpen(false);
              }}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                transition: 'background 0.2s',
                marginBottom: 2,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#252540';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <Save size={18} color="#9ca3af" />
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 500, fontSize: 14, marginBottom: 2 }}>
                  Сохранить бот как...
                </div>
                <div style={{ color: '#9ca3af', fontSize: 12 }}>
                  Создать копию или переименовать{' '}
                </div>
              </div>
            </button>
          )}

          {/* Сохранить сценарий в мои сценарии */}
          {onSaveScenario && (
            <button
              onClick={() => {
                onSaveScenario();
                setIsOpen(false);
              }}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                transition: 'background 0.2s',
                marginBottom: 2,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#252540';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <FolderOpen size={18} color="#9ca3af" />
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 500, fontSize: 14, marginBottom: 2 }}>
                  Сохранить в мои сценарии
                </div>
                <div style={{ color: '#9ca3af', fontSize: 12 }}>
                  Создать или обновить сценарий пользователя
                </div>
              </div>
            </button>
          )}

          {/* Экспортировать в файл */}
          {onExportToFile && (
            <button
              onClick={() => {
                onExportToFile();
                setIsOpen(false);
              }}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'transparent',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#252540';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <FileDown size={18} color="#9ca3af" />
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 500, fontSize: 14, marginBottom: 2 }}>
                  Экспортировать в файл
                </div>
                <div style={{ color: '#9ca3af', fontSize: 12 }}>
                  Скачать текущий сценарий (.json)
                </div>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
