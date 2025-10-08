import type { ReactNode } from 'react';

export type NodeSpec = {
  type: string;
  title: string;
  icon?: ReactNode;
  borderColor: string;
  category: string;
};

export const NODE_SPECS: NodeSpec[] = [
  // Базовые
  { type: 'start', title: 'Старт', borderColor: '#2f6dff', category: 'Базовые' },
  { type: 'message', title: 'Сообщение', borderColor: '#2f6dff', category: 'Базовые' },
  { type: 'menu', title: 'Меню', borderColor: '#2f6dff', category: 'Базовые' },
  { type: 'question', title: 'Вопрос', borderColor: '#2f6dff', category: 'Базовые' },
  { type: 'end', title: 'Завершение', borderColor: '#2f6dff', category: 'Базовые' },
  // Бизнесовые
  { type: 'catalog', title: 'Каталог', borderColor: '#22c55e', category: 'Бизнесовые' },
  { type: 'cart', title: 'Корзина', borderColor: '#22c55e', category: 'Бизнесовые' },
  { type: 'payment', title: 'Оплата', borderColor: '#22c55e', category: 'Бизнесовые' },
  { type: 'booking', title: 'Бронирование', borderColor: '#22c55e', category: 'Бизнесовые' },
  { type: 'form', title: 'Форма', borderColor: '#22c55e', category: 'Бизнесовые' },
  // Сервисные
  { type: 'condition', title: 'Условие', borderColor: '#eab308', category: 'Сервисные' },
  { type: 'api', title: 'API', borderColor: '#eab308', category: 'Сервисные' },
  { type: 'integration', title: 'Интеграция', borderColor: '#eab308', category: 'Сервисные' },
  { type: 'webhook', title: 'Webhook', borderColor: '#eab308', category: 'Сервисные' },
  { type: 'timer', title: 'Таймер', borderColor: '#eab308', category: 'Сервисные' },
  // Системные
  { type: 'jump', title: 'Переход', borderColor: '#14b8a6', category: 'Системные' },
  { type: 'tag', title: 'Тег', borderColor: '#14b8a6', category: 'Системные' },
  { type: 'analytics', title: 'Аналитика', borderColor: '#14b8a6', category: 'Системные' },
  // AI
  { type: 'ai', title: 'AI-блок', borderColor: '#a855f7', category: 'AI' },
  { type: 'genText', title: 'Текст', borderColor: '#a855f7', category: 'AI' },
  { type: 'genImage', title: 'Картинка', borderColor: '#a855f7', category: 'AI' },
  { type: 'genVideo', title: 'Видео', borderColor: '#a855f7', category: 'AI' },
  { type: 'genMusic', title: 'Музыка', borderColor: '#a855f7', category: 'AI' },
  { type: 'tts', title: 'Озвучка', borderColor: '#a855f7', category: 'AI' },
  { type: 'batch', title: 'Пакет', borderColor: '#a855f7', category: 'AI' },
  { type: 'publish', title: 'Публикация', borderColor: '#a855f7', category: 'AI' },
  { type: 'moderate', title: 'Модерация', borderColor: '#a855f7', category: 'AI' },
  // Дополнительные
  { type: 'quiz', title: 'Викторина', borderColor: '#f97316', category: 'Дополнительные' },
  { type: 'subscription', title: 'Подписка', borderColor: '#f97316', category: 'Дополнительные' },
  { type: 'operator', title: 'Оператор', borderColor: '#f97316', category: 'Дополнительные' },
  { type: 'feedback', title: 'Отзывы', borderColor: '#f97316', category: 'Дополнительные' },
];

export const CATEGORY_ORDER = ['Базовые','Бизнесовые','Сервисные','Системные','AI','Дополнительные'];



















