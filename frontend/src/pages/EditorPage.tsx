import React from 'react';
import { ReactFlowProvider } from 'reactflow';
import Editor from './Editor';

export default function EditorPage() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
