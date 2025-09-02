import React, { useState } from 'react';
import { 
  MessageSquare, 
  Zap, 
  HelpCircle, 
  Settings, 
  Target,
  Package,
  Trash2,
  Play
} from 'lucide-react';

// CSS стили для выпадающего меню
const selectStyles = `
  .block-settings-select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 6px;
    background-color: rgba(255,255,255,0.05);
    color: white;
    font-size: 14px;
    outline: none;
    cursor: pointer;
    transition: border-color 0.2s;
    appearance: none;
    background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%23ffffff' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e");
    background-repeat: no-repeat;
    background-position: right 12px center;
    background-size: 16px;
    padding-right: 40px;
  }
  
  .block-settings-select:focus {
    border-color: var(--block-color);
  }
  
  .block-settings-select option {
    background-color: #1f2937;
    color: white;
    padding: 8px 12px;
  }
  
  .block-settings-select option:hover {
    background-color: #374151;
  }
  
  .block-settings-select option:checked {
    background-color: #3b82f6;
  }
`;

const getBlockIcon = (type) => {
  const icons = {
    start: <Play className="w-5 h-5 text-gray-800" />,
    message: <MessageSquare className="w-5 h-5 text-blue-500" />,
    action: <Zap className="w-5 h-5 text-green-500" />,
    condition: <HelpCircle className="w-5 h-5 text-purple-500" />,
    process: <Settings className="w-5 h-5 text-purple-500" />,
    decision: <Target className="w-5 h-5 text-red-500" />,
    default: <Package className="w-5 h-5 text-gray-500" />
  };
  return icons[type] || icons.default;
};

const getBlockColor = (type) => {
  const colors = {
    start: '#374151',
    message: '#3b82f6',
    action: '#10b981',
    condition: '#8b5cf6',
    process: '#8b5cf6',
    decision: '#ef4444',
    default: '#6b7280'
  };
  return colors[type] || colors.default;
};

// Компонент модального подтверждения удаления
const DeleteConfirmationModal = ({ isOpen, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: '#1f2937',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{
            margin: 0,
            fontSize: '18px',
            fontWeight: '600',
            color: 'white',
            marginBottom: '8px'
          }}>
            Удалить блок?
          </h3>
          <p style={{
            margin: 0,
            fontSize: '14px',
            color: 'rgba(255, 255, 255, 0.7)',
            lineHeight: '1.5'
          }}>
            Действие необратимо. Блок и все связанные с ним соединения будут удалены.
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 16px',
              backgroundColor: 'transparent',
              color: 'rgba(255, 255, 255, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '10px 16px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.8'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
};

const BlockSettingsPanel = ({ 
  selectedBlock, 
  blockSettings, 
  onSettingsChange, 
  onSave, 
  onClose,
  onDeleteBlock
}) => {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const blockColor = getBlockColor(blockSettings.type);

  if (!selectedBlock) return null;

  const handleDeleteBlock = () => {
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    onDeleteBlock(selectedBlock.id);
    onClose();
    setShowDeleteModal(false);
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
  };

  return (
    <>
      <style>{selectStyles}</style>
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '320px',
          height: '100vh',
          backgroundColor: 'rgba(30,41,59,1)',
          color: 'white',
          padding: '20px',
          overflowY: 'auto',
          zIndex: 50,
          boxShadow: '-2px 0 10px rgba(0,0,0,0.3)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          '--block-color': blockColor
        }}
      >
        {/* Заголовок панели */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          paddingBottom: '16px',
          borderBottom: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>
              {getBlockIcon(blockSettings.type)}
            </span>
            <h3 style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: '600',
              color: 'white'
            }}>
              Настройки блока
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = 'rgba(255,255,255,0.1)'}
            onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
            title="Закрыть"
          >
            ×
          </button>
        </div>

        {/* Информация о блоке */}
        <div style={{
          marginBottom: '24px',
          padding: '16px',
          backgroundColor: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          border: `1px solid ${blockColor}`
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '12px'
          }}>
            <span style={{ fontSize: '24px' }}>
              {getBlockIcon(blockSettings.type)}
            </span>
            <div>
              <div style={{
                fontSize: '14px',
                fontWeight: '500',
                color: 'rgba(255,255,255,0.8)'
              }}>
                ID: {selectedBlock.id}
              </div>
              <div style={{
                fontSize: '12px',
                color: 'rgba(255,255,255,0.6)'
              }}>
                Тип: {blockSettings.type}
              </div>
            </div>
          </div>
        </div>

        {/* Поле названия */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: 'rgba(255,255,255,0.9)'
          }}>
            Название блока
          </label>
          <input
            type="text"
            value={blockSettings.label}
            onChange={(e) => onSettingsChange({...blockSettings, label: e.target.value})}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px',
              backgroundColor: 'rgba(255,255,255,0.05)',
              color: 'white',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = blockColor}
            onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.2)'}
            placeholder="Введите название блока"
          />
        </div>

        {/* Выбор типа */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: 'rgba(255,255,255,0.9)'
          }}>
            Тип блока
          </label>
          <select
            value={blockSettings.type}
            onChange={(e) => onSettingsChange({...blockSettings, type: e.target.value})}
            className="block-settings-select"
            style={{
              '--block-color': blockColor
            }}
          >
            <option value="start">Начало</option>
            <option value="message">Сообщение</option>
            <option value="action">Действие</option>
            <option value="condition">Условие</option>
            <option value="process">Процесс</option>
            <option value="decision">Решение</option>
            <option value="default">По умолчанию</option>
          </select>
        </div>

        {/* Параметры */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: 'rgba(255,255,255,0.9)'
          }}>
            Параметры (JSON)
          </label>
          <textarea
            value={blockSettings.parameters}
            onChange={(e) => onSettingsChange({...blockSettings, parameters: e.target.value})}
            style={{
              width: '100%',
              minHeight: '100px',
              padding: '10px 12px',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '6px',
              backgroundColor: 'rgba(255,255,255,0.05)',
              color: 'white',
              fontSize: '12px',
              fontFamily: 'monospace',
              outline: 'none',
              resize: 'vertical',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = blockColor}
            onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.2)'}
            placeholder='{"key": "value"}'
          />
        </div>

        {/* Кнопки действий */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          {/* Кнопка сохранения */}
          <button
            onClick={onSave}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: blockColor,
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.8'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            Сохранить
          </button>

          {/* Кнопка удаления */}
          <button
            onClick={handleDeleteBlock}
            style={{
              padding: '12px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.8'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
            title="Удалить блок"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Модальное подтверждение удаления */}
      <DeleteConfirmationModal
        isOpen={showDeleteModal}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </>
  );
};

export default BlockSettingsPanel;
