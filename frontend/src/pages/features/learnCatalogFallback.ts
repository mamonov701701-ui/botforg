/**
 * Локальный каталог блоков для страницы «Возможности», если ответ сервера с каталогом недоступен.
 * Совпадает по id с поддерживаемыми в редакторе / scenarioRunner.
 */

import type { BlockCatalogItem } from '../../types/blocks';

const PLANS: ('free' | 'pro' | 'enterprise')[] = ['free', 'pro', 'enterprise'];
const ROLES: ('owner' | 'admin' | 'manager_template' | 'developer' | 'support' | 'viewer')[] = [
  'owner',
  'admin',
  'manager_template',
  'developer',
  'support',
  'viewer',
];

export const LEARN_CATALOG_FALLBACK: BlockCatalogItem[] = [
  {
    id: 'start',
    title: 'Начало',
    category: 'basic',
    description: 'Точка входа сценария чат-бота в редакторе.',
    icon: '▶️',
    color: '#4CAF50',
    planAccess: PLANS,
    permissions: ROLES,
    configSchema: [],
  },
  {
    id: 'message',
    title: 'Сообщение',
    category: 'basic',
    description: 'Текст бота в чате и кнопки для сценария.',
    icon: '💬',
    color: '#2196F3',
    planAccess: PLANS,
    permissions: ROLES,
    configSchema: [],
  },
  {
    id: 'input',
    title: 'Ввод',
    category: 'basic',
    description: 'Свободный ввод пользователя в чат-боте и сохранение в переменную.',
    icon: '⌨️',
    color: '#06B6D4',
    planAccess: PLANS,
    permissions: ROLES,
    configSchema: [],
  },
  {
    id: 'wait',
    title: 'Ожидание',
    category: 'basic',
    description: 'Пауза в диалоге перед следующим шагом сценария.',
    icon: '⏱️',
    color: '#FF9800',
    planAccess: PLANS,
    permissions: ROLES,
    configSchema: [],
  },
  {
    id: 'condition',
    title: 'Условие',
    category: 'basic',
    description: 'Ветвление логики чат-бота по ответу или переменной.',
    icon: '🔀',
    color: '#9C27B0',
    planAccess: PLANS,
    permissions: ROLES,
    configSchema: [],
  },
  {
    id: 'go_to_scenario',
    title: 'Перейти в сценарий',
    category: 'basic',
    description: 'Переход в другой сценарий того же бота в конструкторе.',
    icon: '↪️',
    color: '#5C6BC0',
    planAccess: PLANS,
    permissions: ROLES,
    configSchema: [],
  },
  {
    id: 'variable',
    title: 'Переменная',
    category: 'basic',
    description: 'Запись и изменение переменной сценария без лишнего сообщения.',
    icon: '🗄️',
    color: '#673AB7',
    planAccess: PLANS,
    permissions: ROLES,
    configSchema: [],
  },
  {
    id: 'action',
    title: 'Данные пользователя',
    category: 'basic',
    description: 'Изменяет теги, статус и поля профиля пользователя',
    icon: '⚡',
    color: '#f59e0b',
    planAccess: PLANS,
    permissions: ROLES,
    configSchema: [],
  },
];
