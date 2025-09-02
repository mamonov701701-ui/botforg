import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactFlow, {
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';
import axios from 'axios';
import CustomBlock from '../components/CustomBlock';
import CustomEdge from '../components/CustomEdge';
import ConnectionPreview from '../components/ConnectionPreview';
import BlockSettingsPanel from '../components/BlockSettingsPanel';
import EditorControls from '../components/EditorControls';
import ImportPreviewModal from '../components/ImportPreviewModal';

const initialBlocks = [
  { id: '1', type: 'input', data: { label: 'Начало', type: 'start' }, position: { x: 250, y: 5 } },
  { id: '2', data: { label: 'Шаг 1', type: 'message' }, position: { x: 100, y: 100 } },
  { id: '3', data: { label: 'Шаг 2', type: 'action' }, position: { x: 400, y: 100 } },
];

const initialConnections = [
  { 
    id: 'e1-2', 
    source: '1', 
    target: '2', 
    type: 'custom',
    markerEnd: { type: 'arrowclosed' },
    data: { onDelete: null, onSelect: null } // Будет установлено позже
  },
  { 
    id: 'e2-3', 
    source: '2', 
    target: '3', 
    type: 'custom',
    markerEnd: { type: 'arrowclosed' },
    data: { onDelete: null, onSelect: null } // Будет установлено позже
  },
];

const API_BASE_URL = 'http://localhost:8000';



export default function Editor() {
  const { id } = useParams();
  
  // 1. ВСЕ СОСТОЯНИЯ (useState, useNodesState, useEdgesState)
  const [blocks, setBlocks, onBlocksChange] = useNodesState(initialBlocks);
  const [connections, setConnections, onConnectionsChange] = useEdgesState(initialConnections);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle'); // 'idle', 'saving', 'saved', 'error'
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [blockSettings, setBlockSettings] = useState({
    label: '',
    type: 'default',
    parameters: ''
  });
  const fileInputRef = useRef(null);
  const [importPreviewData, setImportPreviewData] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  
  // Новые состояния для улучшенного UI
  const [connectionStart, setConnectionStart] = useState(null);
  const [connectionLine, setConnectionLine] = useState(null);

  // Функция для выбора стрелки
  const handleEdgeSelect = useCallback((edgeId) => {
    setSelectedEdgeId(edgeId);
  }, []);

  // Функция для удаления связи
  const handleConnectionDelete = useCallback((connectionId) => {
    setConnections((conns) => conns.filter(conn => conn.id !== connectionId));
    setSelectedEdgeId(null); // Сбрасываем выделение после удаления
  }, [setConnections]);

  // Функция для получения обновленных узлов с выделением
  const getUpdatedBlocks = useCallback(() => {
    return blocks.map(block => ({
      ...block,
      selected: block.id === selectedBlock?.id,
      data: {
        ...block.data,
        onLabelChange: updateBlockLabel,
        onTypeChange: updateBlockType,
      },
    }));
  }, [blocks, selectedBlock, updateBlockLabel, updateBlockType]);

  // Функция для получения обновленных стрелок с выделением
  const getUpdatedConnections = useCallback(() => {
    return connections.map(connection => ({
      ...connection,
      selected: connection.id === selectedEdgeId,
      data: {
        ...connection.data,
        onDelete: handleConnectionDelete,
        onSelect: handleEdgeSelect
      }
    }));
  }, [connections, selectedEdgeId, handleConnectionDelete, handleEdgeSelect]);



  // Функция для обновления label блока
  const updateBlockLabel = useCallback((blockId, newLabel) => {
    setBlocks((blks) =>
      blks.map((block) => {
        if (block.id === blockId) {
          return {
            ...block,
            data: {
              ...block.data,
              label: newLabel,
            },
          };
        }
        return block;
      })
    );
  }, [setBlocks]);

  // Функция для обновления типа блока
  const updateBlockType = useCallback((blockId, newType) => {
    setBlocks((blks) =>
      blks.map((block) => {
        if (block.id === blockId) {
          return {
            ...block,
            data: {
              ...block.data,
              type: newType,
            },
          };
        }
        return block;
      })
    );
  }, [setBlocks]);

  // Функция для выбора блока
  const handleBlockSelect = useCallback((event, block) => {
    setSelectedBlock(block);
    setBlockSettings({
      label: block.data.label || '',
      type: block.data.type || 'default',
      parameters: block.data.parameters || ''
    });
  }, []);

  // Функция для сохранения настроек блока
  const saveBlockSettings = useCallback(() => {
    if (!selectedBlock) return;
    
    setBlocks((blks) =>
      blks.map((block) => {
        if (block.id === selectedBlock.id) {
          return {
            ...block,
            data: {
              ...block.data,
              label: blockSettings.label,
              type: blockSettings.type,
              parameters: blockSettings.parameters,
            },
          };
        }
        return block;
      })
    );
    
    setSelectedBlock(null);
  }, [selectedBlock, blockSettings, setBlocks]);

  // Функция для удаления блока
  const handleBlockDelete = useCallback((blockId) => {
    // Удаляем блок
    setBlocks((blks) => blks.filter(block => block.id !== blockId));
    
    // Удаляем все связи, связанные с этим блоком
    setConnections((conns) => conns.filter(conn => 
      conn.source !== blockId && conn.target !== blockId
    ));
  }, [setBlocks, setConnections]);

  // Функция для начала создания связи
  const handleConnectStart = useCallback((event, params) => {
    setConnectionStart(params);
    setConnectionLine({
      sourceX: params.sourceX,
      sourceY: params.sourceY,
      targetX: params.sourceX,
      targetY: params.sourceY,
    });
  }, []);

  // Функция для завершения создания связи
  const handleConnectEnd = useCallback((event) => {
    setConnectionStart(null);
    setConnectionLine(null);
  }, []);

  // Функция для обновления preview линии
  const handleMouseMove = useCallback((event) => {
    if (connectionStart && connectionLine) {
      const reactFlowBounds = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - reactFlowBounds.left;
      const y = event.clientY - reactFlowBounds.top;
      
      setConnectionLine({
        ...connectionLine,
        targetX: x,
        targetY: y,
      });
    }
  }, [connectionStart, connectionLine]);





  // Функция для получения индикатора авто-сохранения
  const getAutoSaveIndicator = () => {
    switch (autoSaveStatus) {
      case 'saving':
        return <span style={{ color: '#f59e0b' }}>💾 Сохранение...</span>;
      case 'saved':
        return <span style={{ color: '#10b981' }}>✅ Сохранено</span>;
      case 'error':
        return <span style={{ color: '#ef4444' }}>❌ Ошибка</span>;
      default:
        return <span style={{ color: '#6b7280' }}>⏳ Ожидание</span>;
    }
  };



  // Загрузка состояния редактора при монтировании
  useEffect(() => {
    const loadEditorState = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_BASE_URL}/editor/${id}`);
        
        // Преобразуем данные из API в формат React Flow
        const apiBlocks = response.data.nodes.map(node => ({
          id: node.id.toString(),
          type: 'custom', // Используем кастомный тип
          data: { 
            label: node.data?.label || 'Новый блок',
            type: node.data?.type || 'default',
          },
          position: { x: node.position_x, y: node.position_y }
        }));
        
                       const apiConnections = response.data.edges.map(edge => ({
                 id: edge.id.toString(),
                 source: edge.source,
                 target: edge.target,
                 type: 'custom',
                 markerEnd: { type: 'arrowclosed' },
                 label: edge.label,
                 data: { 
                   ...edge.data, 
                   onDelete: handleConnectionDelete,
                   onSelect: handleEdgeSelect
                 }
               }));
        
        setBlocks(apiBlocks);
        setConnections(apiConnections);
      } catch (error) {
        console.error('Ошибка загрузки состояния редактора:', error);
        // Если ошибка 404, используем начальное состояние
        if (error.response?.status === 404) {
          const initialBlocksWithHandlers = initialBlocks.map(block => ({
            ...block,
            type: 'custom',
            data: {
              ...block.data,
            }
          }));
          const initialConnectionsWithHandlers = initialConnections.map(connection => ({
            ...connection,
            data: { 
              onDelete: handleConnectionDelete
            }
          }));
          setBlocks(initialBlocksWithHandlers);
          setConnections(initialConnectionsWithHandlers);
        }
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadEditorState();
    }
           }, [id, updateBlockLabel, updateBlockType, handleConnectionDelete, handleEdgeSelect]);

  const onConnect = useCallback(
    (params) => {
      const newConnection = {
        ...params,
        type: 'custom',
        markerEnd: { type: 'arrowclosed' },
        data: { 
          onDelete: handleConnectionDelete,
          onSelect: handleEdgeSelect
        }
      };
      setConnections((conns) => addEdge(newConnection, conns));
    },
    [setConnections, handleConnectionDelete, handleEdgeSelect]
  );

  const addBlock = useCallback(() => {
    const blockTypes = ['message', 'action', 'condition', 'process', 'decision'];
    const randomType = blockTypes[Math.floor(Math.random() * blockTypes.length)];
    
    const newBlock = {
      id: `block-${Date.now()}`,
      type: 'custom',
      data: { 
        label: `Новый блок ${blocks.length + 1}`,
        type: randomType,
      },
      position: { x: Math.random() * 400, y: Math.random() * 400 },
    };
    
    setBlocks((blks) => {
      const updatedBlocks = [...blks, newBlock];
      
      // Автосоединение: если есть выбранный блок, создаем связь
      if (selectedBlock) {
        const newConnection = {
          id: `connection-${selectedBlock.id}-${newBlock.id}`,
          source: selectedBlock.id,
          target: newBlock.id,
          type: 'custom',
          markerEnd: { type: 'arrowclosed' },
          data: { 
            onDelete: handleConnectionDelete,
            onSelect: handleEdgeSelect
          }
        };
        setConnections((conns) => [...conns, newConnection]);
      }
      
      return updatedBlocks;
    });
  }, [blocks.length, selectedBlock, setBlocks, setConnections, handleConnectionDelete, handleEdgeSelect]);

  const saveEditorState = useCallback(async (isAutoSave = false) => {
    try {
      if (isAutoSave) {
        setAutoSaveStatus('saving');
      } else {
        setSaving(true);
      }
      
      // Преобразуем данные React Flow в формат API
      const apiNodes = blocks.map(block => ({
        id: parseInt(block.id),
        template_id: parseInt(id),
        type: block.type || 'default',
        position_x: block.position.x,
        position_y: block.position.y,
        data: { 
          label: block.data.label || 'Новый блок',
          type: block.data.type || 'default',
          parameters: block.data.parameters || '',
        }
      }));
      
      const apiEdges = connections.map(connection => ({
        id: parseInt(connection.id),
        template_id: parseInt(id),
        source: connection.source,
        target: connection.target,
        type: connection.type || 'default',
        label: connection.label || '',
        data: connection.data || {}
      }));
      
      await axios.post(`${API_BASE_URL}/editor/${id}`, {
        nodes: apiNodes,
        edges: apiEdges
      });
      
      if (isAutoSave) {
        setAutoSaveStatus('saved');
        // Скрываем статус через 2 секунды
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      } else {
        alert('Состояние редактора сохранено!');
      }
    } catch (error) {
      console.error('Ошибка сохранения:', error);
      if (isAutoSave) {
        setAutoSaveStatus('error');
        setTimeout(() => setAutoSaveStatus('idle'), 3000);
      } else {
        alert('Ошибка при сохранении: ' + (error.response?.data?.detail || error.message));
      }
    } finally {
      if (!isAutoSave) {
        setSaving(false);
      }
    }
  }, [blocks, connections, id, setAutoSaveStatus, setSaving]);

  // Авто-сохранение каждые 5 секунд
  useEffect(() => {
    const interval = setInterval(() => {
      if (blocks.length > 0 || connections.length > 0) {
        saveEditorState(true); // true = авто-сохранение
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [blocks, connections, saveEditorState]);



  // Функция экспорта схемы с легендой
  const exportSchema = useCallback(() => {
    const data = {
      template_id: id,
      nodes: blocks,
      edges: connections,
      legend: {
        start: "🚀 Начало процесса - точка входа в сценарий",
        message: "📩 Отправка сообщения пользователю",
        action: "⚙️ Выполнение действия или операции",
        condition: "❓ Ветвление логики по условию",
        input: "📥 Получение данных от пользователя",
        output: "📤 Вывод данных пользователю",
        decision: "🔀 Принятие решения на основе данных",
        process: "🔄 Обработка и преобразование данных",
        end: "🏁 Завершение сценария",
        default: "🔘 Базовый тип узла"
      },
      export_info: {
        exported_at: new Date().toISOString(),
        total_nodes: blocks.length,
        total_edges: connections.length,
        node_types: [...new Set(blocks.map(block => block.data.type))]
      }
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `schema_template_${id}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();

    // Очищаем URL после скачивания
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }, [id, blocks, connections]);

  // Функция для применения импортированных данных
  const applyImportedData = useCallback((importedData) => {
    // Преобразуем импортированные блоки в формат React Flow
    const importedBlocks = importedData.nodes.map(block => ({
      ...block,
      type: 'custom', // Используем кастомный тип
      data: {
        ...block.data,
      }
    }));

    // Преобразуем импортированные связи
    const importedConnections = importedData.edges.map(connection => ({
      ...connection,
      id: connection.id || `connection-${Date.now()}-${Math.random()}`,
      type: 'custom',
      markerEnd: { type: 'arrowclosed' },
      data: { 
        ...connection.data, 
        onDelete: handleConnectionDelete,
        onSelect: handleEdgeSelect
      }
    }));

    // Устанавливаем импортированные данные
    setBlocks(importedBlocks);
    setConnections(importedConnections);

    // Показываем информацию об импорте
    const blockCount = importedBlocks.length;
    const connectionCount = importedConnections.length;
    const templateId = importedData.template_id || 'неизвестен';
    
    alert(`Схема успешно импортирована!\n\n📊 Статистика:\n• Блоков: ${blockCount}\n• Связей: ${connectionCount}\n• ID шаблона: ${templateId}\n\n💡 Схема будет автоматически сохранена через 5 секунд.`);
  }, [setBlocks, setConnections, handleConnectionDelete, handleEdgeSelect]);

  // 3. useMemo с nodeTypes и edgeTypes
  const nodeTypes = useMemo(() => ({
    custom: CustomBlock,
    input: CustomBlock,
    default: CustomBlock,
  }), [updateBlockLabel, updateBlockType]);

  const edgeTypes = useMemo(() => ({
    custom: CustomEdge,
  }), [handleConnectionDelete, handleEdgeSelect]);

  // Функция подтверждения импорта
  const confirmImport = useCallback(() => {
    applyImportedData(importPreviewData);
    setShowImportModal(false);
    setImportPreviewData(null);
  }, [applyImportedData, importPreviewData]);

  // 4. ВСЕ useEffect

  // Функция отмены импорта
  const cancelImport = useCallback(() => {
    setShowImportModal(false);
    setImportPreviewData(null);
  }, []);

  // 5. ОСТАЛЬНЫЕ ФУНКЦИИ (не коллбеки)

  // Функция импорта схемы из JSON файла
  const handleImport = useCallback((event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target.result);
        
        // Проверяем структуру импортированных данных
        if (!imported.nodes || !imported.edges) {
          alert("Неверный формат файла. Файл должен содержать nodes и edges.");
          return;
        }

        // Вместо прямого импорта показываем предпросмотр
        setImportPreviewData(imported);
        setShowImportModal(true);

        // Очищаем input для возможности повторного импорта того же файла
        event.target.value = '';

      } catch (err) {
        console.error('Ошибка при импорте схемы:', err);
        alert("Ошибка при импорте схемы. Проверьте формат файла.");
        event.target.value = '';
      }
    };

    reader.onerror = () => {
      alert("Ошибка при чтении файла.");
      event.target.value = '';
    };

    reader.readAsText(file);
  }, []);

  if (loading) {
    return <div style={{ padding: '20px' }}>Загрузка редактора...</div>;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>

      {/* React Flow контейнер */}
      <div style={{ width: '100%', height: '100%' }}>
        <ReactFlow
          nodes={getUpdatedBlocks()}
          edges={getUpdatedConnections()}
          onNodesChange={onBlocksChange}
          onEdgesChange={onConnectionsChange}
          onConnect={onConnect}
          onConnectStart={handleConnectStart}
          onConnectEnd={handleConnectEnd}
          onNodeClick={handleBlockSelect}
          onPaneClick={() => {
            // Сбрасываем выделение блоков и стрелок при клике по панели
            setSelectedBlock(null);
            setSelectedEdgeId(null);
          }}
          onMouseMove={handleMouseMove}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          defaultViewport={{ x: 0, y: 0, zoom: 0.75 }}
        >
          <Controls />
          <Background variant="dots" gap={25} size={1.5} color="#d1d5db" />
          <ConnectionPreview connectionLine={connectionLine} />
        </ReactFlow>

        {/* Кнопки управления внутри области редактора */}
        <EditorControls
          onAddBlock={addBlock}
          onSave={() => saveEditorState(false)}
          onExport={exportSchema}
          onImport={() => fileInputRef.current.click()}
          autoSaveStatus={autoSaveStatus}
          saving={saving}
        />

        {/* Скрытый input для импорта */}
        <input
          type="file"
          accept=".json"
          onChange={handleImport}
          style={{ display: 'none' }}
          ref={fileInputRef}
        />
      </div>

      {/* Боковая панель настроек блока */}
      <BlockSettingsPanel
        selectedBlock={selectedBlock}
        blockSettings={blockSettings}
        onSettingsChange={setBlockSettings}
        onSave={saveBlockSettings}
        onClose={() => setSelectedBlock(null)}
        onDeleteBlock={handleBlockDelete}
      />

      {/* Модальное окно предпросмотра импорта */}
      {showImportModal && (
        <ImportPreviewModal
          isOpen={showImportModal}
          importData={importPreviewData}
          onConfirm={confirmImport}
          onCancel={cancelImport}
        />
      )}
    </div>
  );
}
