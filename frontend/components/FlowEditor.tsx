import React, { useMemo, useCallback, useRef } from 'react';
import ReactFlow, {
  addEdge,
  Connection,
  MarkerType,
  NodeTypes,
  ReactFlowInstance,
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  Edge,
  NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { FlowNode, FlowEdge, BaseNodeData } from '@/types/editor';

interface FlowEditorProps {
  nodes: FlowNode[];
  setNodes: (nodes: FlowNode[]) => void;
  edges: FlowEdge[];
  setEdges: (edges: FlowEdge[]) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  errorNodeIds: string[];
  errorEdgeIds: string[];
}

// Кастомный узел
function CustomNode({ data, selected }: NodeProps<BaseNodeData>) {
  const label = data?.label ?? 'Блок';
  const isError = data?.isError;

  return (
    <div
      style={{
        background: '#fff',
        border: isError ? '2px solid #ef4444' : '2px solid #2f6dff',
        borderRadius: 16,
        padding: 12,
        minWidth: 220,
        boxShadow: selected ? '0 0 0 2px #2f6dff' : 'none',
      }}
    >
      <div style={{ fontWeight: 800 }}>{label}</div>
      {data?.subtitle && <div style={{ opacity: 0.7 }}>{data.subtitle}</div>}
    </div>
  );
}

// Основной компонент FlowEditor
function FlowEditorInner({
  nodes,
  setNodes,
  edges,
  setEdges,
  selectedNodeId,
  setSelectedNodeId,
  errorNodeIds,
  errorEdgeIds,
}: FlowEditorProps) {
  const flowRef = useRef<ReactFlowInstance | null>(null);

  // Добавляем информацию об ошибках к узлам
  const nodesWithErrors = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        isError: errorNodeIds.includes(node.id),
      },
    }));
  }, [nodes, errorNodeIds]);

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
      style: { stroke: '#2f6dff', strokeWidth: 2 },
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
        style: { stroke: '#2f6dff', strokeWidth: 2 },
      };
      setEdges(addEdge(newEdge, edges));
    },
    [setEdges, edges]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: any) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        ref={flowRef as any}
        nodes={nodesWithErrors}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView={false}
        style={{ width: '100%', height: '100%' }}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        panOnDrag={true}
        panOnScroll={true}
        zoomOnScroll={true}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(255, 255, 255, 0.2)"
        />
      </ReactFlow>
    </div>
  );
}

// Главный компонент с провайдером
export default function FlowEditor(props: FlowEditorProps) {
  return (
    <ReactFlowProvider>
      <FlowEditorInner {...props} />
    </ReactFlowProvider>
  );
}
