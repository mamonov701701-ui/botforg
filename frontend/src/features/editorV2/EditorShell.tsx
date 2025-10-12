import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import '@/styles/flow.css';
import Canvas from './Canvas';

export type V2Node = {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: { label: string };
};

export type V2Edge = {
  id: string;
  source: string;
  target: string;
  markerEnd?: any;
};

const EditorShell: React.FC = () => {
  const { id } = useParams();
  const [nodes, setNodes] = useState<V2Node[]>([{
    id: 'start-1',
    type: 'start',
    position: { x: 50, y: 50 },
    data: { label: 'Начало' },
  }]);
  const [edges, setEdges] = useState<V2Edge[]>([]);

  const editorId = useMemo(() => id ?? '1', [id]);

  return (
    <div className="h-screen w-screen bg-gray-50">
      <Canvas nodes={nodes} setNodes={setNodes} edges={edges} setEdges={setEdges} />
    </div>
  );
};

export default EditorShell;























