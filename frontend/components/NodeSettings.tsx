import React from 'react';
import { Node } from 'reactflow';
import { NodeData } from '@/types/flow';

interface NodeSettingsProps {
  node: Node<NodeData> | null;
  onUpdateNode: (id: string, data: Partial<NodeData>) => void;
}

const NodeSettings: React.FC<NodeSettingsProps> = ({ node, onUpdateNode }) => {
  if (!node) {
    return (
      <div className="p-4 text-gray-400">Выберите блок для редактирования</div>
    );
  }
  const { type, label, config = {} } = node.data;
  return (
    <div className="p-4">
      <div className="font-bold mb-2">Настройки блока</div>
      <div className="mb-2">
        <label className="block text-xs mb-1">Название</label>
        <input
          type="text"
          value={label}
          onChange={e => onUpdateNode(node.id, { label: e.target.value })}
          className="border rounded px-2 py-1 w-full text-sm"
        />
      </div>
      <div className="mb-2">
        <label className="block text-xs mb-1">Тип</label>
        <input
          type="text"
          value={type}
          disabled
          className="border rounded px-2 py-1 w-full text-sm bg-gray-100"
        />
      </div>
      {type === 'payment' && (
        <>
          <div className="mb-2">
            <label className="block text-xs mb-1">Сумма</label>
            <input
              type="number"
              value={config.amount || ''}
              onChange={e => onUpdateNode(node.id, { config: { ...config, amount: Number(e.target.value) } })}
              className="border rounded px-2 py-1 w-full text-sm"
              min={1}
            />
          </div>
          <div className="mb-2">
            <label className="block text-xs mb-1">Валюта</label>
            <input
              type="text"
              value={config.currency || 'RUB'}
              onChange={e => onUpdateNode(node.id, { config: { ...config, currency: e.target.value } })}
              className="border rounded px-2 py-1 w-full text-sm"
            />
          </div>
          <div className="mb-2">
            <label className="block text-xs mb-1">Описание</label>
            <input
              type="text"
              value={config.description || ''}
              onChange={e => onUpdateNode(node.id, { config: { ...config, description: e.target.value } })}
              className="border rounded px-2 py-1 w-full text-sm"
            />
          </div>
          <div className="mb-2">
            <label className="block text-xs mb-1">ID блока при успехе</label>
            <input
              type="text"
              value={config.success_node_id || ''}
              onChange={e => onUpdateNode(node.id, { config: { ...config, success_node_id: e.target.value } })}
              className="border rounded px-2 py-1 w-full text-sm"
              placeholder="id блока"
            />
          </div>
          <div className="mb-2">
            <label className="block text-xs mb-1">ID блока при ошибке</label>
            <input
              type="text"
              value={config.fail_node_id || ''}
              onChange={e => onUpdateNode(node.id, { config: { ...config, fail_node_id: e.target.value } })}
              className="border rounded px-2 py-1 w-full text-sm"
              placeholder="id блока"
            />
          </div>
          <div className="mb-2">
            <label className="block text-xs mb-1">Provider Token (Telegram)</label>
            <input
              type="text"
              value={config.provider_token || ''}
              onChange={e => onUpdateNode(node.id, { config: { ...config, provider_token: e.target.value } })}
              className="border rounded px-2 py-1 w-full text-sm"
              placeholder="provider_token"
            />
          </div>
          <div className="mb-2">
            <label className="block text-xs mb-1">Payload</label>
            <input
              type="text"
              value={config.payload || ''}
              onChange={e => onUpdateNode(node.id, { config: { ...config, payload: e.target.value } })}
              className="border rounded px-2 py-1 w-full text-sm"
              placeholder="payload (любая строка)"
            />
          </div>
          <div className="mb-2">
            <label className="block text-xs mb-1">Заголовок платежа (title)</label>
            <input
              type="text"
              value={config.title || ''}
              onChange={e => onUpdateNode(node.id, { config: { ...config, title: e.target.value } })}
              className="border rounded px-2 py-1 w-full text-sm"
              placeholder="title"
            />
          </div>
          <div className="mb-2">
            <label className="block text-xs mb-1">Фото (photo_url)</label>
            <input
              type="text"
              value={config.photo_url || ''}
              onChange={e => onUpdateNode(node.id, { config: { ...config, photo_url: e.target.value } })}
              className="border rounded px-2 py-1 w-full text-sm"
              placeholder="URL картинки"
            />
          </div>
          <div className="mb-2">
            <label className="block text-xs mb-1">Провайдер оплаты</label>
            <select
              value={config.provider || 'telegram'}
              onChange={e => onUpdateNode(node.id, { config: { ...config, provider: e.target.value } })}
              className="border rounded px-2 py-1 w-full text-sm"
            >
              <option value="telegram">Telegram</option>
              <option value="stripe">Stripe</option>
              <option value="cloudpayments">CloudPayments</option>
            </select>
          </div>
          <div className="mb-2">
            <label className="block text-xs mb-1">Success URL (для Stripe/CloudPayments)</label>
            <input
              type="text"
              value={config.success_url || ''}
              onChange={e => onUpdateNode(node.id, { config: { ...config, success_url: e.target.value } })}
              className="border rounded px-2 py-1 w-full text-sm"
              placeholder="https://..."
            />
          </div>
          <div className="mb-2">
            <label className="block text-xs mb-1">Fail URL (для Stripe/CloudPayments)</label>
            <input
              type="text"
              value={config.fail_url || ''}
              onChange={e => onUpdateNode(node.id, { config: { ...config, fail_url: e.target.value } })}
              className="border rounded px-2 py-1 w-full text-sm"
              placeholder="https://..."
            />
          </div>
        </>
      )}
      {/* Здесь будут дополнительные настройки для типа блока */}
    </div>
  );
};

export default NodeSettings; 