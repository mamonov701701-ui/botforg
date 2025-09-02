import React, { useState } from 'react';
import { Handle, Position } from 'reactflow';
import { 
  MessageSquare, 
  Zap, 
  HelpCircle, 
  Settings, 
  Target,
  Package,
  Play
} from 'lucide-react';

const getBlockIcon = (type) => {
  const icons = {
    start: <Play className="w-6 h-6 text-gray-800" />,
    message: <MessageSquare className="w-6 h-6 text-blue-600" />,
    action: <Zap className="w-6 h-6 text-green-600" />,
    condition: <HelpCircle className="w-6 h-6 text-purple-600" />,
    process: <Settings className="w-6 h-6 text-purple-600" />,
    decision: <Target className="w-6 h-6 text-red-600" />,
    default: <Package className="w-6 h-6 text-gray-600" />
  };
  return icons[type] || icons.default;
};

const getBlockBorderColor = (type) => {
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

const CustomBlock = ({ data, id, selected }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(data.label || 'Новый блок');
  const blockType = data.type || 'default';
  const borderColor = getBlockBorderColor(blockType);

  const handleDoubleClick = () => {
    setIsEditing(true);
  };

  const handleLabelChange = (e) => {
    setLabel(e.target.value);
  };

  const handleLabelBlur = () => {
    setIsEditing(false);
    if (data.onLabelChange) {
      data.onLabelChange(id, label);
    }
  };

  // Определяем стили в зависимости от состояния
  const getBlockStyles = () => {
    const baseStyles = {
      minWidth: '200px',
      minHeight: '120px',
      padding: '16px',
      borderRadius: '16px',
      border: `3px solid ${borderColor}`,
      backgroundColor: 'white',
      transition: 'all 0.2s ease',
      transform: selected ? 'scale(1.02)' : 'scale(1)',
    };

    if (selected) {
      return {
        ...baseStyles,
        boxShadow: `0 8px 25px rgba(0, 0, 0, 0.15), 0 0 0 2px ${borderColor}40`,
        border: `4px solid ${borderColor}`,
      };
    }

    return {
      ...baseStyles,
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
    };
  };

  const handleMouseEnter = (e) => {
    if (!selected) {
      e.target.style.transform = 'scale(1.02)';
      e.target.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.12)';
    }
  };

  const handleMouseLeave = (e) => {
    if (!selected) {
      e.target.style.transform = 'scale(1)';
      e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
    }
  };

  return (
    <div
      className="relative"
      style={getBlockStyles()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Верхняя точка соединения */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 border-2 border-white shadow-md"
        style={{
          background: borderColor,
          top: '-6px'
        }}
      />

      {/* Основное содержимое блока */}
      <div className="flex flex-col items-center justify-center gap-3 h-full">
        {/* Иконка типа */}
        <div className="flex items-center justify-center">
          {getBlockIcon(blockType)}
        </div>

        {/* Название блока */}
        <div
          onDoubleClick={handleDoubleClick}
          className="text-sm font-semibold text-gray-800 break-words text-center leading-tight"
          style={{ minHeight: '2.5rem', display: 'flex', alignItems: 'center' }}
        >
          {isEditing ? (
            <input
              type="text"
              value={label}
              onChange={handleLabelChange}
              onBlur={handleLabelBlur}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleLabelBlur();
                }
              }}
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 text-center outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              autoFocus
            />
          ) : (
            <span>{label}</span>
          )}
        </div>
      </div>

      {/* Нижняя точка соединения */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 border-2 border-white shadow-md"
        style={{
          background: borderColor,
          bottom: '-6px'
        }}
      />
    </div>
  );
};

export default CustomBlock;
