import React, { useCallback, useState, useMemo, useEffect } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  addEdge,
  ConnectionMode,
  MarkerType,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Connection,
  Edge,
  Node,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';

import NodeCard from '@/editor/nodes/NodeCard';
import AmberEdge from '@/editor/edges/AmberEdge';
import { BRAND_AMBER } from '@/ui/tokens';
import './Editor.css';

// Кастомный компонент для линии соединения
const CustomConnectionLine = ({ fromX, fromY, toX, toY, connectionLineStyle }: any) => (
  <g>
    <path
      fill="none"
      stroke={BRAND_AMBER}
      strokeWidth={3}
      className="animated"
      d={`M${fromX},${fromY} C ${fromX + 50},${fromY} ${toX - 50},${toY} ${toX},${toY}`}
      style={connectionLineStyle}
    />
    <circle
      cx={toX}
      cy={toY}
      fill={BRAND_AMBER}
      r={4}
      className="animated"
    />
  </g>
);

// Основной компонент редактора
function EditorFlow() {
  const [nodes, setNodes, onNodesChange] = useNodesState([
    {
      id: 'start',
      type: 'default',
      position: { x: 250, y: 50 }, // Ближе к верху и центру
      data: { 
        type: 'start', 
        label: 'Начало', 
        subtitle: 'Точка входа сценария' 
      },
    },
  ]);
  
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const { fitView } = useReactFlow();

  // Типы узлов и рёбер
  const nodeTypes = useMemo(() => ({ default: NodeCard }), []);
  const edgeTypes = useMemo(() => ({ amber: AmberEdge }), []);

  // Автоматическая подгонка вида при монтировании
  useEffect(() => {
    const timer = setTimeout(() => {
      fitView({ padding: 0.1, duration: 800 });
    }, 100);
    return () => clearTimeout(timer);
  }, [fitView]);

  // Удаление ребра
  const onDeleteEdge = useCallback(
    (id: string) => setEdges((eds) => eds.filter((e) => e.id !== id)),
    [setEdges]
  );

  // Создание соединения
  const onConnect = useCallback(
    (params: Edge | Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'amber',
            animated: true,
            data: { onDelete: onDeleteEdge },
            style: { stroke: BRAND_AMBER, strokeWidth: 3 },
            markerEnd: { type: MarkerType.ArrowClosed, color: BRAND_AMBER },
          },
          eds
        )
      ),
    [setEdges, onDeleteEdge]
  );

  // Добавление нового узла
  const handleAddNode = useCallback(() => {
    const nodeCount = nodes.length;
    const angle = (nodeCount * 2 * Math.PI) / 8; // Распределяем по кругу
    const radius = 150;
    const centerX = 400; // Центр экрана
    const centerY = 200; // Ближе к верху
    
    setNodes((nds) => [
      ...nds,
      {
        id: crypto.randomUUID(),
        type: 'default',
        position: { 
          x: centerX + Math.cos(angle) * radius, 
          y: centerY + Math.sin(angle) * radius 
        },
        data: { 
          type: 'message', 
          label: `Блок ${nds.length + 1}`, 
          subtitle: 'Новый блок' 
        },
      },
    ]);
  }, [setNodes, nodes.length]);

  // Обработчики для отслеживания состояния соединения
  const onConnectStart = useCallback(() => {
    setIsConnecting(true);
  }, []);

  const onConnectEnd = useCallback(() => {
    setIsConnecting(false);
  }, []);

  // Обработчики для рёбер
  const onEdgeMouseEnter = useCallback((event: React.MouseEvent, edge: Edge) => {
    setHoveredEdge(edge.id);
  }, []);

  const onEdgeMouseLeave = useCallback(() => {
    setHoveredEdge(null);
  }, []);

  const onEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    onDeleteEdge(edge.id);
  }, [onDeleteEdge]);

  return (
    <div className="editor-container">
      {/* Кнопка добавления блока в правом верхнем углу */}
      <button 
        className="add-node-btn"
        onClick={handleAddNode}
        title="Добавить новый блок"
      >
        ➕ Добавить блок
      </button>

      <ReactFlow
        className={`editor-flow ${isConnecting ? 'connecting' : ''}`}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onEdgeMouseEnter={onEdgeMouseEnter}
        onEdgeMouseLeave={onEdgeMouseLeave}
        onEdgeClick={onEdgeClick}
        
        // Интерактивность
        nodesDraggable={true}
        nodesConnectable={true}
        elementsSelectable={true}
        panOnDrag={true}
        panOnScroll={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        zoomActivationKeyCode={undefined} // Зум колесом мыши без модификаторов
        
        // Настройки зума - убираем огромный zoom
        minZoom={0.3}
        maxZoom={2}
        defaultZoom={1}
        
        // Режим соединения
        connectionMode={ConnectionMode.Loose}
        connectOnClick={true}
        
        // Настройки рёбер по умолчанию
        defaultEdgeOptions={{
          type: 'amber',
          animated: true,
          style: { stroke: BRAND_AMBER, strokeWidth: 3 },
          markerEnd: { type: MarkerType.ArrowClosed, color: BRAND_AMBER },
        }}
        
        // Кастомная линия соединения
        connectionLineComponent={CustomConnectionLine}
        connectionLineStyle={{ stroke: BRAND_AMBER, strokeWidth: 3 }}
        
        // Автоматическая подгонка при загрузке
        fitView={true}
        fitViewOptions={{ padding: 0.1, duration: 800 }}
        
        // Скрываем атрибуцию
        proOptions={{ hideAttribution: true }}
        
        // Стили
        style={{ width: '100%', height: '100%' }}
      >
        {/* Фон с сеткой */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.5}
          color="rgba(255, 255, 255, 0.2)"
          style={{ backgroundColor: '#0A1B3D' }}
        />
        
        {/* Элементы управления */}
        <Controls 
          position="bottom-left"
          showZoom={true}
          showFitView={true}
          showInteractive={true}
        />
        
        {/* Мини-карта */}
        <MiniMap
          position="bottom-right"
          nodeColor={(node: Node) => {
            const type = node.data?.type || 'default';
            const colors = {
              start: '#4A90E2',
              message: '#3498DB',
              action: '#2ECC71',
              condition: '#9B59B6',
              api: '#00BCD4',
              end: '#FF3B30',
              default: BRAND_AMBER,
            };
            return colors[type as keyof typeof colors] || BRAND_AMBER;
          }}
          nodeStrokeWidth={3}
          nodeBorderRadius={8}
          maskColor="rgba(0, 0, 0, 0.1)"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
          }}
        />
      </ReactFlow>
    </div>
  );
}

// Главный компонент с провайдером
export default function Editor() {
  return (
    <ReactFlowProvider>
      <EditorFlow />
    </ReactFlowProvider>
  );
}