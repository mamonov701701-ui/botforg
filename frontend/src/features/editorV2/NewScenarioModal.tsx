import React, { useState } from 'react';
import { X, FileText, Library, Upload, AlertTriangle } from 'lucide-react';
import { validateScenarioFile } from '../../utils/scenarioValidator';

interface LibraryScenario {
  id: number;
  name: string;
  icon?: string;
  category?: string;
  description?: string;
}

interface NewScenarioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateEmpty: (name: string, icon: string) => void;
  onCreateFromTemplate: (templateId: string, name: string) => void;
  onImportFromFile: (file: File, name: string) => void;
  libraryScenarios?: LibraryScenario[];
}

// Доступные иконки для сценариев
const SCENARIO_ICONS = [
  { id: 'Home', label: '🏠 Главный' },
  { id: 'Package', label: '📦 Каталог' },
  { id: 'CreditCard', label: '💳 Оплата' },
  { id: 'HelpCircle', label: '❓ FAQ' },
  { id: 'Headphones', label: '🎧 Поддержка' },
  { id: 'ShoppingCart', label: '🛒 Корзина' },
  { id: 'FileText', label: '📄 Форма' },
  { id: 'Gift', label: '🎁 Акции' },
];

export default function NewScenarioModal({
  isOpen,
  onClose,
  onCreateEmpty,
  onCreateFromTemplate,
  onImportFromFile,
  libraryScenarios = [],
}: NewScenarioModalProps) {
  const [mode, setMode] = useState<'empty' | 'template' | 'file'>('empty');
  const [scenarioName, setScenarioName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('FileText');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  if (!isOpen) return null;

  const handleCreate = () => {
    if (!scenarioName.trim()) {
      alert('Введите название сценария');
      return;
    }

    if (mode === 'empty') {
      onCreateEmpty(scenarioName, selectedIcon);
    } else if (mode === 'template') {
      if (!selectedTemplate) {
        alert('Выберите шаблон');
        return;
      }
      onCreateFromTemplate(selectedTemplate, scenarioName);
    } else if (mode === 'file') {
      if (!selectedFile) {
        alert('Выберите файл');
        return;
      }
      onImportFromFile(selectedFile, scenarioName);
    }

    // Сброс формы
    setScenarioName('');
    setSelectedIcon('FileText');
    setSelectedTemplate('');
    setSelectedFile(null);
    setMode('empty');
    onClose();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Валидация файла
    const validation = await validateScenarioFile(file);

    if (!validation.isValid) {
      alert(
        `❌ Ошибка импорта:\n\n${validation.error}\n\nФайл не был загружен из соображений безопасности.`
      );
      e.target.value = ''; // Сброс input
      return;
    }

    setSelectedFile(file);
    // Автоматически заполняем название из имени файла
    const nameWithoutExt = file.name.replace('.json', '').replace(/^botforg-flow-/, '');
    setScenarioName(nameWithoutExt);
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
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: 0 }}>
            Создать сценарий
          </h2>
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
          {/* Выбор режима */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {/* Пустой сценарий */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 16,
                background: mode === 'empty' ? 'rgba(255, 210, 76, 0.1)' : 'transparent',
                border: `1px solid ${mode === 'empty' ? 'var(--primary)' : '#374151'}`,
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                if (mode !== 'empty') {
                  e.currentTarget.style.background = '#252540';
                }
              }}
              onMouseLeave={e => {
                if (mode !== 'empty') {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <input
                type="radio"
                name="mode"
                checked={mode === 'empty'}
                onChange={() => setMode('empty')}
                style={{ cursor: 'pointer' }}
              />
              <FileText size={20} color={mode === 'empty' ? 'var(--primary)' : '#9ca3af'} />
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 500, marginBottom: 4 }}>
                  Пустой сценарий
                </div>
                <div style={{ color: '#9ca3af', fontSize: 13 }}>Создать с нуля</div>
              </div>
            </label>

            {/* Из библиотеки */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 16,
                background: mode === 'template' ? 'rgba(255, 210, 76, 0.1)' : 'transparent',
                border: `1px solid ${mode === 'template' ? 'var(--primary)' : '#374151'}`,
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                if (mode !== 'template') {
                  e.currentTarget.style.background = '#252540';
                }
              }}
              onMouseLeave={e => {
                if (mode !== 'template') {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <input
                type="radio"
                name="mode"
                checked={mode === 'template'}
                onChange={() => setMode('template')}
                style={{ cursor: 'pointer' }}
              />
              <Library size={20} color={mode === 'template' ? 'var(--primary)' : '#9ca3af'} />
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 500, marginBottom: 4 }}>Из библиотеки</div>
                <div style={{ color: '#9ca3af', fontSize: 13 }}>Выбрать готовый шаблон</div>
              </div>
            </label>

            {/* Импорт из файла */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 16,
                background: mode === 'file' ? 'rgba(255, 210, 76, 0.1)' : 'transparent',
                border: `1px solid ${mode === 'file' ? 'var(--primary)' : '#374151'}`,
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                if (mode !== 'file') {
                  e.currentTarget.style.background = '#252540';
                }
              }}
              onMouseLeave={e => {
                if (mode !== 'file') {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <input
                type="radio"
                name="mode"
                checked={mode === 'file'}
                onChange={() => setMode('file')}
                style={{ cursor: 'pointer' }}
              />
              <Upload size={20} color={mode === 'file' ? 'var(--primary)' : '#9ca3af'} />
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 500, marginBottom: 4 }}>
                  Импорт из файла
                </div>
                <div style={{ color: '#9ca3af', fontSize: 13 }}>Загрузить .json файл</div>
              </div>
            </label>
          </div>

          {/* Дополнительные поля в зависимости от режима */}
          {mode === 'template' && (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>
                Выбрать сценарий:
              </label>
              <select
                value={selectedTemplate}
                onChange={e => setSelectedTemplate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: '#0f1729',
                  border: '1px solid #374151',
                  borderRadius: 6,
                  color: '#fff',
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                <option value="">-- Выберите сценарий --</option>
                {libraryScenarios.map(scenario => (
                  <option key={scenario.id} value={scenario.id.toString()}>
                    {scenario.name} {scenario.category ? `(${scenario.category})` : ''}
                  </option>
                ))}
              </select>
              {libraryScenarios.length === 0 && (
                <div style={{ marginTop: 8, color: '#9ca3af', fontSize: 13 }}>
                  💡 Библиотека пуста. Сохраните сценарий в библиотеку чтобы использовать его позже.
                </div>
              )}
            </div>
          )}

          {mode === 'file' && (
            <div style={{ marginBottom: 20 }}>
              <label
                style={{
                  display: 'block',
                  padding: '32px 16px',
                  background: '#0f1729',
                  border: '2px dashed #374151',
                  borderRadius: 8,
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = 'var(--primary)';
                  e.currentTarget.style.background = 'rgba(255, 210, 76, 0.05)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#374151';
                  e.currentTarget.style.background = '#0f1729';
                }}
              >
                <Upload size={32} color="#9ca3af" style={{ margin: '0 auto 8px' }} />
                <div style={{ color: '#fff', marginBottom: 4 }}>
                  {selectedFile ? selectedFile.name : 'Выберите файл .json'}
                </div>
                <div style={{ color: '#9ca3af', fontSize: 13 }}>или перетащите файл сюда</div>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          )}

          {/* Название сценария */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>
              Название сценария:
            </label>
            <input
              type="text"
              value={scenarioName}
              onChange={e => setScenarioName(e.target.value)}
              placeholder="Например: Оформление заказа"
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

          {/* Выбор иконки (только для пустого сценария) */}
          {mode === 'empty' && (
            <div>
              <label style={{ display: 'block', color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>
                Иконка:
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 8,
                }}
              >
                {SCENARIO_ICONS.map(icon => (
                  <button
                    key={icon.id}
                    onClick={() => setSelectedIcon(icon.id)}
                    style={{
                      padding: '12px 8px',
                      background: selectedIcon === icon.id ? 'rgba(255, 210, 76, 0.1)' : '#0f1729',
                      border: `1px solid ${
                        selectedIcon === icon.id ? 'var(--primary)' : '#374151'
                      }`,
                      borderRadius: 6,
                      color: selectedIcon === icon.id ? 'var(--primary)' : '#fff',
                      fontSize: 13,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      if (selectedIcon !== icon.id) {
                        e.currentTarget.style.background = '#1a1a2e';
                      }
                    }}
                    onMouseLeave={e => {
                      if (selectedIcon !== icon.id) {
                        e.currentTarget.style.background = '#0f1729';
                      }
                    }}
                  >
                    {icon.label}
                  </button>
                ))}
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
            onClick={handleCreate}
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
            Создать
          </button>
        </div>
      </div>
    </div>
  );
}
