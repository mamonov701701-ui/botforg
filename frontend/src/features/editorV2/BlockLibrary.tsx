import React, { useEffect, useMemo } from 'react';
import { useEditorStore } from '../../stores/editorStore';
import { BlockCatalogItem } from '../../types/blocks';

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

const BlockLibrary: React.FC = () => {
  const { catalog, plan, isLoading, loadCatalog, getFilteredCatalog, searchQuery } = useEditorStore();

  // Load catalog on mount
  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Group blocks by category
  const groupedBlocks = useMemo(() => {
    const filtered = getFilteredCatalog();
    const groups: Record<string, BlockCatalogItem[]> = {};
    
    filtered.forEach(block => {
      if (!groups[block.category]) {
        groups[block.category] = [];
      }
      groups[block.category].push(block);
    });
    
    return groups;
  }, [catalog, searchQuery, getFilteredCatalog]);

  const handleDragStart = (e: React.DragEvent, block: BlockCatalogItem) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/block', JSON.stringify(block));
  };

  if (isLoading) {
    return (
      <div style={{ 
        padding: 16, 
        color: '#fff', 
        textAlign: 'center',
        paddingTop: 40
      }}>
        Загрузка блоков...
      </div>
    );
  }

  return (
    <div style={{ 
      padding: 12, 
      height: '100%', 
      overflowY: 'auto',
      overflowX: 'hidden',
      transition: 'opacity 0.3s ease'
    }}>
      <h3 style={{ 
        color: '#fff', 
        fontSize: 14, 
        fontWeight: 700, 
        marginBottom: 16,
        paddingLeft: 4,
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        Библиотека блоков
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          padding: '2px 6px',
          background: 'rgba(59, 130, 246, 0.2)',
          borderRadius: 4,
          textTransform: 'uppercase'
        }}>
          {plan}
        </span>
      </h3>
      
      {CATEGORY_ORDER.map((categoryKey) => {
        const blocks = groupedBlocks[categoryKey];
        if (!blocks || blocks.length === 0) return null;
        
        return (
          <div key={categoryKey} style={{ marginBottom: 20 }}>
            <div style={{ 
              fontSize: 11, 
              fontWeight: 700, 
              opacity: 0.5, 
              color: '#fff',
              marginBottom: 8,
              paddingLeft: 4,
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              {CATEGORY_LABELS[categoryKey] || categoryKey}
            </div>
            
            {blocks.map(block => (
              <div
                key={block.id}
                draggable
                onDragStart={(e) => handleDragStart(e, block)}
                style={{
                  background: '#1a1a2e',
                  border: `2px solid ${block.color}`,
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 8,
                  cursor: 'grab',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#252540';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#1a1a2e';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
                title={block.description}
              >
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 8,
                  marginBottom: 4
                }}>
                  <span style={{ fontSize: 16 }}>{block.icon}</span>
                  <span style={{ 
                    color: '#fff', 
                    fontSize: 13, 
                    fontWeight: 600,
                    flex: 1
                  }}>
                    {block.title}
                  </span>
                </div>
                <div style={{ 
                  color: '#a0a0b0', 
                  fontSize: 11,
                  lineHeight: '1.4',
                  paddingLeft: 24,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}>
                  {block.description}
                </div>
              </div>
            ))}
          </div>
        );
      })}
      
      {Object.keys(groupedBlocks).length === 0 && (
        <div style={{ 
          color: '#888', 
          textAlign: 'center', 
          padding: 20,
          fontSize: 12
        }}>
          Нет доступных блоков
        </div>
      )}
    </div>
  );
};

export default BlockLibrary;

