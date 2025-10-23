import React from 'react';
import { Link } from 'react-router-dom';
import { Edit, Plus, MessageSquare, Settings } from 'lucide-react';

export default function Templates() {
  const mockTemplates = [
    {
      id: 1,
      name: 'Приветственный бот',
      description: 'Простой бот для знакомства',
      type: 'message',
    },
    {
      id: 2,
      name: 'Бот поддержки',
      description: 'Автоматические ответы на вопросы',
      type: 'question',
    },
    { id: 3, name: 'Бот заказов', description: 'Обработка заказов и платежей', type: 'action' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-800">Шаблоны ботов</h1>
        <button className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 flex items-center gap-2">
          <Plus size={16} />
          Создать шаблон
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockTemplates.map(template => (
          <div
            key={template.id}
            className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-center gap-3 mb-4">
              {template.type === 'message' && <MessageSquare className="text-blue-500" size={24} />}
              {template.type === 'question' && <Settings className="text-green-500" size={24} />}
              {template.type === 'action' && <Settings className="text-purple-500" size={24} />}
              <h3 className="text-xl font-semibold text-gray-800">{template.name}</h3>
            </div>
            <p className="text-gray-600 mb-4">{template.description}</p>
            <div className="flex gap-2">
              <Link
                to={`/editor/${template.id}`}
                className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 flex items-center gap-2 flex-1 justify-center"
              >
                <Edit size={16} />
                Редактировать
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
