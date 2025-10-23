import React, { useMemo, useCallback, useRef } from 'react';
import ReactFlow, {
  addEdge,
  Connection,
  MarkerType,
  NodeTypes,
  ReactFlowInstance,
  Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import CustomNode from './CustomNode';
import type { V2Node, V2Edge } from '@/types/editor';

type Props = {
  nodes: V2Node[];
  setNodes: (n: V2Node[]) => void;
  edges: V2Edge[];
  setEdges: (e: V2Edge[]) => void;
};

const Canvas: React.FC<Props> = ({ nodes, setNodes, edges, setEdges }) => {
  const flowRef = useRef<ReactFlowInstance | null>(null);

  const nodeTypes: NodeTypes = useMemo(
    () => ({
      default: CustomNode,
      start: CustomNode,
      message: CustomNode,
    }),
    []
  );

  const defaultEdgeOptions = useMemo(
    () => ({
      markerEnd: { type: MarkerType.ArrowClosed },
    }),
    []
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        ...params,
        id: `${params.source}-${params.target}`,
        source: params.source!,
        target: params.target!,
        markerEnd: { type: MarkerType.ArrowClosed },
      };
      setEdges(addEdge(newEdge, edges));
    },
    [setEdges, edges]
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        ref={flowRef as any}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView={false}
        style={{ width: '100%', height: '100%' }}
        onConnect={onConnect}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
};

export default Canvas;
