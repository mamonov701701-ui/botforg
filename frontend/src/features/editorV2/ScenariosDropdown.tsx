import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDown,
  Trash2,
  Home,
  Package,
  CreditCard,
  HelpCircle,
  Headphones,
  ShoppingCart,
  FileText,
  Gift,
  LucideIcon,
} from 'lucide-react';

// Маппинг названий иконок к компонентам
const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  Package,
  CreditCard,
  HelpCircle,
  Headphones,
  ShoppingCart,
  FileText,
  Gift,
};

interface Scenario {
  id: string;
  name: string;
  icon?: string; // Название иконки из lucide-react
}

interface ScenariosDropdownProps {
  scenarios: Scenario[];
  currentScenarioId: string;
  onSelectScenario: (scenarioId: string) => void;
  onDeleteScenario?: (scenarioId: string) => void;
  isLoading?: boolean;
}

export default function ScenariosDropdown({
  scenarios,
  currentScenarioId,
  onSelectScenario,
  onDeleteScenario,
  isLoading = false,
}: ScenariosDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentScenario = scenarios.find(s => s.id === currentScenarioId);

  // Определяем что показывать
  const isEmpty = !isLoading && scenarios.length === 0;
  const displayName = isLoading ? 'Загрузка...' : currentScenario?.name || 'Выберите сценарий';

  // Получаем компонент иконки
  const getIconComponent = (iconName?: string): LucideIcon => {
    if (!iconName) return FileText;
    return ICON_MAP[iconName] || FileText;
  };

  const CurrentIcon = getIconComponent(currentScenario?.icon);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      {/* Кнопка dropdown */}
      <button
        onClick={() => {
          if (isLoading) return;
          setIsOpen(!isOpen);
        }}
        style={{
          background: '#1a1a2e',
          color: '#fff',
          border: '1px solid #374151',
          borderRadius: 6,
          padding: '10px 16px',
          fontSize: 14,
          fontWeight: 600,
          cursor: isLoading ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          transition: 'all 0.2s ease',
          minWidth: 180,
          opacity: isLoading ? 0.6 : 1,
        }}
        onMouseEnter={e => {
          if (!isLoading) {
            e.currentTarget.style.background = '#252540';
          }
        }}
        onMouseLeave={e => {
          if (!isLoading) {
            e.currentTarget.style.background = '#1a1a2e';
          }
        }}
        title="Переключение между сценариями"
      >
        <CurrentIcon size={18} style={{ color: 'var(--primary)' }} />
        <span style={{ flex: 1, textAlign: 'left' }}>{displayName}</span>
        <ChevronDown
          size={16}
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            color: '#9ca3af',
          }}
        />
      </button>

      {/* Dropdown меню */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            background: '#1a1a2e',
            border: '1px solid #374151',
            borderRadius: 8,
            padding: 4,
            minWidth: 240,
            maxHeight: 400,
            overflowY: 'auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 1000,
          }}
        >
          {/* Список сценариев текущего бота */}
          {scenarios.map(scenario => {
            const isActive = scenario.id === currentScenarioId;
            const ScenarioIcon = getIconComponent(scenario.icon);

            return (
              <div
                key={scenario.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 2,
                }}
              >
                <button
                  onClick={() => {
                    onSelectScenario(scenario.id);
                    setIsOpen(false);
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    background: isActive ? 'rgba(255, 210, 76, 0.1)' : 'transparent',
                    color: isActive ? 'var(--primary)' : '#fff',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'background 0.2s ease',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) e.currentTarget.style.background = '#252540';
                  }}
                  onMouseLeave={e => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <ScenarioIcon
                    size={16}
                    style={{ color: isActive ? 'var(--primary)' : '#9ca3af' }}
                  />
                  <span>{scenario.name}</span>
                  {isActive && (
                    <span
                      style={{
                        marginLeft: 'auto',
                        fontSize: 12,
                        color: 'var(--primary)',
                      }}
                    >
                      ✓
                    </span>
                  )}
                </button>

                {/* Кнопка удаления (только если не главный и не единственный) */}
                {onDeleteScenario && scenarios.length > 1 && scenario.id !== scenarios[0].id && (
                  <button
                    onClick={() => onDeleteScenario(scenario.id)}
                    style={{
                      padding: '8px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      color: '#6b7280',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.color = '#ef4444';
                      e.currentTarget.style.background = '#ef444410';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.color = '#6b7280';
                      e.currentTarget.style.background = 'transparent';
                    }}
                    title="Удалить сценарий"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}

          {/* Если нет сценариев */}
          {scenarios.length === 0 && (
            <div
              style={{ padding: '16px 12px', color: '#6b7280', fontSize: 13, textAlign: 'center' }}
            >
              <div style={{ marginBottom: 8 }}>Нет сценариев</div>
              <div style={{ fontSize: 12, color: '#4b5563' }}>
                Нажмите "Новый сценарий" чтобы создать
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
