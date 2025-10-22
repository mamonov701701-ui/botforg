import React from 'react';
import { getBezierPath } from 'reactflow';

const ConnectionPreview = ({ connectionLine }) => {
  if (!connectionLine) return null;

  const [edgePath] = getBezierPath({
    sourceX: connectionLine.sourceX,
    sourceY: connectionLine.sourceY,
    sourcePosition: 'bottom',
    targetX: connectionLine.targetX,
    targetY: connectionLine.targetY,
    targetPosition: 'top',
  });

  return (
    <g>
      <path
        d={edgePath}
        stroke="#3b82f6"
        strokeWidth={2}
        strokeDasharray="5,5"
        fill="none"
        opacity={0.7}
        pointerEvents="none"
      />
      <circle
        cx={connectionLine.targetX}
        cy={connectionLine.targetY}
        r={4}
        fill="#3b82f6"
        opacity={0.7}
        pointerEvents="none"
      />
    </g>
  );
};

export default ConnectionPreview;

