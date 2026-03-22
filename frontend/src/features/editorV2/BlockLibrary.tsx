import React, { useEffect, useMemo, useState } from 'react';
import { Star, Clock, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';
import { useAuthStore } from '../../stores/authStore';
import { BlockCatalogItem } from '../../types/blocks';
import { planLabelRu } from './planLabels';

// Category names mapping
const CATEGORY_LABELS: Record<string, string> = {
  favorites: '⭐ Избранные',
  recent: '🕐 Недавние',
  basic: 'Базовые',
  business: 'Бизнесовые',
  service: 'Сервисные',
  system: 'Системные',
  ai: 'ИИ',
  custom: 'Дополнительные',
};

const CATEGORY_ORDER = [
  'favorites',
  'recent',
  'basic',
  'business',
  'service',
  'system',
  'ai',
  'custom',
];

// Block card component for reuse
interface BlockCardProps {
  block: BlockCatalogItem;
  onDragStart: (e: React.DragEvent, block: BlockCatalogItem) => void;
  isFavorite: boolean;
  onToggleFavorite: (blockId: string) => void;
  showFavoriteButton?: boolean;
  highlightQuery?: string;
}

const BlockCard: React.FC<BlockCardProps> = ({
  block,
  onDragStart,
  isFavorite,
  onToggleFavorite,
  showFavoriteButton = true,
  highlightQuery = '',
}) => {
  const query = highlightQuery.trim();

  const highlight = (text: string) => {
    if (!query) return text;
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span
          style={{
            background: 'rgba(59, 130, 246, 0.25)',
            borderRadius: 3,
            padding: '0 1px',
          }}
        >
          {text.slice(idx, idx + query.length)}
        </span>
        {text.slice(idx + query.length)}
      </>
    );
  };
  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, block)}
      style={{
        background: '#1a1a2e',
        border: `2px solid ${block.color}`,
        borderRadius: 8,
        padding: 10,
        marginBottom: 8,
        cursor: 'grab',
        transition: 'all 0.2s',
        position: 'relative',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = '#252540';
        e.currentTarget.style.transform = 'translateY(-2px)';
        if (block.color && block.color.length === 7) {
          const r = parseInt(block.color.slice(1, 3), 16);
          const g = parseInt(block.color.slice(3, 5), 16);
          const b = parseInt(block.color.slice(5, 7), 16);
          e.currentTarget.style.boxShadow = `0 4px 12px rgba(${r}, ${g}, ${b}, 0.4)`;
        } else {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 255, 255, 0.2)';
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = '#1a1a2e';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
      title={`${block.title} - ${block.description}\n\nПеретащите блок на холст для добавления`}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 18,
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
          }}
        >
          {block.icon}
        </span>
        <span
          style={{
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            flex: 1,
          }}
        >
          {highlight(block.title)}
        </span>
        {showFavoriteButton && (
          <button
            onClick={e => {
              e.stopPropagation();
              e.preventDefault();
              onToggleFavorite(block.id);
            }}
            onMouseDown={e => e.stopPropagation()}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: isFavorite ? 1 : 0.3,
              transition: 'opacity 0.2s, transform 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.transform = 'scale(1.2)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.opacity = isFavorite ? '1' : '0.3';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            title={isFavorite ? 'Удалить из избранного' : 'Добавить в избранное'}
          >
            <Star
              size={14}
              fill={isFavorite ? '#fbbf24' : 'none'}
              color={isFavorite ? '#fbbf24' : '#fff'}
            />
          </button>
        )}
      </div>
      <div
        style={{
          color: '#a0a0b0',
          fontSize: 11,
          lineHeight: '1.4',
          paddingLeft: 26,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {highlight(block.description)}
      </div>
      {(block.planAccess || block.permissions) && (
        <div
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTop: `1px solid ${block.color}33`,
            fontSize: 10,
            color: '#6b7280',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            paddingLeft: 26,
          }}
        >
          <span>🔒</span>
          <span>
            {block.planAccess && block.planAccess.length < 3 && (
              <span>{block.planAccess.join(' + ')}</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
};

const BlockLibrary: React.FC = () => {
  const {
    catalog,
    plan,
    isLoading,
    loadCatalog,
    getFilteredCatalog,
    searchQuery,
    setSearchQuery,
    toggleFavorite,
    isFavorite,
    addToRecent,
    getFavoriteBlocks,
    getRecentBlocks,
    collapsedCategories,
    toggleCategory,
  } = useEditorStore();

  const [localSearch, setLocalSearch] = useState('');

  // Проверка авторизации
  const { user } = useAuthStore();

  // Load catalog on mount только если пользователь авторизован
  useEffect(() => {
    if (user) {
      loadCatalog();
    }
  }, [loadCatalog, user]);

  // Sync local search with store
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(localSearch);
    }, 150);
    return () => clearTimeout(timer);
  }, [localSearch, setSearchQuery]);

  // Get favorites and recent
  const favoriteBlocks = useMemo(() => getFavoriteBlocks(), [getFavoriteBlocks, catalog]);
  const recentBlocks = useMemo(() => getRecentBlocks(), [getRecentBlocks, catalog]);

  // Group blocks by category
  const groupedBlocks = useMemo(() => {
    const filtered = getFilteredCatalog();
    const groups: Record<string, BlockCatalogItem[]> = {};

    // Add favorites section if there are any
    if (favoriteBlocks.length > 0 && !searchQuery) {
      groups['favorites'] = favoriteBlocks;
    }

    // Add recent section if there are any
    if (recentBlocks.length > 0 && !searchQuery) {
      groups['recent'] = recentBlocks;
    }

    // Group by category
    filtered.forEach(block => {
      if (!groups[block.category]) {
        groups[block.category] = [];
      }
      groups[block.category].push(block);
    });

    return groups;
  }, [catalog, searchQuery, getFilteredCatalog, favoriteBlocks, recentBlocks]);

  const handleDragStart = (e: React.DragEvent, block: BlockCatalogItem) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/block', JSON.stringify(block));

    // Track as recent
    addToRecent(block.id);

    // Create drag preview
    const dragPreview = document.createElement('div');
    dragPreview.style.cssText = `
      background: #1a1a2e;
      border: 3px solid ${block.color};
      border-radius: 12px;
      padding: 12px 16px;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      opacity: 0.9;
    `;
    dragPreview.innerHTML = `
      <span style="font-size: 18px;">${block.icon || '📦'}</span>
      <span>${block.title}</span>
    `;
    document.body.appendChild(dragPreview);
    e.dataTransfer.setDragImage(
      dragPreview,
      dragPreview.offsetWidth / 2,
      dragPreview.offsetHeight / 2
    );

    setTimeout(() => {
      document.body.removeChild(dragPreview);
    }, 0);
  };

  const isCategoryCollapsed = (category: string) => collapsedCategories.includes(category);

  if (isLoading) {
    return (
      <div
        style={{
          padding: 16,
          color: '#fff',
          textAlign: 'center',
          paddingTop: 40,
        }}
      >
        <div
          style={{
            width: 24,
            height: 24,
            border: '3px solid #333',
            borderTop: '3px solid #3b82f6',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 12px',
          }}
        />
        Загрузка блоков...
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 12,
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        transition: 'opacity 0.3s ease',
      }}
    >
      {/* Header */}
      <h3
        style={{
          color: '#fff',
          fontSize: 14,
          fontWeight: 700,
          marginBottom: 12,
          paddingLeft: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        Библиотека блоков
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: '2px 6px',
            background: 'rgba(59, 130, 246, 0.2)',
            borderRadius: 4,
          }}
        >
          {planLabelRu(plan)}
        </span>
      </h3>

      {/* Search */}
      <div
        style={{
          position: 'relative',
          marginBottom: 16,
        }}
      >
        <Search
          size={14}
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#666',
          }}
        />
        <input
          type="text"
          placeholder="Поиск блоков..."
          value={localSearch}
          onChange={e => setLocalSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 32px 8px 32px',
            background: '#1a1a2e',
            border: '1px solid #333',
            borderRadius: 6,
            color: '#fff',
            fontSize: 13,
            outline: 'none',
            transition: 'border-color 0.2s',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = '#3b82f6')}
          onBlur={e => (e.currentTarget.style.borderColor = '#333')}
        />
        {localSearch && (
          <button
            onClick={() => setLocalSearch('')}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#666',
              padding: 4,
              display: 'flex',
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Category sections */}
      {CATEGORY_ORDER.map(categoryKey => {
        const blocks = groupedBlocks[categoryKey];
        if (!blocks || blocks.length === 0) return null;

        const isCollapsed = isCategoryCollapsed(categoryKey);
        const isSpecialCategory = categoryKey === 'favorites' || categoryKey === 'recent';

        return (
          <div key={categoryKey} style={{ marginBottom: 16 }}>
            {/* Category header */}
            <div
              onClick={() => toggleCategory(categoryKey)}
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: isSpecialCategory ? '#fbbf24' : '#fff',
                marginBottom: isCollapsed ? 0 : 8,
                paddingLeft: 4,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                opacity: isSpecialCategory ? 1 : 0.5,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = isSpecialCategory ? '1' : '0.5')}
            >
              {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              {CATEGORY_LABELS[categoryKey] || categoryKey}
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  opacity: 0.6,
                  marginLeft: 'auto',
                  paddingRight: 4,
                }}
              >
                {blocks.length}
              </span>
            </div>

            {/* Blocks */}
            {!isCollapsed && (
              <div
                style={{
                  animation: 'fadeIn 0.2s ease',
                }}
              >
                {blocks.map(block => (
                  <BlockCard
                    key={`${categoryKey}-${block.id}`}
                    block={block}
                    onDragStart={handleDragStart}
                    isFavorite={isFavorite(block.id)}
                    onToggleFavorite={toggleFavorite}
                    showFavoriteButton={categoryKey !== 'favorites'}
                    highlightQuery={searchQuery}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {Object.keys(groupedBlocks).length === 0 && (
        <div
          style={{
            color: '#888',
            textAlign: 'center',
            padding: 20,
            fontSize: 12,
          }}
        >
          {searchQuery ? 'Ничего не найдено' : 'Нет доступных блоков'}
        </div>
      )}

      {/* CSS for animations */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-8px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>
    </div>
  );
};

export default BlockLibrary;
