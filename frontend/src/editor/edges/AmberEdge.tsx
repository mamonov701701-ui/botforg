import { memo, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, EdgeProps } from 'reactflow';
import type { BaseEdgeData } from '@/types/editor';

// Кастомное янтарное ребро: hover-подсветка + кнопка удаления
export default memo(function AmberEdge(props: EdgeProps<BaseEdgeData>) {
  const [edgePath, labelX, labelY] = getBezierPath(props);
  const [hover, setHover] = useState(false);

  const stroke = hover ? '#FFC64A' : (props.style?.stroke || '#FFB300');

  return (
    <>
      <BaseEdge
        id={props.id}
        path={edgePath}
        style={{ ...props.style, stroke, strokeWidth: 3 }}
        markerEnd={props.markerEnd}
      />
      <EdgeLabelRenderer>
        <button
          onClick={() => props.data?.onDelete?.(props.id)}
          style={{
            position: 'absolute',
            transform: 'translate(-50%, -50%)',
            left: labelX,
            top: labelY,
            background: hover ? '#FF3B30' : '#fff',
            color: hover ? '#fff' : '#111',
            border: `2px solid ${hover ? '#FF3B30' : '#FFB300'}`,
            borderRadius: 8,
            padding: '2px 6px',
            fontSize: 12,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,.25)',
            pointerEvents: 'all',
          }}
          title="Удалить связь"
        >
          ×
        </button>
      </EdgeLabelRenderer>
    </>
  );
});































