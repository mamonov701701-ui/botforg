import React from 'react';
import { NodeType } from '@/types/flow';

const NODE_TYPES: { type: NodeType; label: string }[] = [
  { type: 'message', label: 'Сообщение' },
  { type: 'button', label: 'Кнопки' },
  { type: 'input', label: 'Ввод текста' },
  { type: 'condition', label: 'Условие' },
  { type: 'api', label: 'API-запрос' },
  { type: 'payment', label: 'Оплата' },
];

const NodePanel: React.FC = () => {
  return (
    <div className="p-4 space-y-3">
      <div className="font-bold mb-2">Блоки</div>
      {NODE_TYPES.map((n) => (
        <div
          key={n.type}
          className="flex items-center gap-2 p-2 rounded bg-gray-100 text-gray-700 cursor-grab"
          draggable
          onDragStart={e => {
            e.dataTransfer.setData('application/reactflow', n.type);
            e.dataTransfer.effectAllowed = 'move';
          }}
        >
          <span>{n.label}</span>
        </div>
      ))}
    </div>
  );
};

export default NodePanel; 