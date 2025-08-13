import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import ReactFlow, {
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  applyEdgeChanges,
  applyNodeChanges,
} from '@reactflow/core';
import '@reactflow/core/dist/style.css';
import '@reactflow/minimap/dist/style.css';
import '@reactflow/controls/dist/style.css';
import {
  MessageSquare,
  HelpCircle,
  Settings,
  Menu,
  Save,
  Eye,
  Play,
  X,
  Send,
  Bot,
  User,
} from 'lucide-react';

// Кастомные узлы
const MessageNode = ({ data }) => (
  <div className="bg-blue-500 text-white p-3 rounded-lg shadow-lg min-w-[150px]">
    <div className="flex items-center gap-2 mb-2">
      <MessageSquare size={16} />
      <span className="font-semibold">Сообщение</span>
    </div>
    <div className="text-sm">{data.label || 'Введите текст...'}</div>
  </div>
);

const QuestionNode = ({ data }) => (
  <div className="bg-green-500 text-white p-3 rounded-lg shadow-lg min-w-[150px]">
    <div className="flex items-center gap-2 mb-2">
      <HelpCircle size={16} />
      <span className="font-semibold">Вопрос</span>
    </div>
    <div className="text-sm">{data.label || 'Введите вопрос...'}</div>
  </div>
);

const ActionNode = ({ data }) => (
  <div className="bg-purple-500 text-white p-3 rounded-lg shadow-lg min-w-[150px]">
    <div className="flex items-center gap-2 mb-2">
      <Settings size={16} />
      <span className="font-semibold">Действие</span>
    </div>
    <div className="text-sm">{data.label || 'Выберите действие...'}</div>
  </div>
);

const MenuNode = ({ data }) => (
  <div className="bg-orange-500 text-white p-3 rounded-lg shadow-lg min-w-[150px]">
    <div className="flex items-center gap-2 mb-2">
      <Menu size={16} />
      <span className="font-semibold">Меню</span>
    </div>
    <div className="text-sm">{data.label || 'Настройте меню...'}</div>
  </div>
);

const nodeTypes = {
  message: MessageNode,
  question: QuestionNode,
  action: ActionNode,
  menu: MenuNode,
};

export default function Editor() {
  const { id } = useParams();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewMessages, setPreviewMessages] = useState([]);
  const [previewInput, setPreviewInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const autoSaveTimeoutRef = useRef(null);

  // Загрузка шаблона
  useEffect(() => {
    const loadTemplate = async () => {
      try {
        // Здесь будет API запрос к backend
        // const response = await fetch(`/api/templates/${id}`);
        // const template = await response.json();
        
        // Пока используем моковые данные
        const mockTemplate = {
          id: id,
          name: `Шаблон ${id}`,
          nodes: [
            {
              id: '1',
              type: 'message',
              position: { x: 250, y: 100 },
              data: { label: 'Привет! Добро пожаловать в наш бот!' },
            },
            {
              id: '2',
              type: 'question',
              position: { x: 250, y: 250 },
              data: { label: 'Как вас зовут?' },
            },
            {
              id: '3',
              type: 'action',
              position: { x: 250, y: 400 },
              data: { label: 'Сохранить имя' },
            },
          ],
          edges: [
            { id: 'e1-2', source: '1', target: '2' },
            { id: 'e2-3', source: '2', target: '3' },
          ],
        };

        setNodes(mockTemplate.nodes);
        setEdges(mockTemplate.edges);
      } catch (error) {
        console.error('Ошибка загрузки шаблона:', error);
      }
    };

    loadTemplate();
  }, [id]);

  // Автосохранение
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      saveTemplate();
    }, 2000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [nodes, edges]);

  const saveTemplate = async () => {
    setIsSaving(true);
    try {
      // Здесь будет API запрос к backend
      // await fetch(`/api/templates/${id}`, {
      //   method: 'PATCH',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ nodes, edges }),
      // });
      
      // Имитация сохранения
      await new Promise(resolve => setTimeout(resolve, 500));
      setLastSaved(new Date());
    } catch (error) {
      console.error('Ошибка сохранения:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const addNode = (type) => {
    const newNode = {
      id: `${type}-${Date.now()}`,
      type,
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: { label: `Новый ${type === 'message' ? 'сообщение' : type === 'question' ? 'вопрос' : type === 'action' ? 'действие' : 'меню'}` },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const updateNodeData = (nodeId, newData) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...newData } } : node
      )
    );
  };

  const deleteNode = (nodeId) => {
    setNodes((nds) => nds.filter((node) => node.id !== nodeId));
    setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
    }
  };

  const startPreview = () => {
    setShowPreview(true);
    setPreviewMessages([
      { id: 1, type: 'bot', text: 'Привет! Добро пожаловать в наш бот!' },
    ]);
  };

  const sendPreviewMessage = () => {
    if (!previewInput.trim()) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      text: previewInput,
    };

    setPreviewMessages((prev) => [...prev, userMessage]);
    setPreviewInput('');

    // Имитация ответа бота
    setTimeout(() => {
      const botMessage = {
        id: Date.now() + 1,
        type: 'bot',
        text: 'Спасибо за сообщение! Это предварительный просмотр.',
      };
      setPreviewMessages((prev) => [...prev, botMessage]);
    }, 1000);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Верхняя панель */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-gray-800">
            Редактор бота #{id}
          </h1>
          {isSaving && (
            <span className="text-sm text-gray-500 flex items-center gap-1">
              <Save size={14} className="animate-spin" />
              Сохранение...
            </span>
          )}
          {lastSaved && (
            <span className="text-sm text-green-600">
              Сохранено {lastSaved.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={saveTemplate}
            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 flex items-center gap-2"
          >
            <Save size={16} />
            Сохранить
          </button>
          <button
            onClick={startPreview}
            className="bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 flex items-center gap-2"
          >
            <Eye size={16} />
            Предпросмотр
          </button>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* Левая панель инструментов */}
        <div className="w-64 bg-white border-r border-gray-200 p-4">
          <h3 className="font-semibold text-gray-800 mb-4">Элементы</h3>
          <div className="space-y-2">
            <button
              onClick={() => addNode('message')}
              className="w-full bg-blue-500 text-white p-3 rounded-lg hover:bg-blue-600 flex items-center gap-2"
            >
              <MessageSquare size={16} />
              Сообщение
            </button>
            <button
              onClick={() => addNode('question')}
              className="w-full bg-green-500 text-white p-3 rounded-lg hover:bg-green-600 flex items-center gap-2"
            >
              <HelpCircle size={16} />
              Вопрос
            </button>
            <button
              onClick={() => addNode('action')}
              className="w-full bg-purple-500 text-white p-3 rounded-lg hover:bg-purple-600 flex items-center gap-2"
            >
              <Settings size={16} />
              Действие
            </button>
            <button
              onClick={() => addNode('menu')}
              className="w-full bg-orange-500 text-white p-3 rounded-lg hover:bg-orange-600 flex items-center gap-2"
            >
              <Menu size={16} />
              Меню
            </button>
          </div>
        </div>

        {/* Центральная область с React Flow */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
          >
            <Controls />
            <MiniMap />
            <Background />
          </ReactFlow>
        </div>

        {/* Правая панель свойств */}
        <div className="w-80 bg-white border-l border-gray-200 p-4">
          {selectedNode ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">Свойства</h3>
                <button
                  onClick={() => deleteNode(selectedNode.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Текст
                  </label>
                  <textarea
                    value={selectedNode.data.label || ''}
                    onChange={(e) =>
                      updateNodeData(selectedNode.id, { label: e.target.value })
                    }
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Тип узла
                  </label>
                  <div className="text-sm text-gray-600 capitalize">
                    {selectedNode.type}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 mt-8">
              Выберите узел для редактирования
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно предпросмотра */}
      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-96 h-[600px] flex flex-col">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold">Предпросмотр бота</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {previewMessages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs p-3 rounded-lg ${
                      message.type === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {message.type === 'user' ? (
                        <User size={12} />
                      ) : (
                        <Bot size={12} />
                      )}
                      <span className="text-xs opacity-75">
                        {message.type === 'user' ? 'Вы' : 'Бот'}
                      </span>
                    </div>
                    {message.text}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-gray-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={previewInput}
                  onChange={(e) => setPreviewInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendPreviewMessage()}
                  placeholder="Введите сообщение..."
                  className="flex-1 p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={sendPreviewMessage}
                  className="bg-blue-500 text-white p-2 rounded-lg hover:bg-blue-600"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
