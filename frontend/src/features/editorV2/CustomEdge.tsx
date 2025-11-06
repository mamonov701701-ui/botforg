import React from 'react';
import { getSmoothStepPath, EdgeProps } from 'reactflow';

// Точная копия рабочего CustomEdge.jsx
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
    const [path] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });

    const centerX = (sourceX + targetX) / 2;
    const centerY = (sourceY + targetY) / 2;

    const strokeColor = '#FFC107';
    const strokeWidth = 6;

    const handleDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (data?.onDelete) {
        data.onDelete(id);
      }
    };

    return (
      <g style={{ pointerEvents: 'auto' }}>
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
            filter: selected ? 'drop-shadow(0 0 6px rgba(255, 0, 0, 0.4))' : 'none',
            pointerEvents: 'auto',
          }}
        />

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
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                fontSize: '20px',
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
