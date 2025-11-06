import React, { useState } from 'react';
import { getBezierPath, EdgeProps } from 'reactflow';

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

    // Используем getBezierPath для плавных изгибов вместо getSmoothStepPath
    const [path] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    const centerX = (sourceX + targetX) / 2;
    const centerY = (sourceY + targetY) / 2;

    // Цвета в зависимости от состояния
    const strokeColor = selected ? '#ef4444' : isHovered ? '#FFD54F' : '#FFC107';
    const strokeWidth = isHovered || selected ? 8 : 6;

    const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (data?.onDelete) {
        data.onDelete(id);
      }
    };

    return (
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

        {/* Видимый path линии */}
        <path
          d={path}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="react-flow__edge-path"
          style={{
            ...style,
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

        {/* Корзинка появляется только при выделении */}
        {selected && (
          <foreignObject
            x={centerX - 22}
            y={centerY - 22}
            width={44}
            height={44}
            style={{
              overflow: 'visible',
              zIndex: 1000,
              pointerEvents: 'all',
            }}
          >
            <div
              onClick={handleDelete}
              onMouseEnter={() => setIsHovered(false)}
              style={{
                width: 44,
                height: 44,
                background: '#ef4444',
                borderRadius: '50%',
                border: '3px solid #fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.5)',
                fontSize: '20px',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
              }}
              onMouseOver={e => {
                e.currentTarget.style.transform = 'scale(1.1)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.7)';
              }}
              onMouseOut={e => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.5)';
              }}
              title="Удалить связь"
            >
              🗑️
            </div>
          </foreignObject>
        )}
      </g>
    );
  }
);

CustomEdge.displayName = 'CustomEdge';

export default CustomEdge;
