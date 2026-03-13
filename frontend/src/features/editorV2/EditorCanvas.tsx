import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
  Connection,
  Edge,
  Node,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

type Snapshot = {
  nodes: Node[];
  edges: Edge[];
};

const MAX_HISTORY = 50;

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

const EditorCanvasInner: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  const historyRef = useRef<Snapshot[]>([]);
  const historyIndexRef = useRef(-1);
  const isApplyingHistoryRef = useRef(false);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const pushHistory = useCallback((snapshot: Snapshot) => {
    if (isApplyingHistoryRef.current) return;

    const history = historyRef.current.slice(0, historyIndexRef.current + 1);
    history.push(snapshot);
    if (history.length > MAX_HISTORY) {
      history.shift();
    }
    historyRef.current = history;
    historyIndexRef.current = history.length - 1;

    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(false);
  }, []);

  useEffect(() => {
    pushHistory({ nodes, edges });
  }, [nodes, edges, pushHistory]);

  const handleUndo = useCallback(() => {
    const history = historyRef.current;
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const snapshot = history[historyIndexRef.current];
    if (!snapshot) return;

    isApplyingHistoryRef.current = true;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    isApplyingHistoryRef.current = false;

    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < history.length - 1);
  }, [setNodes, setEdges]);

  const handleRedo = useCallback(() => {
    const history = historyRef.current;
    if (historyIndexRef.current >= history.length - 1) return;
    historyIndexRef.current += 1;
    const snapshot = history[historyIndexRef.current];
    if (!snapshot) return;

    isApplyingHistoryRef.current = true;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    isApplyingHistoryRef.current = false;

    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < history.length - 1);
  }, [setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges(eds => addEdge(connection, eds));
    },
    [setEdges]
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
      if (!ctrlOrCmd) return;

      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleUndo, handleRedo]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 10,
          display: 'flex',
          gap: 6,
        }}
      >
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          style={{
            padding: '4px 8px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid #4b5563',
            background: canUndo ? '#111827' : '#020617',
            color: canUndo ? '#e5e7eb' : '#6b7280',
            cursor: canUndo ? 'pointer' : 'default',
          }}
        >
          Ctrl+Z
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          style={{
            padding: '4px 8px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid #4b5563',
            background: canRedo ? '#111827' : '#020617',
            color: canRedo ? '#e5e7eb' : '#6b7280',
            cursor: canRedo ? 'pointer' : 'default',
          }}
        >
          Ctrl+Shift+Z
        </button>
        <button
          onClick={() => zoomIn()}
          style={{
            padding: '4px 8px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid #4b5563',
            background: '#020617',
            color: '#e5e7eb',
            cursor: 'pointer',
          }}
        >
          +
        </button>
        <button
          onClick={() => zoomOut()}
          style={{
            padding: '4px 8px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid #4b5563',
            background: '#020617',
            color: '#e5e7eb',
            cursor: 'pointer',
          }}
        >
          −
        </button>
        <button
          onClick={() => fitView({ padding: 0.2 })}
          style={{
            padding: '4px 8px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid #4b5563',
            background: '#020617',
            color: '#e5e7eb',
            cursor: 'pointer',
          }}
        >
          Fit
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={18}
          size={2}
          color="rgba(148, 163, 184, 0.4)"
        />
        <Controls />
        <MiniMap
          position="bottom-right"
          style={{
            background: 'rgba(15, 23, 42, 0.9)',
            borderRadius: 8,
            border: '1px solid #1f2937',
          }}
        />
      </ReactFlow>
    </div>
  );
};

export default function EditorCanvas() {
  return (
    <ReactFlowProvider>
      <EditorCanvasInner />
    </ReactFlowProvider>
  );
}
