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
          strokeWidth: 2,
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
              border: 'none',
              borderRadius: 6,
              padding: '4px 6px',
              cursor: 'pointer',
              boxShadow: '0 3px 10px rgba(0,0,0,.25)',
              fontSize: '14px',
            }}
          >
            🗑
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
