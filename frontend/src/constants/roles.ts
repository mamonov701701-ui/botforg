// Роли пользователей с русскими названиями
export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  DEVELOPER: 'developer',
  TEMPLATES_MANAGER: 'templates_manager',
  SUPPORT: 'support',
  VIEWER: 'viewer',
  USER: 'user',
} as const;

export type RoleKey = keyof typeof ROLES;
export type RoleValue = (typeof ROLES)[RoleKey];

const ROLE_VALUES = new Set<string>(Object.values(ROLES));

/** Нормализует строку роли из API в RoleValue. */
export function asRoleValue(role: RoleValue | string | undefined): RoleValue | undefined {
  if (!role) return undefined;
  return ROLE_VALUES.has(role) ? (role as RoleValue) : undefined;
}

// Переводы ролей на русский
export const ROLE_NAMES: Record<RoleValue, string> = {
  owner: 'Владелец проекта',
  admin: 'Администратор',
  developer: 'Разработчик',
  templates_manager: 'Менеджер шаблонов',
  support: 'Поддержка',
  viewer: 'Наблюдатель',
  user: 'Пользователь',
};

// Описания ролей
export const ROLE_DESCRIPTIONS: Record<RoleValue, string> = {
  owner:
    'Полный доступ ко всем разделам и действиям, включая финансы, аналитику, команду и настройки интеграций',
  admin:
    'Всё, кроме критичных финансовых настроек. Управляет ботами, шаблонами, аналитикой и командой',
  developer:
    'Доступ к разделам: Боты, Шаблоны, Настройки / Интеграции, просмотр Аналитики. Нет доступа к Балансу и Команде',
  templates_manager:
    'Управление шаблонами, публикация, модерация отзывов, доступ к статистике шаблонов',
  support: 'Только чтение базовой аналитики и комментариев для отслеживания обращений и отзывов',
  viewer: 'Только просмотр всех доступных разделов без права изменений',
  user: 'Пользователь: может создавать ботов, шаблоны и сценарии',
};

// Проверка доступа к разделам по ролям
// Все разделы видимы для всех ролей — ограничения только на уровне действий внутри разделов
export const SECTION_ACCESS = {
  dashboard: ['owner', 'admin', 'developer', 'templates_manager', 'support', 'viewer', 'user'],
  bots: ['owner', 'admin', 'developer', 'templates_manager', 'support', 'viewer', 'user'],
  scenarios: ['owner', 'admin', 'developer', 'templates_manager', 'support', 'viewer', 'user'],
  templates: ['owner', 'admin', 'developer', 'templates_manager', 'support', 'viewer', 'user'],
  balance: ['owner', 'admin', 'developer', 'templates_manager', 'support', 'viewer', 'user'],
  analytics: ['owner', 'admin', 'developer', 'templates_manager', 'support', 'viewer', 'user'],
  team: ['owner', 'admin', 'developer', 'templates_manager', 'support', 'viewer', 'user'],
  messages: ['owner', 'admin', 'developer', 'templates_manager', 'support', 'viewer', 'user'],
  bf_team: ['owner'],
  settings: ['owner', 'admin', 'developer', 'templates_manager', 'support', 'viewer', 'user'],
} as const;

export type SectionKey = keyof typeof SECTION_ACCESS;

// Проверка прав на действия
export const ACTION_ACCESS = {
  // Боты
  bot_create: ['owner', 'admin', 'developer', 'user'],
  bot_edit: ['owner', 'admin', 'developer', 'user'],
  scenario_edit: ['owner', 'admin', 'developer', 'user'],
  bot_delete: ['owner', 'admin', 'developer', 'user'],
  bot_start_stop: ['owner', 'admin', 'developer', 'user'],

  // Шаблоны
  template_create: ['owner', 'admin', 'developer', 'templates_manager', 'user'],
  template_edit: ['owner', 'admin', 'developer', 'templates_manager', 'user'],
  template_delete: ['owner', 'admin', 'developer', 'templates_manager', 'user'],
  template_publish: ['owner', 'admin', 'templates_manager', 'developer', 'user'],
  marketplace_stats: ['owner', 'admin', 'developer', 'templates_manager', 'user'], // роль + план Developer

  // Финансы
  balance_view: ['owner', 'admin'],
  balance_topup: ['owner', 'admin'],
  transactions_export: ['owner', 'admin'],

  // Команда
  team_invite: ['owner', 'admin'],
  team_edit_role: ['owner'],
  team_remove: ['owner'],

  // Настройки
  settings_profile: [
    'owner',
    'admin',
    'developer',
    'templates_manager',
    'support',
    'viewer',
    'user',
  ],
  settings_integrations: ['owner', 'admin', 'developer', 'user'],
  settings_notifications: [
    'owner',
    'admin',
    'developer',
    'templates_manager',
    'support',
    'viewer',
    'user',
  ],
} as const;

export type ActionKey = keyof typeof ACTION_ACCESS;

/**
 * Проверяет, есть ли у роли доступ к разделу
 */
export function hasAccessToSection(
  userRole: RoleValue | string | undefined,
  section: SectionKey
): boolean {
  const role = asRoleValue(userRole);
  if (!role) return false;
  return SECTION_ACCESS[section].includes(role as any);
}

/** Действия, требующие тариф Developer (template_publish, marketplace_stats) */
export const PLAN_DEVELOPER_ACTIONS: ActionKey[] = ['template_publish', 'marketplace_stats'];

/**
 * Проверяет, есть ли у роли право на действие
 */
export function hasAccessToAction(
  userRole: RoleValue | string | undefined,
  action: ActionKey
): boolean {
  const role = asRoleValue(userRole);
  if (!role) return false;
  return ACTION_ACCESS[action].includes(role as any);
}

/**
 * Проверяет доступ к действию с учётом тарифа.
 * Для template_publish и marketplace_stats требуется plan_code === 'developer'.
 */
export function hasAccessToPlanRestrictedAction(
  user: { role?: string; plan_code?: string } | null | undefined,
  action: ActionKey
): boolean {
  if (!user) return false;
  const roleOk = hasAccessToAction(user.role as RoleValue, action);
  if (!PLAN_DEVELOPER_ACTIONS.includes(action)) return roleOk;
  return roleOk && user.plan_code === 'developer';
}

/**
 * Получает список доступных разделов для роли
 */
export function getAvailableSections(userRole: RoleValue | string | undefined): SectionKey[] {
  const role = asRoleValue(userRole);
  if (!role) return [];
  return Object.entries(SECTION_ACCESS)
    .filter(([_, roles]) => roles.includes(role as any))
    .map(([section]) => section as SectionKey);
}

/** Человекочитаемые названия действий для подсказок */
const ACTION_LABELS: Partial<Record<ActionKey, string>> = {
  bot_create: 'Создание бота',
  bot_edit: 'Редактирование бота',
  scenario_edit: 'Редактирование сценария',
  bot_delete: 'Удаление бота',
  bot_start_stop: 'Запуск/остановка бота',
  template_create: 'Создание шаблона',
  template_edit: 'Редактирование шаблона',
  template_delete: 'Удаление шаблона',
  template_publish: 'Публикация в маркете',
  marketplace_stats: 'Статистика маркетплейса',
  balance_view: 'Просмотр баланса',
  balance_topup: 'Пополнение баланса',
  transactions_export: 'Экспорт транзакций',
  team_invite: 'Приглашение в команду',
  team_edit_role: 'Изменение ролей участников',
  team_remove: 'Удаление участников',
  settings_integrations: 'Настройки интеграций',
};

/**
 * Возвращает сообщение для недоступного действия.
 * Для template_publish и marketplace_stats — сообщение о тарифе Developer.
 */
export function getAccessDeniedMessage(actionKey: ActionKey): string {
  if (PLAN_DEVELOPER_ACTIONS.includes(actionKey)) {
    return actionKey === 'template_publish'
      ? 'Публикация шаблонов доступна на тарифе Developer'
      : 'Статистика маркетплейса доступна на тарифе Developer';
  }
  const label = ACTION_LABELS[actionKey] || actionKey;
  const roles = ACTION_ACCESS[actionKey];
  const roleNames = roles.map(r => ROLE_NAMES[r as RoleValue] || r).join(', ');
  return `Функция «${label}» доступна для роли: ${roleNames}`;
}

/** Роли с полным доступом к редактированию (не демо-режим) */
const FULL_EDIT_ROLES: RoleValue[] = ['owner', 'admin', 'developer', 'user'];

/**
 * Проверяет, находится ли пользователь в демо-режиме (только просмотр) для редактора.
 * Демо-режим: viewer, support, templates_manager — могут смотреть, но не редактировать.
 */
export function isEditorDemoMode(userRole: RoleValue | string | undefined): boolean {
  const role = asRoleValue(userRole);
  if (!role) return true;
  return !FULL_EDIT_ROLES.includes(role);
}

/**
 * Проверяет демо-режим для раздела по ключевому действию.
 * Например: balance — balance_topup, team — team_invite.
 */
export function isSectionDemoMode(
  userRole: RoleValue | string | undefined,
  keyAction: ActionKey
): boolean {
  return !hasAccessToAction(userRole, keyAction);
}
