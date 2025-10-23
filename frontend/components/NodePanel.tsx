/**
 * Node Panel component stub
 */

import React from 'react';

interface NodePanelProps {
  onAddNode?: (type: string) => void;
}

export default function NodePanel({ onAddNode }: NodePanelProps) {
  const nodeTypes = ['start', 'message', 'button', 'input', 'condition', 'api', 'payment'];

  return (
    <div className="node-panel">
      <h3>Node Types</h3>
      {nodeTypes.map(type => (
        <button key={type} onClick={() => onAddNode?.(type)} className="node-type-button">
          {type}
        </button>
      ))}
    </div>
  );
}
