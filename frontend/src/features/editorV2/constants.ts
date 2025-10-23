/**
 * EditorV2 constants: Node specifications and categories
 */

import { NodeSpec } from '@/types/editor';

export const NODE_SPECS: NodeSpec[] = [
  // Основные блоки
  { type: 'start', title: 'Начало', category: 'Основные', icon: '▶️', borderColor: '#10B981' },
  { type: 'message', title: 'Сообщение', category: 'Основные', icon: '💬', borderColor: '#3B82F6' },
  { type: 'button', title: 'Кнопка', category: 'Основные', icon: '🔘', borderColor: '#8B5CF6' },
  { type: 'input', title: 'Ввод', category: 'Основные', icon: '⌨️', borderColor: '#06B6D4' },
  
  // Логика
  { type: 'condition', title: 'Условие', category: 'Логика', icon: '❓', borderColor: '#F59E0B' },
  { type: 'random', title: 'Случайный выбор', category: 'Логика', icon: '🎲', borderColor: '#EC4899' },
  
  // Интеграции
  { type: 'api', title: 'API запрос', category: 'Интеграции', icon: '🔌', borderColor: '#6366F1' },
  { type: 'webhook', title: 'Webhook', category: 'Интеграции', icon: '📡', borderColor: '#14B8A6' },
  
  // Оплата
  { type: 'payment', title: 'Оплата', category: 'Оплата', icon: '💳', borderColor: '#EF4444' },
];

export const CATEGORY_ORDER = ['Основные', 'Логика', 'Интеграции', 'Оплата'];
