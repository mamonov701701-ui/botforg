import React, { useCallback, useState, useMemo, useEffect } from 'react';
import ReactFlow, {
  ReactFlowProvider,
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
  Handle,
  Position,
} from 'reactflow';
import { nanoid } from 'nanoid';
import 'reactflow/dist/style.css';
import './flow.css';
import BlockLibrary from './BlockLibrary';
import EditorControls from './EditorControls';
import Toolbar from './Toolbar';
import BlockSettingsPanel from './BlockSettingsPanel';
import CustomEdge from './CustomEdge';
import ToastContainer from './ToastContainer';
import { useEditorStore } from '../../stores/editorStore';
import { BlockCatalogItem } from '../../types/blocks';
import { validateAllNodes, debugNodeStructure } from '../../utils/validateNode';
import { canAccessBlock, getAccessDeniedMessage, logAccessDenied } from '../../utils/accessControl';
import { useValidationStore } from '../../stores/validationStore';
import { validateAllNodesWithSchema, hasValidationErrors } from '../../utils/schemaValidation';
import ValidationModal from './ValidationModal';
import ExportConfirmModal from './ExportConfirmModal';

function CustomNode({ data, id }: any) {
  const title = data?.title ?? 'Блок';
  const isStartNode = data?.blockId === 'start';
  const borderColor = data?.color || '#2f6dff';
  
  // Get validation status
  const validation = useValidationStore(state => state.getNodeValidation(id));
  const isInvalid = validation && !validation.isValid;
  
  return (
    <div style={{
      background: '#fff',
      border: `4px solid ${isInvalid ? '#ef4444' : borderColor}`,
      borderRadius: 32,
      padding: 24,
      minWidth: 264,
      color: '#000',
      position: 'relative',
    }}>
      {/* Для стартового блока - только 2 Handle (сверху и снизу) */}
      {isStartNode ? (
        <>
          <Handle type="target" position={Position.Top} style={{ background: borderColor, width: 16, height: 16 }} />
          <Handle type="source" position={Position.Bottom} style={{ background: borderColor, width: 16, height: 16 }} />
        </>
      ) : (
        /* Для остальных блоков - 4 Handle (со всех сторон) - все универсальные */
        <>
          <Handle id="top" type="target" position={Position.Top} style={{ background: borderColor, width: 16, height: 16 }} />
          <Handle id="top-source" type="source" position={Position.Top} style={{ background: borderColor, width: 16, height: 16 }} />
          
          <Handle id="right" type="target" position={Position.Right} style={{ background: borderColor, width: 16, height: 16 }} />
          <Handle id="right-source" type="source" position={Position.Right} style={{ background: borderColor, width: 16, height: 16 }} />
          
          <Handle id="bottom" type="target" position={Position.Bottom} style={{ background: borderColor, width: 16, height: 16 }} />
          <Handle id="bottom-source" type="source" position={Position.Bottom} style={{ background: borderColor, width: 16, height: 16 }} />
          
          <Handle id="left" type="target" position={Position.Left} style={{ background: borderColor, width: 16, height: 16 }} />
          <Handle id="left-source" type="source" position={Position.Left} style={{ background: borderColor, width: 16, height: 16 }} />
        </>
      )}
      
      {/* Validation error badge */}
      {isInvalid && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            background: '#ef4444',
            borderRadius: '50%',
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)'
          }}
          title={`Заполните обязательные поля: ${validation.missingFields.join(', ')}`}
        >
          ⚠️
        </div>
      )}
      
      <div style={{ fontWeight: 800, fontSize: '24px' }}>{title}</div>
      {/* Visual shows only icon + title, no settings content */}
    </div>
  );
}

function InnerEditor() {
  const { nodes, edges, setNodes, setEdges, catalog, plan, role, showToast } = useEditorStore();
  const { setAllValidationResults, getInvalidNodes } = useValidationStore();
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined);
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [isExportConfirmOpen, setIsExportConfirmOpen] = useState(false);
  const { setViewport, screenToFlowPosition } = useReactFlow();
  
  // Validate all nodes
  const runValidation = useCallback(() => {
    const results = validateAllNodesWithSchema(nodes, catalog);
    setAllValidationResults(results);
    return results;
  }, [nodes, catalog, setAllValidationResults]);
  
  // Auto-validate on nodes change
  useEffect(() => {
    runValidation();
  }, [nodes, runValidation]);

  // Create wrapper functions for React Flow's onChange handlers
  const onNodesChange = useCallback((changes: any) => {
    setNodes((nds) => {
      // Apply React Flow changes
      const updatedNodes = nds.map(node => {
        const change = changes.find((c: any) => c.id === node.id);
        if (!change) return node;
        
        if (change.type === 'position' && change.position) {
          return { ...node, position: change.position };
        }
        if (change.type === 'select') {
          return { ...node, selected: change.selected };
        }
        if (change.type === 'remove') {
          return null;
        }
        return node;
      }).filter(Boolean) as Node[];
      
      return updatedNodes;
    });
  }, [setNodes]);

  const onEdgesChange = useCallback((changes: any) => {
    setEdges((eds) => {
      const updatedEdges = eds.map(edge => {
        const change = changes.find((c: any) => c.id === edge.id);
        if (!change) return edge;
        
        if (change.type === 'select') {
          return { ...edge, selected: change.selected };
        }
        if (change.type === 'remove') {
          return null;
        }
        return edge;
      }).filter(Boolean) as Edge[];
      
      return updatedEdges;
    });
  }, [setEdges]);

  // Установка начального viewport ОДИН раз при монтировании
  useEffect(() => {
    setViewport({ x: 0, y: 0, zoom: 0.6 }, { duration: 0 });
  }, [setViewport]);

  // Типы узлов и рёбер
  const nodeTypes = useMemo(() => ({
    default: CustomNode,
    start: CustomNode,
    message: CustomNode,
  }), []);

  const edgeTypes = useMemo(() => ({
    default: CustomEdge,
  }), []);

  // Создание соединения
  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({
      ...params,
      type: 'default',
      animated: false,
      markerEnd: { 
        type: MarkerType.ArrowClosed,
        width: 30,
        height: 30,
        color: '#FFC107'
      },
      style: { stroke: '#FFC107', strokeWidth: 6 },
    }, eds));
  }, [setEdges]);

  // Handle drag over canvas
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  // Handle drop block from library
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();

    const blockData = e.dataTransfer.getData('application/block');
    if (!blockData) return;

    try {
      const block: BlockCatalogItem = JSON.parse(blockData);
      
      // Get current plan and role from store
      const { plan, role, showToast } = useEditorStore.getState();
      
      // Check access - validate before creating node
      if (!canAccessBlock(block, plan, role)) {
        // Log denied attempt for analytics
        logAccessDenied(block, plan, role, 'drop');
        
        // Show warning toast
        const message = getAccessDeniedMessage(block, plan, role);
        showToast(message, 'warning');
        
        // Cancel drop operation
        return;
      }
      
      // Access granted - proceed with creating node
      const position = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      const newNode: Node = {
        id: nanoid(),
        type: 'default',
        position,
        data: {
          blockId: block.id,
          title: block.title,
          icon: block.icon,
          color: block.color,
          settings: {}, // All user config goes here
        },
        style: {
          borderColor: block.color,
        },
      };

      // Debug: log the created node structure
      debugNodeStructure(newNode);

      setNodes((nds) => [...nds, newNode]);
      
      // Show success toast
      showToast(`Блок "${block.title}" добавлен`, 'success');
    } catch (error) {
      console.error('Error dropping block:', error);
      useEditorStore.getState().showToast('Ошибка при добавлении блока', 'error');
    }
  }, [screenToFlowPosition, setNodes]);

  // Обработчики кликов
  const onNodeClick = useCallback((_: any, node: any) => {
    setSelectedNodeId(node.id);
    setIsPanelVisible(true);
  }, []);

  const onEdgeClick = useCallback((_: any, edge: any) => {
    // Не удаляем сразу - только выделяем, удаление через корзину в CustomEdge
  }, []);

  // Клик по пустому месту - снять выделение
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(undefined);
  }, []);

  const selectedNode = useMemo(() => 
    nodes.find(n => n.id === selectedNodeId), 
    [nodes, selectedNodeId]
  );

  // Node changes are now handled directly by BlockSettingsPanel

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    setEdges(es => es.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setNodes(ns => ns.filter(n => n.id !== selectedNodeId));
    setSelectedNodeId(undefined);
  }, [selectedNodeId, setEdges, setNodes]);

  const handleDuplicateNode = useCallback(() => {
    if (!selectedNode) return;
    const newNode = {
      ...selectedNode,
      id: `node_${Date.now()}`,
      position: { 
        x: selectedNode.position.x + 50, 
        y: selectedNode.position.y + 50 
      },
      data: {
        ...selectedNode.data,
        label: `${selectedNode.data.label} (копия)`
      }
    };
    setNodes(ns => [...ns, newNode]);
  }, [selectedNode, setNodes]);

  // Export with validation
  const handleExport = useCallback(() => {
    const validationResults = runValidation();
    
    if (hasValidationErrors(validationResults)) {
      setIsExportConfirmOpen(true);
      return;
    }
    
    performExport();
  }, [runValidation]);
  
  const performExport = useCallback(() => {
    const exportData = {
      meta: {
        created_at: new Date().toISOString(),
        plan: plan,
        role: role,
        node_count: nodes.length,
        edge_count: edges.length,
        version: '1.0'
      },
      nodes: nodes,
      edges: edges
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `botforg-flow-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    showToast('Сценарий экспортирован', 'success');
    setIsExportConfirmOpen(false);
  }, [nodes, edges, plan, role, showToast]);

  // Import with validation
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          
          // Validate file structure
          if (!data.nodes || !Array.isArray(data.nodes)) {
            showToast('Некорректный формат файла: отсутствует nodes', 'error');
            return;
          }
          
          if (!data.edges || !Array.isArray(data.edges)) {
            showToast('Некорректный формат файла: отсутствует edges', 'error');
            return;
          }
          
          // Validate each node has settings
          const invalidNodes = data.nodes.filter((n: Node) =>
            !n.data || !n.data.settings || typeof n.data.settings !== 'object'
          );
          
          if (invalidNodes.length > 0) {
            showToast(
              `Некорректная структура узлов: ${invalidNodes.length} узлов без settings`,
              'error'
            );
            return;
          }
          
          // Import data
          setNodes(data.nodes);
          setEdges(data.edges);
          setSelectedNodeId(undefined);
          
          // Run validation
          runValidation();
          
          showToast('Сценарий импортирован', 'success');
        } catch (error) {
          console.error('Import error:', error);
          showToast('Файл повреждён или неверный формат', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [setNodes, setEdges, showToast, runValidation]);
  
  // Show validation modal
  const handleValidate = useCallback(() => {
    runValidation();
    setIsValidationModalOpen(true);
  }, [runValidation]);

  return (
    <div style={{ 
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      width: '100%',
      backgroundColor: '#0a1b2a',
      position: 'relative',
      zIndex: 1
    }}>
      {/* Toast notifications */}
      <ToastContainer />
      
      {/* Validation Modal */}
      <ValidationModal
        isOpen={isValidationModalOpen}
        onClose={() => setIsValidationModalOpen(false)}
      />
      
      {/* Export Confirmation Modal */}
      <ExportConfirmModal
        isOpen={isExportConfirmOpen}
        errorCount={getInvalidNodes().length}
        onConfirm={performExport}
        onCancel={() => setIsExportConfirmOpen(false)}
      />
      
      {/* Top controls bar */}
      <EditorControls />
      
      {/* Main content area */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: isPanelVisible && selectedNode ? '280px 1fr 360px' : '280px 1fr', 
        height: '100%',
        flex: 1,
        overflow: 'hidden'
      }}>
        {/* Left panel - Block Library */}
        <aside style={{ 
          borderRight: '1px solid #1f2937',
          backgroundColor: '#0a1b2a',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <BlockLibrary />
        </aside>

      {/* Основная область редактора */}
      <main style={{ 
        height: '100%', 
        backgroundColor: '#0a1b2a',
        position: 'relative'
      }}>
        <svg style={{ position: 'absolute', width: 0, height: 0 }}>
          <defs>
            <marker
              id="arrow-marker"
              viewBox="0 0 20 20"
              refX="10"
              refY="10"
              markerWidth="20"
              markerHeight="20"
              orient="auto"
            >
              <path
                d="M 0 5 L 5 10 L 0 15 L 10 10 Z"
                fill="#FFC107"
                stroke="#FFC107"
                strokeWidth="1"
              />
            </marker>
          </defs>
        </svg>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onPaneClick={onPaneClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          
          // Интерактивность
          nodesDraggable={true}
          nodesConnectable={true}
          elementsSelectable={true}
          panOnDrag={true}
          panOnScroll={true}
          zoomOnScroll={true}
          zoomOnPinch={true}
          
          // Настройки зума и начальный viewport
          minZoom={0.3}
          maxZoom={1.5}
          defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
          
          // Режим соединения
          connectionMode={ConnectionMode.Loose}
          connectOnClick={true}
          
          // Настройки рёбер по умолчанию
          defaultEdgeOptions={{
            type: 'default',
            animated: false,
            markerEnd: { 
              type: MarkerType.ArrowClosed,
              width: 30,
              height: 30,
              color: '#FFC107'
            },
            style: { stroke: '#FFC107', strokeWidth: 6 },
          }}
          
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
            style={{ backgroundColor: '#0a1b2a' }}
          />
          
          {/* Элементы управления */}
          <Controls 
            position="bottom-left"
            showZoom={true}
            showFitView={true}
            showInteractive={true}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
            }}
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
                default: '#2f6dff',
              };
              return colors[type as keyof typeof colors] || '#2f6dff';
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
      </main>

      {/* Правая панель настроек - показывается только при выборе узла */}
      {isPanelVisible && selectedNode && (
        <aside style={{ 
          borderLeft: '1px solid #1f2937',
          backgroundColor: '#0a1b2a',
          position: 'relative'
        }}>
          <button
            onClick={() => {
              setIsPanelVisible(false);
              setSelectedNodeId(undefined);
            }}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: '#1f2937',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '4px 8px',
              cursor: 'pointer',
              fontSize: '12px',
              zIndex: 10,
            }}
          >
            ✕ Закрыть
          </button>
          <BlockSettingsPanel
            selectedNode={selectedNode}
            onClose={() => {
              setIsPanelVisible(false);
              setSelectedNodeId(undefined);
            }}
            onDelete={handleDeleteNode}
            onDuplicate={handleDuplicateNode}
          />
        </aside>
      )}
      </div>
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


