/**
 * Node Settings component stub
 */

import React from 'react';

interface NodeSettingsProps {
  node: any;
  onUpdate: (id: string, data: any) => void;
}

export default function NodeSettings({ node, onUpdate }: NodeSettingsProps) {
  if (!node) return null;

  return (
    <div className="node-settings">
      <h3>Node Settings</h3>
      <div>
        <label>Label:</label>
        <input
          value={node.data?.label || ''}
          onChange={e => onUpdate(node.id, { ...node.data, label: e.target.value })}
        />
      </div>
    </div>
  );
}
