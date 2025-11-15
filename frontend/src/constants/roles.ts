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
  user: 'Обычный пользователь без доступа к личному кабинету',
};

// Проверка доступа к разделам по ролям
export const SECTION_ACCESS = {
  dashboard: ['owner', 'admin', 'developer', 'templates_manager', 'support', 'viewer'],
  bots: ['owner', 'admin', 'developer'],
  scenarios: ['owner', 'admin', 'developer'],
  templates: ['owner', 'admin', 'developer', 'templates_manager'],
  balance: ['owner', 'admin'],
  analytics: ['owner', 'admin', 'developer', 'templates_manager', 'support', 'viewer'],
  team: ['owner', 'admin'],
  bf_team: ['owner'], // BF команда - только для владельца платформы
  settings: ['owner', 'admin', 'developer'],
} as const;

export type SectionKey = keyof typeof SECTION_ACCESS;

// Проверка прав на действия
export const ACTION_ACCESS = {
  // Боты
  bot_create: ['owner', 'admin', 'developer'],
  bot_edit: ['owner', 'admin', 'developer'],
  bot_delete: ['owner', 'admin', 'developer'],
  bot_start_stop: ['owner', 'admin', 'developer'],

  // Шаблоны
  template_create: ['owner', 'admin', 'developer', 'templates_manager'],
  template_edit: ['owner', 'admin', 'developer', 'templates_manager'],
  template_delete: ['owner', 'admin', 'developer', 'templates_manager'],
  template_publish: ['owner', 'admin', 'templates_manager'],

  // Финансы
  balance_view: ['owner', 'admin'],
  balance_topup: ['owner', 'admin'],
  transactions_export: ['owner', 'admin'],

  // Команда
  team_invite: ['owner', 'admin'],
  team_edit_role: ['owner'],
  team_remove: ['owner'],

  // Настройки
  settings_profile: ['owner', 'admin', 'developer', 'templates_manager', 'support', 'viewer'],
  settings_integrations: ['owner', 'admin', 'developer'],
  settings_notifications: ['owner', 'admin', 'developer', 'templates_manager', 'support', 'viewer'],
} as const;

export type ActionKey = keyof typeof ACTION_ACCESS;

/**
 * Проверяет, есть ли у роли доступ к разделу
 */
export function hasAccessToSection(userRole: RoleValue | undefined, section: SectionKey): boolean {
  if (!userRole) return false;
  return SECTION_ACCESS[section].includes(userRole as any);
}

/**
 * Проверяет, есть ли у роли право на действие
 */
export function hasAccessToAction(userRole: RoleValue | undefined, action: ActionKey): boolean {
  if (!userRole) return false;
  return ACTION_ACCESS[action].includes(userRole as any);
}

/**
 * Получает список доступных разделов для роли
 */
export function getAvailableSections(userRole: RoleValue | undefined): SectionKey[] {
  if (!userRole) return [];
  return Object.entries(SECTION_ACCESS)
    .filter(([_, roles]) => roles.includes(userRole as any))
    .map(([section]) => section as SectionKey);
}
