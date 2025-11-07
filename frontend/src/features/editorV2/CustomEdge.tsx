import React, { useState } from 'react';
import { getBezierPath, EdgeProps, MarkerType } from 'reactflow';

const CustomEdge = React.memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    selected,
    style,
    data,
  }: EdgeProps) => {
    const [isHovered, setIsHovered] = useState(false);

    // Используем getBezierPath для плавных изгибов - возвращает path и ТОЧНЫЕ координаты центра
    const [path, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    // Используем ТОЧНЫЕ координаты центра пути с fallback на среднее арифметическое
    const centerX = typeof labelX === 'number' && !isNaN(labelX) ? labelX : (sourceX + targetX) / 2;
    const centerY = typeof labelY === 'number' && !isNaN(labelY) ? labelY : (sourceY + targetY) / 2;

    // Цвета в зависимости от состояния
    const strokeColor = selected ? '#ef4444' : isHovered ? '#FFD54F' : '#FFB300';
    const strokeWidth = isHovered || selected ? 5 : 4; // Уменьшено в 2 раза

    // Динамический markerEnd с правильным цветом
    const dynamicMarkerEnd = {
      type: MarkerType.ArrowClosed,
      width: 30,
      height: 30,
      color: strokeColor, // Цвет стрелки соответствует цвету линии
    };

    const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (data?.onDelete && typeof data.onDelete === 'function') {
        try {
          data.onDelete(id);
        } catch (error) {
          console.error('Error deleting edge:', error);
        }
      } else {
        console.warn('Edge delete handler not provided for edge:', id);
      }
    };

    // Уникальный ID для маркера (на основе id края и состояния)
    const markerId = `arrow-${id.replace(/[^a-zA-Z0-9]/g, '_')}-${selected ? 'sel' : isHovered ? 'hov' : 'def'}`;

    return (
      <g data-custom-edge="true">
        {/* Определяем маркер стрелки с нужным цветом - увеличенный и залитый */}
        <defs>
          <marker
            id={markerId}
            markerWidth="12"
            markerHeight="12"
            refX="6"
            refY="6"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 0 0 L 12 6 L 0 12 L 3 6 Z" fill={strokeColor} stroke="none" />
          </marker>
        </defs>

        <g style={{ pointerEvents: 'auto' }}>
          {/* Невидимый широкий path для лучшего захвата hover */}
          <path
            d={path}
            fill="none"
            stroke="transparent"
            strokeWidth={20}
            strokeLinecap="round"
            style={{
              cursor: 'pointer',
              pointerEvents: 'stroke',
            }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          />

          {/* Видимый path линии с инлайн стилями */}
          <path
            d={path}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            markerEnd={`url(#${markerId})`}
            data-edge-path="custom"
            style={{
              cursor: 'pointer',
              transition: 'stroke 0.2s ease, stroke-width 0.2s ease',
              filter: selected
                ? 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.6))'
                : isHovered
                  ? 'drop-shadow(0 0 6px rgba(255, 213, 79, 0.4))'
                  : 'none',
              pointerEvents: 'none', // События обрабатывает широкий path
            }}
          />

          {/* Корзинка появляется только при выделении - УВЕЛИЧЕННАЯ ЗАЛИТАЯ ИКОНКА */}
          {selected && (
            <foreignObject
              x={centerX - 24}
              y={centerY - 24}
              width={48}
              height={48}
              style={{
                overflow: 'visible',
                zIndex: 1000,
                pointerEvents: 'all',
              }}
            >
              <div
                onClick={handleDelete}
                style={{
                  width: 48,
                  height: 48,
                  background: '#ffffff',
                  borderRadius: '50%',
                  border: '3px solid #ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
                  transition: 'all 0.2s ease',
                }}
                onMouseOver={e => {
                  e.currentTarget.style.transform = 'scale(1.15)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(239, 68, 68, 0.6)';
                  e.currentTarget.style.background = '#fef2f2';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4)';
                  e.currentTarget.style.background = '#ffffff';
                }}
                title="Удалить связь"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24">
                  <line
                    x1="5"
                    y1="5"
                    x2="19"
                    y2="19"
                    stroke="#ef4444"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <line
                    x1="19"
                    y1="5"
                    x2="5"
                    y2="19"
                    stroke="#ef4444"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </foreignObject>
          )}
        </g>
      </g>
    );
  }
);

CustomEdge.displayName = 'CustomEdge';

export default CustomEdge;
