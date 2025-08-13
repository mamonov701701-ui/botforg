import React, { useCallback, useRef, useState, useEffect } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  Node,
  Edge,
  ReactFlowInstance,
  addEdge,
  Connection,
  EdgeTypes,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { NodeType, FlowNode, FlowEdge, NodeData } from '@/types/flow';
import { useHotkeys } from 'react-hotkeys-hook';

const MAX_HISTORY = 30;

interface FlowEditorProps {
  nodes: FlowNode[];
  setNodes: (nodes: FlowNode[]) => void;
  edges: FlowEdge[];
  setEdges: (edges: FlowEdge[]) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  errorNodeIds?: string[];
  errorEdgeIds?: string[];
}

const nodeTypeLabel: Record<NodeType, string> = {
  message: 'Сообщение',
  button: 'Кнопки',
  input: 'Ввод текста',
  condition: 'Условие',
  api: 'API-запрос',
};

const CustomEdge = ({ id, sourceX, sourceY, targetX, targetY, markerEnd, data, selected }: any) => {
  const edgePath = `M${sourceX},${sourceY}L${targetX},${targetY}`;
  return (
    <g>
      <path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        stroke={selected ? '#2563eb' : '#888'}
        strokeWidth={2}
        markerEnd={markerEnd}
        fill="none"
        style={{ cursor: 'pointer' }}
      />
      {data?.label && (
        <text>
          <textPath
            href={`#${id}`}
            startOffset="50%"
            textAnchor="middle"
            style={{ fontSize: 12, fill: selected ? '#2563eb' : '#555' }}
          >
            {data.label}
          </textPath>
        </text>
      )}
    </g>
  );
};

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

const FlowEditor: React.FC<FlowEditorProps> = ({ nodes, setNodes, edges, setEdges, selectedNodeId, setSelectedNodeId, errorNodeIds = [], errorEdgeIds = [] }) => {
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [history, setHistory] = useState<{nodes: FlowNode[], edges: FlowEdge[]}[]>([{ nodes, edges }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const flowRef = useRef<ReactFlowInstance | null>(null);

  // История изменений
  const pushHistory = (newNodes: FlowNode[], newEdges: FlowEdge[]) => {
    const newHist = [...history.slice(0, historyIndex + 1), { nodes: newNodes, edges: newEdges }];
    if (newHist.length > MAX_HISTORY) newHist.shift();
    setHistory(newHist);
    setHistoryIndex(newHist.length - 1);
  };

  // Синхронизация с внешним состоянием
  useEffect(() => {
    setHistory([{ nodes, edges }]);
    setHistoryIndex(0);
    // eslint-disable-next-line
  }, []);

  // Обновление nodes/edges с историей
  const updateNodes = (newNodes: FlowNode[]) => {
    setNodes(newNodes);
    pushHistory(newNodes, edges);
  };
  const updateEdges = (newEdges: FlowEdge[]) => {
    setEdges(newEdges);
    pushHistory(nodes, newEdges);
  };

  // Undo/Redo
  const handleUndo = () => {
    if (historyIndex > 0) {
      setNodes(history[historyIndex - 1].nodes);
      setEdges(history[historyIndex - 1].edges);
      setHistoryIndex(historyIndex - 1);
    }
  };
  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setNodes(history[historyIndex + 1].nodes);
      setEdges(history[historyIndex + 1].edges);
      setHistoryIndex(historyIndex + 1);
    }
  };

  useHotkeys('ctrl+z', handleUndo, [handleUndo, historyIndex, history]);
  useHotkeys('ctrl+y', handleRedo, [handleRedo, historyIndex, history]);

  // Drag&Drop
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/reactflow') as NodeType;
    if (!type) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = flowRef.current?.project({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    }) || { x: 100, y: 100 };
    const id = `${type}_${Date.now()}`;
    const newNode: FlowNode = {
      id,
      type,
      position,
      data: { type, label: 'Новый блок' },
    };
    updateNodes([...nodes, newNode]);
    setSelectedNodeId(id);
    setTimeout(() => {
      const nodeEl = document.querySelector(`[data-id='${id}']`);
      if (nodeEl) nodeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  }, [nodes, updateNodes, setSelectedNodeId]);

  // Выделение блока
  const onNodeClick = useCallback((_: any, node: Node<NodeData>) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, [setSelectedNodeId]);

  // Создание связи
  const onConnect = useCallback((params: Connection) => {
    const id = `e_${params.source}_${params.target}_${Date.now()}`;
    updateEdges([
      ...edges,
      {
        id,
        source: params.source!,
        target: params.target!,
        type: 'custom',
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
        data: {},
      },
    ]);
    setSelectedEdgeId(id);
    setSelectedNodeId(null);
  }, [edges, updateEdges, setSelectedEdgeId, setSelectedNodeId]);

  // Выделение связи
  const onEdgeClick = useCallback((_: any, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);

  // Удаление связи
  const handleDeleteEdge = () => {
    if (selectedEdgeId) {
      updateEdges(edges.filter(e => e.id !== selectedEdgeId));
      setSelectedEdgeId(null);
    }
  };

  // Редактирование label связи
  const handleUpdateEdgeLabel = (id: string, label: string) => {
    updateEdges(
      edges.map(e =>
        e.id === id ? { ...e, data: { ...e.data, label } } : e
      )
    );
  };

  // Удаление блока
  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    if (!window.confirm('Удалить блок и все связи?')) return;
    updateNodes(nodes.filter(n => n.id !== selectedNodeId));
    updateEdges(edges.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [selectedNodeId, nodes, edges, updateNodes, updateEdges]);

  // Дублирование блока
  const handleDuplicateNode = useCallback(() => {
    if (!selectedNodeId) return;
    const orig = nodes.find(n => n.id === selectedNodeId);
    if (!orig) return;
    const newId = `${orig.type}_${Date.now()}`;
    const newNode = {
      ...orig,
      id: newId,
      position: { x: orig.position.x + 40, y: orig.position.y + 40 },
      data: { ...orig.data, label: orig.data.label + ' (копия)' },
    };
    updateNodes([...nodes, newNode]);
    setSelectedNodeId(newId);
  }, [selectedNodeId, nodes, updateNodes, setSelectedNodeId]);

  // Горячие клавиши
  useHotkeys('delete', handleDeleteNode, [handleDeleteNode]);
  useHotkeys('ctrl+d', handleDuplicateNode, [handleDuplicateNode]);
  useHotkeys('esc', () => { setSelectedNodeId(null); setSelectedEdgeId(null); }, [setSelectedNodeId, setSelectedEdgeId]);

  return (
    <div className="w-full h-full bg-gray-50 rounded border relative" onDrop={onDrop} onDragOver={onDragOver}>
      {/* Undo/Redo buttons */}
      <div className="absolute top-2 right-2 z-30 flex gap-2">
        <button
          className="bg-gray-200 px-2 py-1 rounded text-xs"
          onClick={handleUndo}
          disabled={historyIndex === 0}
          title="Назад (Ctrl+Z)"
        >↩ Назад</button>
        <button
          className="bg-gray-200 px-2 py-1 rounded text-xs"
          onClick={handleRedo}
          disabled={historyIndex === history.length - 1}
          title="Вперёд (Ctrl+Y)"
        >Вперёд ↪</button>
      </div>
      <ReactFlow
        ref={flowRef as any}
        nodes={nodes.map((n) => ({ ...n, className: [n.id === selectedNodeId ? 'ring-2 ring-blue-500' : '', errorNodeIds.includes(n.id) ? 'ring-2 ring-red-500' : ''].join(' ') }))}
        edges={edges.map((e) => ({ ...e, type: 'custom', selected: e.id === selectedEdgeId, style: errorEdgeIds.includes(e.id) ? { stroke: '#dc2626', strokeWidth: 3 } : {} }))}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onConnect={onConnect}
        fitView
        style={{ width: '100%', height: '100%' }}
      >
        <MiniMap />
        <Controls />
        <Background />
      </ReactFlow>
      {!nodes.length && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-400 text-lg">
          Здесь будет канва редактора
        </div>
      )}
      {/* Edge settings popup */}
      {selectedEdgeId && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-20 bg-white border rounded shadow-lg p-4 flex gap-2 items-center">
          <input
            type="text"
            value={edges.find(e => e.id === selectedEdgeId)?.data?.label || ''}
            onChange={e => handleUpdateEdgeLabel(selectedEdgeId, e.target.value)}
            className="border rounded px-2 py-1 text-sm"
            placeholder="Подпись перехода"
          />
          <button
            className="bg-red-600 text-white px-3 py-1 rounded text-xs"
            onClick={handleDeleteEdge}
          >Удалить связь</button>
        </div>
      )}
      {selectedNodeId && (
        <button
          className="absolute top-2 left-2 bg-red-600 text-white px-3 py-1 rounded text-xs z-20"
          onClick={handleDeleteNode}
        >Удалить блок</button>
      )}
      {selectedNodeId && (
        <button
          className="absolute top-12 left-2 bg-blue-600 text-white px-3 py-1 rounded text-xs z-20"
          onClick={handleDuplicateNode}
        >Дублировать блок</button>
      )}
    </div>
  );
};

export default FlowEditor; 