import React, { useState, useMemo, useEffect } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { BlockCatalogItem } from '../../types/blocks';
import { nanoid } from 'nanoid';

// Category names mapping
const CATEGORY_LABELS: Record<string, string> = {
  basic: 'Базовые',
  business: 'Бизнесовые',
  service: 'Сервисные',
  system: 'Системные',
  ai: 'AI',
  custom: 'Дополнительные',
};

const CATEGORY_ORDER = ['basic', 'business', 'service', 'system', 'ai', 'custom'];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAddBlock: (block: BlockCatalogItem, position?: { x: number; y: number }) => void;
}

export default function BlockLibraryModal({ isOpen, onClose, onAddBlock }: Props) {
  const { catalog, plan, role, loadCatalog, getFilteredCatalog, searchQuery, setSearchQuery } =
    useEditorStore();
  const [activeTab, setActiveTab] = useState<string>('basic');
  const [selectedBlock, setSelectedBlock] = useState<BlockCatalogItem | null>(null);

  // Load catalog on mount
  useEffect(() => {
    if (isOpen) {
      loadCatalog();
    }
  }, [isOpen, loadCatalog]);

  // Reset selection when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedBlock(null);
      setActiveTab('basic');
    }
  }, [isOpen]);

  // Filter blocks by active tab and search
  const filteredBlocks = useMemo(() => {
    const filtered = getFilteredCatalog();
    return filtered.filter(block => block.category === activeTab);
  }, [catalog, searchQuery, plan, role, activeTab, getFilteredCatalog]);

  const handleBlockClick = (block: BlockCatalogItem) => {
    // Position will be calculated by parent (viewport center or near selected node)
    onAddBlock(block);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0b1b2a',
          borderRadius: 16,
          padding: 0,
          maxWidth: 900,
          width: '90%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          border: '2px solid #374151',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: 24,
            borderBottom: '1px solid #1f2937',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ color: '#fff', fontSize: 24, fontWeight: 700, margin: 0 }}>
            Библиотека блоков
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              fontSize: 28,
              cursor: 'pointer',
              padding: 4,
              lineHeight: 1,
              borderRadius: 4,
            }}
            title="Закрыть"
            onMouseEnter={e => {
              e.currentTarget.style.background = '#252540';
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#9ca3af';
            }}
          >
            ×
          </button>
        </div>

        {/* Search and Filters */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #1f2937',
            background: '#0f1729',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* Search input */}
          <input
            type="text"
            placeholder="Найти блок..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: '#1a1a2e',
              border: '1px solid #374151',
              borderRadius: 8,
              color: '#fff',
              fontSize: 14,
            }}
          />

          {/* Filters: Plan and Role */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <label
                style={{ color: '#9ca3af', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}
              >
                Тариф:
              </label>
              <select
                value={plan}
                onChange={e => useEditorStore.getState().setPlan(e.target.value as any)}
                style={{
                  flex: 1,
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <label
                style={{ color: '#9ca3af', fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}
              >
                Роль:
              </label>
              <select
                value={role}
                onChange={e => useEditorStore.getState().setRole(e.target.value as any)}
                style={{
                  flex: 1,
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
          </div>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid #1f2937',
            background: '#0f1729',
            overflowX: 'auto',
          }}
        >
          {CATEGORY_ORDER.map(categoryKey => {
            const count = catalog.filter(b => b.category === categoryKey).length;
            const isActive = activeTab === categoryKey;
            return (
              <button
                key={categoryKey}
                onClick={() => setActiveTab(categoryKey)}
                style={{
                  padding: '12px 20px',
                  background: isActive ? '#1a1a2e' : 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                  color: isActive ? '#fff' : '#9ca3af',
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = '#1a1a2e';
                    e.currentTarget.style.color = '#fff';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#9ca3af';
                  }
                }}
              >
                <span>{CATEGORY_LABELS[categoryKey] || categoryKey}</span>
                <span
                  style={{
                    background: isActive ? '#3b82f6' : '#374151',
                    borderRadius: 12,
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 24,
            display: 'grid',
            gridTemplateColumns: selectedBlock ? '1fr 320px' : '1fr',
            gap: 24,
          }}
        >
          {/* Blocks List */}
          <div>
            {filteredBlocks.length === 0 ? (
              <div
                style={{
                  padding: 40,
                  textAlign: 'center',
                  color: '#9ca3af',
                }}
              >
                <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                  Нет доступных блоков
                </div>
                <div style={{ fontSize: 13 }}>
                  Попробуйте изменить фильтры или выбрать другую категорию
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                  gap: 16,
                }}
              >
                {filteredBlocks.map(block => (
                  <div
                    key={block.id}
                    onClick={() => handleBlockClick(block)}
                    onMouseEnter={e => {
                      setSelectedBlock(block);
                      // Visual hover effect
                      const r = parseInt(block.color.slice(1, 3), 16);
                      const g = parseInt(block.color.slice(3, 5), 16);
                      const b = parseInt(block.color.slice(5, 7), 16);
                      if (selectedBlock?.id !== block.id) {
                        e.currentTarget.style.boxShadow = `0 4px 16px rgba(${r}, ${g}, ${b}, 0.4)`;
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (selectedBlock?.id !== block.id) {
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }
                    }}
                    style={{
                      background: selectedBlock?.id === block.id ? '#1a1a2e' : '#0f1729',
                      border: `2px solid ${block.color}`,
                      borderRadius: 12,
                      padding: 16,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      transform: selectedBlock?.id === block.id ? 'scale(1.02)' : 'scale(1)',
                      boxShadow:
                        selectedBlock?.id === block.id
                          ? `0 4px 16px ${block.color}40`
                          : '0 2px 8px rgba(0, 0, 0, 0.2)',
                      display: 'flex',
                      flexDirection: 'column',
                      minHeight: '120px',
                      maxHeight: '200px',
                      boxSizing: 'border-box',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        marginBottom: 8,
                        minHeight: 0,
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: 24, flexShrink: 0, lineHeight: 1 }}>
                        {block.icon}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          fontWeight: 600,
                          fontSize: 14,
                          color: '#fff',
                          wordWrap: 'break-word',
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                          lineHeight: 1.4,
                          minWidth: 0,
                        }}
                      >
                        {block.title}
                      </div>
                    </div>
                    <div
                      style={{
                        color: '#9ca3af',
                        fontSize: 12,
                        lineHeight: 1.5,
                        wordWrap: 'break-word',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        overflowY: 'auto',
                        flex: 1,
                        minHeight: 0,
                        paddingRight: 4,
                      }}
                    >
                      {block.description}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Preview Panel */}
          {selectedBlock && (
            <div
              style={{
                background: '#0f1729',
                border: '1px solid #374151',
                borderRadius: 12,
                padding: 20,
                position: 'sticky',
                top: 0,
                maxHeight: 'calc(85vh - 200px)',
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 16,
                  paddingBottom: 16,
                  borderBottom: '1px solid #374151',
                }}
              >
                <span style={{ fontSize: 32 }}>{selectedBlock.icon}</span>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>
                    {selectedBlock.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>ID: {selectedBlock.id}</div>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>
                  Описание
                </div>
                <div style={{ color: '#fff', fontSize: 13, lineHeight: 1.6 }}>
                  {selectedBlock.description}
                </div>
              </div>

              {selectedBlock.configSchema && selectedBlock.configSchema.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>
                    Параметры
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selectedBlock.configSchema.slice(0, 5).map((param, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#1a1a2e',
                          padding: 8,
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                      >
                        <div style={{ color: '#fff', fontWeight: 600 }}>
                          {param.label || param.name}
                        </div>
                        <div style={{ color: '#9ca3af', fontSize: 11 }}>
                          {param.type} {param.required ? '(обязательно)' : '(опционально)'}
                        </div>
                      </div>
                    ))}
                    {selectedBlock.configSchema.length > 5 && (
                      <div style={{ color: '#9ca3af', fontSize: 11, textAlign: 'center' }}>
                        и ещё {selectedBlock.configSchema.length - 5}...
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={() => handleBlockClick(selectedBlock)}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: selectedBlock.color,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.opacity = '0.9';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Добавить блок
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
