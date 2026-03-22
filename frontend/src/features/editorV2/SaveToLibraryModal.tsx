import React, { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import {
  Home,
  Package,
  CreditCard,
  HelpCircle,
  Headphones,
  ShoppingCart,
  FileText,
  Gift,
} from 'lucide-react';

interface SaveToLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    name: string;
    description: string;
    category: string;
    icon: string;
    overwrite: boolean;
  }) => void;
  currentScenarioName?: string;
  existingScenario?: { id: string; name: string } | null;
}

const CATEGORIES = [
  { value: 'payment', label: '💳 Оплата' },
  { value: 'support', label: '🎧 Поддержка' },
  { value: 'catalog', label: '📦 Каталог' },
  { value: 'faq', label: '❓ Частые вопросы' },
  { value: 'form', label: '📄 Форма' },
  { value: 'promo', label: '🎁 Акции' },
  { value: 'other', label: '⚙️ Другое' },
];

const ICON_COMPONENTS = {
  Home,
  Package,
  CreditCard,
  HelpCircle,
  Headphones,
  ShoppingCart,
  FileText,
  Gift,
};

const ICONS = [
  { id: 'Home', Component: Home },
  { id: 'Package', Component: Package },
  { id: 'CreditCard', Component: CreditCard },
  { id: 'HelpCircle', Component: HelpCircle },
  { id: 'Headphones', Component: Headphones },
  { id: 'ShoppingCart', Component: ShoppingCart },
  { id: 'FileText', Component: FileText },
  { id: 'Gift', Component: Gift },
];

export default function SaveToLibraryModal({
  isOpen,
  onClose,
  onSave,
  currentScenarioName = '',
  existingScenario = null,
}: SaveToLibraryModalProps) {
  const [name, setName] = useState(currentScenarioName);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [selectedIcon, setSelectedIcon] = useState('FileText');
  const [conflictResolution, setConflictResolution] = useState<'overwrite' | 'copy' | 'rename'>(
    'overwrite'
  );

  if (!isOpen) return null;

  const handleSave = () => {
    if (!name.trim()) {
      alert('Введите название сценария');
      return;
    }

    let finalName = name;
    if (existingScenario && conflictResolution === 'copy') {
      finalName = `${name} (копия)`;
    }

    onSave({
      name: finalName,
      description,
      category,
      icon: selectedIcon,
      overwrite: conflictResolution === 'overwrite',
    });

    // Сброс формы
    setName('');
    setDescription('');
    setCategory('other');
    setSelectedIcon('FileText');
    onClose();
  };

  const SelectedIconComponent = ICON_COMPONENTS[selectedIcon as keyof typeof ICON_COMPONENTS];

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
          maxWidth: 560,
          border: '1px solid #374151',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          maxHeight: '90vh',
          overflow: 'auto',
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
            position: 'sticky',
            top: 0,
            background: '#1a1a2e',
            zIndex: 1,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: 0 }}>
            Сохранить в библиотеку
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
          {/* Название */}
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
              Название сценария:
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Например: Оформление заказа с оплатой"
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
              Описание <span style={{ color: '#9ca3af', fontWeight: 400 }}>(опционально)</span>:
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Краткое описание сценария..."
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

          {/* Категория */}
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
              Категория:
            </label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
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
              {CATEGORIES.map(cat => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Иконка */}
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
              Иконка:
            </label>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
              }}
            >
              {ICONS.map(({ id, Component }) => (
                <button
                  key={id}
                  onClick={() => setSelectedIcon(id)}
                  style={{
                    padding: '16px',
                    background: selectedIcon === id ? 'rgba(255, 210, 76, 0.1)' : '#0f1729',
                    border: `1px solid ${selectedIcon === id ? 'var(--primary)' : '#374151'}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={e => {
                    if (selectedIcon !== id) {
                      e.currentTarget.style.background = '#1a1a2e';
                    }
                  }}
                  onMouseLeave={e => {
                    if (selectedIcon !== id) {
                      e.currentTarget.style.background = '#0f1729';
                    }
                  }}
                >
                  <Component size={24} color={selectedIcon === id ? 'var(--primary)' : '#9ca3af'} />
                </button>
              ))}
            </div>
          </div>

          {/* Предупреждение о существующем сценарии */}
          {existingScenario && (
            <div
              style={{
                padding: 16,
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: 8,
                marginBottom: 20,
              }}
            >
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <AlertTriangle size={20} color="#f59e0b" />
                <div>
                  <div style={{ color: '#f59e0b', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                    Сценарий "{existingScenario.name}" уже существует
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: 13 }}>Выберите действие:</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginLeft: 32 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="conflict"
                    checked={conflictResolution === 'overwrite'}
                    onChange={() => setConflictResolution('overwrite')}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ color: '#fff', fontSize: 14 }}>Перезаписать существующий</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="conflict"
                    checked={conflictResolution === 'copy'}
                    onChange={() => setConflictResolution('copy')}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ color: '#fff', fontSize: 14 }}>
                    Сохранить как "{name} (копия)"
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="conflict"
                    checked={conflictResolution === 'rename'}
                    onChange={() => setConflictResolution('rename')}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ color: '#fff', fontSize: 14 }}>Изменить название вручную</span>
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
            position: 'sticky',
            bottom: 0,
            background: '#1a1a2e',
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
