import React from 'react';
import ReactFlow, {
  Handle,
  Position,
} from 'reactflow';
import { Background, Controls } from 'reactflow';
import 'reactflow/dist/style.css';
import { 
  Rocket,
  MessageSquare,
  Settings,
  HelpCircle,
  Download,
  Upload,
  GitBranch,
  RefreshCw,
  Flag,
  Circle,
  FileText
} from 'lucide-react';

// Функция для получения иконки по типу узла
const getNodeIcon = (type) => {
  switch (type) {
    case 'start':
      return <Rocket className="w-4 h-4" />;
    case 'message':
      return <MessageSquare className="w-4 h-4" />;
    case 'action':
      return <Settings className="w-4 h-4" />;
    case 'condition':
      return <HelpCircle className="w-4 h-4" />;
    case 'question':
      return <HelpCircle className="w-4 h-4" />;
    case 'input':
      return <Download className="w-4 h-4" />;
    case 'output':
      return <Upload className="w-4 h-4" />;
    case 'decision':
      return <GitBranch className="w-4 h-4" />;
    case 'process':
      return <RefreshCw className="w-4 h-4" />;
    case 'end':
      return <Flag className="w-4 h-4" />;
    default:
      return <Circle className="w-4 h-4" />;
  }
};

// Функция для получения цвета по типу узла
const getNodeColor = (type) => {
  switch (type) {
    case 'start':
      return '#34d399'; // зеленый
    case 'message':
      return '#3b82f6'; // синий
    case 'action':
      return '#f59e0b'; // янтарный
    case 'condition':
      return '#8b5cf6'; // фиолетовый
    case 'question':
      return '#8b5cf6'; // фиолетовый
    case 'input':
      return '#06b6d4'; // голубой
    case 'output':
      return '#84cc16'; // лаймовый
    case 'decision':
      return '#ec4899'; // розовый
    case 'process':
      return '#6366f1'; // индиго
    case 'end':
      return '#ef4444'; // красный
    default:
      return '#6b7280'; // серый
  }
};

// Улучшенный компонент узла для предпросмотра
const PreviewNode = ({ data }) => {
  const nodeType = data.type || 'default';
  const nodeColor = getNodeColor(nodeType);
  const nodeIcon = getNodeIcon(nodeType);
  const nodeLabel = data.label || data.name || 'Новый узел';

  return (
    <div style={{ 
      padding: '12px', 
      border: `2px solid ${nodeColor}`, 
      borderRadius: '6px', 
      backgroundColor: 'white',
      minWidth: '140px',
      maxWidth: '200px',
      fontSize: '12px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      textAlign: 'center'
    }}>
      <Handle type="target" position={Position.Top} style={{ background: nodeColor, width: '8px', height: '8px' }} />
      
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '1.2rem' }}>
          {nodeIcon}
        </span>
        <div style={{ 
          fontSize: '11px', 
          fontWeight: '500',
          color: '#374151',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%',
          textAlign: 'center'
        }}>
          {nodeLabel}
        </div>
      </div>
      
      <Handle type="source" position={Position.Bottom} style={{ background: nodeColor, width: '8px', height: '8px' }} />
    </div>
  );
};

// Типы узлов для предпросмотра
const nodeTypes = {
  custom: PreviewNode,
  input: PreviewNode,
  default: PreviewNode,
};

const ImportPreviewModal = ({ isOpen, importData, onConfirm, onCancel }) => {
  if (!isOpen || !importData) return null;

  const nodeCount = importData.nodes?.length || 0;
  const edgeCount = importData.edges?.length || 0;
  const templateId = importData.template_id || 'неизвестен';
  const nodeTypes = [...new Set(importData.nodes?.map(n => n.data?.type || 'default') || [])];

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '24px',
        maxWidth: '800px',
        width: '95%',
        maxHeight: '90vh',
        overflow: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}>
        {/* Заголовок */}
        <div style={{
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: '16px',
          marginBottom: '20px'
        }}>
          <h2 style={{
            fontSize: '20px',
            fontWeight: '600',
            color: '#111827',
            margin: 0
          }}>
            <FileText className="w-5 h-5 inline mr-2" /> Предпросмотр схемы
          </h2>
          <p style={{
            fontSize: '14px',
            color: '#6b7280',
            margin: '4px 0 0 0'
          }}>
            Проверьте данные перед импортом
          </p>
        </div>

        {/* Статистика */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '20px'
        }}>
          <div style={{
            padding: '12px',
            backgroundColor: '#f8fafc',
            borderRadius: '6px',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>ID шаблона</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>{templateId}</div>
          </div>
          
          <div style={{
            padding: '12px',
            backgroundColor: '#f8fafc',
            borderRadius: '6px',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Узлов</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>{nodeCount}</div>
          </div>
          
          <div style={{
            padding: '12px',
            backgroundColor: '#f8fafc',
            borderRadius: '6px',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Связей</div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>{edgeCount}</div>
          </div>
          
          <div style={{
            padding: '12px',
            backgroundColor: '#f8fafc',
            borderRadius: '6px',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Типы узлов</div>
            <div style={{ fontSize: '14px', color: '#1e293b' }}>
              {nodeTypes.length > 0 ? nodeTypes.join(', ') : 'Нет данных'}
            </div>
          </div>
        </div>

        {/* Улучшенная миниатюрная схема */}
        <div style={{
          border: '1px solid #e5e7eb',
          borderRadius: '6px',
          width: '600px',
          height: '400px',
          marginBottom: '20px',
          overflow: 'hidden',
          backgroundColor: '#fafafa'
        }}>
          <ReactFlow
            nodes={importData.nodes || []}
            edges={importData.edges || []}
            nodeTypes={nodeTypes}
            fitView
            style={{ background: '#fafafa' }}
            minZoom={0.2}
            maxZoom={2}
            fitViewOptions={{ padding: 0.1 }}
          >
            <Background variant="dots" color="#e5e7eb" />
          </ReactFlow>
        </div>

        {/* Кнопки */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          borderTop: '1px solid #e5e7eb',
          paddingTop: '20px'
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              backgroundColor: 'white',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#f9fafb';
              e.target.style.borderColor = '#9ca3af';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = 'white';
              e.target.style.borderColor = '#d1d5db';
            }}
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '10px 20px',
              backgroundColor: '#06b6d4',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#0891b2';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = '#06b6d4';
            }}
          >
            <Download className="w-4 h-4 inline mr-1" /> Импортировать
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportPreviewModal;

