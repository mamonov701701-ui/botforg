import React, { useState, useRef, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { PlanType, RoleType } from '../../types/blocks';

const getPlanBadgeColor = (plan: PlanType) => {
  switch (plan) {
    case 'free':
      return '#6b7280';
    case 'pro':
      return '#3b82f6';
    case 'enterprise':
      return '#8b5cf6';
  }
};

interface EditorControlsProps {
  onExport?: () => void;
  onImport?: () => void;
  onOpenBlockLibrary?: () => void;
}

const EditorControls: React.FC<EditorControlsProps> = ({
  onExport,
  onImport,
  onOpenBlockLibrary,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { plan, role, setPlan, setRole, searchQuery, setSearchQuery, catalog } = useEditorStore();

  const handlePlanChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPlan(e.target.value as PlanType);
  };

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRole(e.target.value as RoleType);
  };

  // Закрытие меню при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 16px',
        backgroundColor: '#0f1729',
        borderBottom: '1px solid #1f2937',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ color: '#9ca3af', fontSize: 12, fontWeight: 500 }}>Тариф:</label>
        <select
          value={plan}
          onChange={handlePlanChange}
          style={{
            background: '#1a1a2e',
            color: '#fff',
            border: '1px solid #374151',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <label style={{ color: '#9ca3af', fontSize: 12, fontWeight: 500 }}>Роль:</label>
        <select
          value={role}
          onChange={handleRoleChange}
          style={{
            background: '#1a1a2e',
            color: '#fff',
            border: '1px solid #374151',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          <option value="viewer">Viewer</option>
          <option value="support">Support</option>
          <option value="developer">Developer</option>
          <option value="manager_template">Manager Template</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Кнопка "Добавить блок" */}
        {onOpenBlockLibrary && (
          <button
            onClick={onOpenBlockLibrary}
            style={{
              background: '#22c55e',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#16a34a';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = '#22c55e';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <span>➕</span>
            <span>Добавить блок</span>
          </button>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginLeft: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: 'rgba(59, 130, 246, 0.1)',
            borderRadius: 6,
            border: '1px solid rgba(59, 130, 246, 0.3)',
          }}
        >
          <span style={{ fontSize: 20 }}>👤</span>
          <div style={{ fontSize: 12 }}>
            <div
              style={{
                fontWeight: 700,
                color: getPlanBadgeColor(plan),
                textTransform: 'uppercase',
              }}
            >
              {plan}
            </div>
            <div style={{ opacity: 0.7, fontSize: 10, color: '#9ca3af' }}>{role}</div>
          </div>
        </div>
        <div style={{ color: '#6b7280', fontSize: 12 }}>Блоков: {catalog.length}</div>

        {/* Меню "Настройки" */}
        {(onExport || onImport) && (
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              style={{
                background: '#1a1a2e',
                color: '#fff',
                border: '1px solid #374151',
                borderRadius: 6,
                padding: '6px 12px',
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>⚙️</span>
              <span>Настройки</span>
              <span style={{ fontSize: 10 }}>{isMenuOpen ? '▲' : '▼'}</span>
            </button>

            {isMenuOpen && (
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
                  minWidth: 180,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                  zIndex: 1000,
                }}
              >
                {onImport && (
                  <button
                    onClick={() => {
                      onImport();
                      setIsMenuOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'transparent',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 13,
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#252540';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span>📥</span>
                    <span>Импорт сценария</span>
                  </button>
                )}
                {onExport && (
                  <button
                    onClick={() => {
                      onExport();
                      setIsMenuOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'transparent',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      fontSize: 13,
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#252540';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <span>📤</span>
                    <span>Экспорт сценария</span>
                  </button>
                )}
                <div
                  style={{
                    height: 1,
                    background: '#374151',
                    margin: '4px 0',
                  }}
                />
                <button
                  onClick={() => {
                    // TODO: Настройки проекта - будет добавлено позже
                    setIsMenuOpen(false);
                  }}
                  disabled
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    background: 'transparent',
                    color: '#6b7280',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'not-allowed',
                    fontSize: 13,
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    opacity: 0.5,
                  }}
                >
                  <span>⚙️</span>
                  <span>Настройки проекта</span>
                  <span style={{ fontSize: 10, marginLeft: 'auto' }}>скоро</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default EditorControls;
