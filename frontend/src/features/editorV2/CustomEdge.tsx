import React, { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow } from 'reactflow';

export default function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  selected,
}: any) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const rf = useReactFlow();
  const [isHovered, setIsHovered] = useState(false);

  // Янтарный цвет бренда
  const amberColor = '#FFC107';
  const redColor = '#ef4444';
  const hoverGlow = '#FFD54F'; // Светло-янтарный для hover

  // Определяем цвет и ширину линии
  const strokeColor = selected ? redColor : isHovered ? hoverGlow : amberColor;
  const strokeWidth = selected ? 8 : isHovered ? 7 : 6;

  // Определяем правильный маркер стрелки
  const arrowMarker = selected 
    ? 'url(#arrow-marker-red)' 
    : isHovered 
    ? 'url(#arrow-marker-hover)' 
    : 'url(#arrow-marker-amber)';

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={arrowMarker}
        style={{
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          transition: 'all 0.2s ease',
          filter: isHovered ? 'drop-shadow(0 0 8px rgba(255, 193, 7, 0.6))' : 'none',
          cursor: 'pointer',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      {/* Невидимый широкий path для лучшего hover detection */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      {selected && (
        <EdgeLabelRenderer>
          <button
            onClick={(e) => {
              e.stopPropagation();
              rf.setEdges((eds: any[]) => eds.filter(e => e.id !== id));
            }}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              background: redColor,
              color: '#fff',
              border: '3px solid #fff',
              borderRadius: 12,
              padding: '8px 12px',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(239, 68, 68, 0.5)',
              fontSize: '20px',
              fontWeight: 600,
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
            }}
            title="Удалить соединение"
            onMouseEnter={e => {
              e.currentTarget.style.transform = `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) scale(1.15)`;
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(239, 68, 68, 0.7)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) scale(1)`;
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(239, 68, 68, 0.5)';
            }}
          >
            🗑️
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
