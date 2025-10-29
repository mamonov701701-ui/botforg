import React from 'react';
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

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: selected ? '#FF4D4F' : '#FFC107',
          strokeWidth: selected ? 4 : 3,
          transition: 'all 0.2s ease',
          opacity: selected ? 1 : 0.8,
        }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <button
            onClick={() => rf.setEdges((eds: any[]) => eds.filter(e => e.id !== id))}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              background: '#ef4444',
              color: '#fff',
              border: '2px solid #fff',
              borderRadius: 8,
              padding: '6px 10px',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
              fontSize: '16px',
              fontWeight: 600,
              transition: 'all 0.2s ease',
            }}
            title="Удалить соединение"
            onMouseEnter={e => {
              e.currentTarget.style.transform = `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) scale(1.1)`;
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.6)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = `translate(-50%, -50%) translate(${labelX}px, ${labelY}px) scale(1)`;
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.4)';
            }}
          >
            🗑
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
