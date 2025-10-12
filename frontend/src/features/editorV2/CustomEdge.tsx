import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow } from 'reactflow';

export default function CustomEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, selected }: any) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const rf = useReactFlow();

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ stroke: selected ? '#f43f5e' : '#94a3b8', strokeWidth: 2 }} />
      <EdgeLabelRenderer>
        <button
          onClick={() => rf.setEdges((eds: any[]) => eds.filter((e) => e.id !== id))}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            background: selected ? '#ef4444' : '#1f2937',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '4px 6px',
            cursor: 'pointer',
            boxShadow: '0 3px 10px rgba(0,0,0,.25)'
          }}
        >
          🗑
        </button>
      </EdgeLabelRenderer>
    </>
  );
}























