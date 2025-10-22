import React, { useState } from 'react';
import { Handle, Position } from 'reactflow';
import { 
  MessageSquare, 
  Zap, 
  HelpCircle, 
  Settings, 
  Target,
  Package,
  Play,
  Globe,
  CheckCircle
} from 'lucide-react';
import { BRAND_AMBER } from '../ui/tokens';
import { TYPE_BORDER } from '../editor/types/colors';

const getBlockIcon = (type) => {
  const icons = {
    start: <Play className="w-6 h-6 text-gray-800" />,
    message: <MessageSquare className="w-6 h-6 text-blue-600" />,
    action: <Zap className="w-6 h-6 text-green-600" />,
    condition: <HelpCircle className="w-6 h-6 text-purple-600" />,
    api: <Globe className="w-6 h-6 text-orange-600" />,
    end: <CheckCircle className="w-6 h-6 text-green-600" />,
    default: <Package className="w-6 h-6 text-gray-600" />
  };
  return icons[type] || icons.default;
};

const getBlockBorderColor = (type) => {
  return TYPE_BORDER[type] || TYPE_BORDER.default;
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
      borderRadius: '12px', // Единое скругление
      border: `2px solid ${borderColor}`, // Тонкая рамка по умолчанию
      backgroundColor: 'white', // Белый фон
      transition: 'all 0.2s ease',
      transform: selected ? 'scale(1.02)' : 'scale(1)',
      // Убираем все внешние тени и подложки
      boxShadow: 'none',
      position: 'relative',
      zIndex: 1,
    };

    if (selected) {
      return {
        ...baseStyles,
        border: `3px solid ${borderColor}`, // Толще рамка при выделении
        // Только акцент рамки, никаких внешних подложек
        boxShadow: 'none',
      };
    }

    return baseStyles;
  };

  const handleMouseEnter = (e) => {
    if (!selected) {
      e.target.style.transform = 'scale(1.02)';
      // Убираем внешние тени при hover
      e.target.style.boxShadow = 'none';
    }
  };

  const handleMouseLeave = (e) => {
    if (!selected) {
      e.target.style.transform = 'scale(1)';
      // Убираем внешние тени при leave
      e.target.style.boxShadow = 'none';
    }
  };

  return (
    <div
      className="relative"
      style={{
        ...getBlockStyles(),
        pointerEvents: 'auto' // Убеждаемся, что блок не блокирует события
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Верхняя точка соединения */}
      <Handle
        type="target"
        position={Position.Top}
        id="t"
        isConnectable={true}
        style={{
          width: '16px',
          height: '16px',
          border: `2px solid ${BRAND_AMBER}`,
          background: '#fff',
          borderRadius: '50%',
          top: '-8px',
          pointerEvents: 'auto',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          zIndex: 2,
          transition: 'all 0.2s ease'
        }}
        title="Точка подключения (вход)"
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
        id="b"
        isConnectable={true}
        style={{
          width: '16px',
          height: '16px',
          border: `2px solid ${BRAND_AMBER}`,
          background: '#fff',
          borderRadius: '50%',
          bottom: '-8px',
          pointerEvents: 'auto',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          zIndex: 2,
          transition: 'all 0.2s ease'
        }}
        title="Точка подключения (выход)"
      />
    </div>
  );
};

export default CustomBlock;
