import { getSmoothStepPath } from 'reactflow';
import { useState } from 'react';
import React from 'react';
import { Trash2 } from 'lucide-react';

const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  selected,
  style,
  data,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY });
  const centerX = (sourceX + targetX) / 2;
  const centerY = (sourceY + targetY) / 2;

  // Определяем цвета и стили
  const isHighlighted = selected;
  const strokeColor = isHighlighted ? '#FF0000' : '#FFA500'; // Ярко-оранжевый по умолчанию, красный при выделении
  const strokeWidth = 3; // Фиксированная толщина 3 пикселя

  const handleEdgeClick = (e) => {
    e.stopPropagation();
    if (data?.onSelect) {
      data.onSelect(id);
    }
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (data?.onDelete) {
      data.onDelete(id);
    }
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className="react-flow__edge-path"
        onClick={handleEdgeClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        markerEnd={{
          type: 'arrowclosed',
          color: strokeColor,
          width: 20,
          height: 20,
          strokeWidth: 2
        }}
        style={{
          ...style,
          cursor: 'pointer',
          transition: 'stroke 0.2s ease, stroke-width 0.2s ease',
          filter: isHighlighted ? 'drop-shadow(0 0 6px rgba(255, 0, 0, 0.4))' : 'none'
        }}
      />
      
      {/* Корзинка - показывается только при выделении */}
      {isHighlighted && (
        <foreignObject
          x={centerX - 16}
          y={centerY - 16}
          width={32}
          height={32}
          style={{ 
            overflow: 'visible',
            zIndex: 1000,
            pointerEvents: 'all'
          }}
        >
          <div
            className="edge-trash-icon w-8 h-8 bg-red-500 rounded-full shadow-lg flex items-center justify-center cursor-pointer hover:bg-red-600 border-2 border-white"
            onClick={handleDelete}
            style={{
              transition: 'all 0.2s ease',
              zIndex: 1001,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
            }}
            title="Удалить соединение"
          >
            <Trash2 className="w-4 h-4 text-white" />
          </div>
        </foreignObject>
      )}
    </g>
  );
};

export default CustomEdge;
