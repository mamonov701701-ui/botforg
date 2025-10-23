/**
 * Preview Panel component stub
 */

import React from 'react';

interface PreviewPanelProps {
  nodes: any[];
  edges: any[];
}

export default function PreviewPanel({ nodes, edges }: PreviewPanelProps) {
  return (
    <div className="preview-panel">
      <h3>Preview</h3>
      <p>Nodes: {nodes.length}</p>
      <p>Edges: {edges.length}</p>
    </div>
  );
}
