import React, { useEffect, useMemo, useState, useCallback } from 'react';
import ReactFlow, { Node, Edge, addEdge, Connection, MarkerType, Viewport, useReactFlow, ReactFlowProvider, Background, BackgroundVariant } from 'reactflow';
import 'reactflow/dist/style.css';
import './flow.css';
import NodePanel from './NodePanel';
import { NODE_SPECS } from './constants';
import Toolbar from './Toolbar';
import SettingsPanel from './SettingsPanel';
import CustomEdge from './CustomEdge';

function CustomNode({ data }: any) {
  const label = data?.label ?? 'Блок';
  return (
    <div style={{
      background: '#fff',
      border: '2px solid #2f6dff',
      borderRadius: 16,
      padding: 12,
      minWidth: 220,
    }}>
      <div style={{ fontWeight: 800 }}>{label}</div>
      {data?.subtitle && <div style={{ opacity: 0.7 }}>{data.subtitle}</div>}
    </div>
  );
}

export default function EditorV2Shell() {
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <InnerEditor />
      </ReactFlowProvider>
    </div>
  );
}

function InnerEditor() {
  // banner removed to avoid conflict with site header

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 0.25 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | undefined>(undefined);
  const rf = useReactFlow();

  useEffect(() => {
    setNodes([{
      id: 'start-1',
      type: 'start',
      position: { x: 50, y: 50 },
      data: { label: 'Начало', subtitle: 'Точка входа сценария' },
    }]);
    setEdges([]);
  }, []);

  const nodeTypes = useMemo(() => ({
    default: CustomNode,
    start: CustomNode,
    message: CustomNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    deletable: CustomEdge,
  }), []);

  const defaultEdgeOptions = useMemo(() => ({
    markerEnd: { type: MarkerType.ArrowClosed as const },
  }), []);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge(
      { ...params, type: 'deletable', markerEnd: { type: MarkerType.ArrowClosed } } as any,
      eds as any
    ) as any);
  }, []);

  const handlePanelDragStart = useCallback((e: React.DragEvent, type: string) => {
    e.dataTransfer.setData('application/reactflow', type);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/reactflow');
    if (!type) return;
    const bounds = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const pos = rf.project({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
    const spec = NODE_SPECS.find(s => s.type === type);
    setNodes((ns) => ns.concat({
      id: `n_${Date.now()}`,
      type,
      position: pos,
      data: { label: spec?.title ?? type, borderColor: spec?.borderColor },
    } as any));
  }, [rf, setNodes]);

  const onNodeClick = useCallback((_: any, n: any) => {
    setSelectedNodeId(n.id);
    setSelectedEdgeId(undefined);
  }, []);

  const onEdgeClick = useCallback((_: any, e: any) => {
    setSelectedEdgeId(e.id);
    setSelectedNodeId(undefined);
  }, []);

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId), [nodes, selectedNodeId]);

  const handleNodeChange = useCallback((p: { label?: string; type?: string; json?: string }) => {
    if (!selectedNodeId) return;
    setNodes(ns => ns.map(n => n.id === selectedNodeId ? {
      ...n,
      type: p.type ?? n.type,
      data: { ...n.data, label: p.label ?? n.data?.label, json: p.json ?? (n.data as any)?.json },
    } : n));
  }, [selectedNodeId]);

  const handleSaveNode = useCallback(() => {
    // no-op: placeholder for persistence
  }, []);

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    setEdges(es => es.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setNodes(ns => ns.filter(n => n.id !== selectedNodeId));
    setSelectedNodeId(undefined);
  }, [selectedNodeId]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 360px', height: '100%' }}>
      <aside style={{ padding: 16, borderRight: '1px solid #1f2937' }}>
        <Toolbar
          onAddBlock={() => setNodes(ns => ns.concat({ id: `n_${Date.now()}`, type: 'message', position: { x: 200, y: 200 }, data: { label: 'Новый блок' } } as any))}
          onSave={() => { /* placeholder */ }}
          onExport={() => {
            const data = JSON.stringify({ nodes, edges }, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'flow.json';
            a.click();
            URL.revokeObjectURL(a.href);
          }}
          onImport={() => { /* placeholder */ }}
          onError={() => { /* placeholder */ }}
        />
      </aside>
      <main onDragOver={onDragOver} onDrop={onDrop} style={{ height: '100%', background: 'transparent' }}>
        <ReactFlow
          nodes={nodes as any}
          edges={edges as any}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes as any}
          defaultEdgeOptions={defaultEdgeOptions as any}
          viewport={viewport as any}
          onMoveEnd={(_, vp) => setViewport(vp)}
          fitView={false}
          proOptions={{ hideAttribution: true }}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="rgba(255,255,255,0.08)" />
        </ReactFlow>
      </main>
      <aside style={{ borderLeft: '1px solid #1f2937' }}>
        <SettingsPanel
          selectedId={selectedNode?.id}
          type={selectedNode ? (selectedNode.type as string) : ''}
          label={selectedNode ? (selectedNode.data as any)?.label : ''}
          json={selectedNode ? (selectedNode.data as any)?.json : ''}
          onChange={handleNodeChange}
          onSave={handleSaveNode}
          onDelete={handleDeleteNode}
        />
      </aside>
    </div>
  );
}


