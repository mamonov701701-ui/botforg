import React from 'react';
import { NodeType } from '../types/flow';
import {
  MessageSquare,
  MousePointerClick,
  Edit3,
  GitBranch,
  Cloud,
  CreditCard,
} from 'lucide-react';

type PanelItem = { type: NodeType; label: string; icon: React.ReactNode };

const CATEGORIES: { title: string; color: string; items: PanelItem[] }[] = [
  {
    title: 'Базовые',
    color: 'border-blue-400',
    items: [
      { type: 'message', label: 'Сообщение', icon: <MessageSquare size={18} /> },
      { type: 'button', label: 'Кнопки', icon: <MousePointerClick size={18} /> },
      { type: 'input', label: 'Ввод текста', icon: <Edit3 size={18} /> },
      { type: 'condition', label: 'Условие', icon: <GitBranch size={18} /> },
    ],
  },
  {
    title: 'Бизнесовые',
    color: 'border-emerald-400',
    items: [
      { type: 'payment', label: 'Оплата', icon: <CreditCard size={18} /> },
    ],
  },
  {
    title: 'Сервисные',
    color: 'border-violet-400',
    items: [
      { type: 'api', label: 'API-запрос', icon: <Cloud size={18} /> },
    ],
  },
  {
    title: 'Системные',
    color: 'border-slate-400',
    items: [],
  },
  {
    title: 'AI и генерация контента',
    color: 'border-fuchsia-400',
    items: [],
  },
  {
    title: 'Дополнительные',
    color: 'border-gray-400',
    items: [],
  },
];

const NodePanel: React.FC = () => {
  return (
    <div className="p-4 space-y-4">
      <div className="font-bold mb-1">Блоки</div>
      {CATEGORIES.map((cat) => (
        <div key={cat.title} className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-gray-500">{cat.title}</div>
          <div className="grid grid-cols-1 gap-2">
            {cat.items.length === 0 && (
              <div className="text-xs text-gray-400">Скоро…</div>
            )}
            {cat.items.map((n) => (
              <div
                key={n.type}
                className={[
                  'flex items-center gap-2 p-2 rounded-md bg-white cursor-grab select-none border',
                  cat.color,
                ].join(' ')}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/reactflow', n.type);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                title={n.label}
              >
                <div className="shrink-0 text-gray-700">
                  {n.icon}
                </div>
                <div className="text-sm text-gray-700">{n.label}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export default NodePanel; 