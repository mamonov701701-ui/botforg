import React, { useMemo, useState, useCallback, useRef } from 'react';
import ReactFlow, { addEdge, Connection, MarkerType, NodeTypes, ReactFlowInstance } from 'reactflow';
import 'reactflow/dist/style.css';
import CustomNode from './CustomNode';
import type { V2Node, V2Edge } from './EditorShell';

type Props = {
  nodes: V2Node[];
  setNodes: (n: V2Node[]) => void;
  edges: V2Edge[];
  setEdges: (e: V2Edge[]) => void;
};

const Canvas: React.FC<Props> = ({ nodes, setNodes, edges, setEdges }) => {
  const flowRef = useRef<ReactFlowInstance | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 0.25 });

  const nodeTypes: NodeTypes = useMemo(() => ({
    default: CustomNode,
    start: CustomNode,
    message: CustomNode,
  }), []);

  const defaultEdgeOptions = useMemo(() => ({
    markerEnd: { type: MarkerType.ArrowClosed },
  }), []);

  const onConnect = useCallback((params: Connection) => {
    setEdges((prev) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } } as any, prev as any) as any);
  }, [setEdges]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        ref={flowRef as any}
        nodes={nodes as any}
        edges={edges as any}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions as any}
        viewport={viewport as any}
        onMoveEnd={(_, vp) => setViewport(vp)}
        fitView={false}
        style={{ width: '100%', height: '100%' }}
        onConnect={onConnect}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
};

export default Canvas;































