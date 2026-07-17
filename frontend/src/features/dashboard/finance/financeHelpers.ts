/**
 * Чистые хелперы UI финансов / secure connections (Этап 6.10 + 6.10A).
 */
import type { PaymentProviderAdmin } from '../../../api/paymentProvidersAdmin';
import { PAYMENT_PROVIDERS_API_PATH } from '../../../api/paymentProvidersAdmin';
import type {
  PaymentProviderConnection,
  PaymentProviderDefinition,
} from '../../../api/paymentProviderConnections';
import {
  PROVIDER_CONNECTIONS_API_PATH,
  PROVIDER_DEFINITIONS_API_PATH,
} from '../../../api/paymentProviderConnections';
import { BRAND_DARK, DANGER_RED } from '../../../ui/tokens';

export { PAYMENT_PROVIDERS_API_PATH, PROVIDER_CONNECTIONS_API_PATH, PROVIDER_DEFINITIONS_API_PATH };

/**
 * Палитра раздела «Финансы».
 * Акцент = тот же CSS token, что у активного пункта sidebar (`var(--primary)`).
 */
export const FINANCE_COLORS = {
  dark: BRAND_DARK,
  accent: 'var(--primary)',
  danger: DANGER_RED,
  panelBg: '#0A1B3D',
  panelBgElevated: '#0E2348',
  text: '#F2F5FA',
  textSecondary: '#C5CDD9',
  accentBorder: 'var(--color-border-accent-muted)',
  accentBorderStrong: 'color-mix(in srgb, var(--primary) 55%, transparent)',
  accentSoftBg: 'var(--primary-bg)',
  fieldBg: '#071428',
  badgeMutedBorder: 'color-mix(in srgb, #C5CDD9 45%, transparent)',
} as const;

export type FinanceTabId = 'tariffs' | 'packages' | 'providers' | 'gifts' | 'audit';

export const FINANCE_TABS: { id: FinanceTabId; label: string }[] = [
  { id: 'tariffs', label: 'Тарифы' },
  { id: 'packages', label: 'Пакеты' },
  { id: 'providers', label: 'Платёжные провайдеры' },
  { id: 'gifts', label: 'Подарки' },
  { id: 'audit', label: 'Журнал действий' },
];

export const DISABLE_DEFAULT_HINT = 'Сначала назначьте другой платёжный провайдер основным';

export const SWITCH_DEFAULT_INSTRUCTION =
  'Чтобы отключить текущую основную платёжную систему:\n' +
  '1. Подключите другую платёжную систему.\n' +
  '2. Сохраните ключи.\n' +
  '3. Проверьте подключение.\n' +
  '4. Включите её.\n' +
  '5. Назначьте основной.';

export type ConnectionStatusId =
  | 'not_configured'
  | 'keys_saved'
  | 'not_verified'
  | 'verified'
  | 'disabled'
  | 'enabled'
  | 'default'
  | 'incomplete';

export interface ConnectionStatusStep {
  id: ConnectionStatusId;
  label: string;
  reached: boolean;
  current: boolean;
}

export const SHOP_ID_INVALID_RU =
  'Некорректный Shop ID. Укажите числовой идентификатор магазина из личного кабинета ЮKassa.';

export const SHOP_ID_PLACEHOLDER = '123456';

/** Понятные статусы карточки без дублей и противоречий. */
export function connectionLifecycleBadges(c: PaymentProviderConnection): string[] {
  const badges: string[] = [];
  if (!c.has_credentials) {
    badges.push('Настройка не завершена');
    return badges;
  }
  badges.push('Ключи сохранены');
  if (c.verified) badges.push('Проверено');
  else badges.push('Не проверено');
  if (c.enabled) badges.push('Включено');
  else badges.push('Выключено');
  if (c.is_default) badges.push('Основное');
  return badges;
}

/** Последовательный статус connection (без ложного «Включён» без credentials). */
export function connectionStatusSteps(c: PaymentProviderConnection): ConnectionStatusStep[] {
  const configured = Boolean(c.has_credentials);
  const verified = configured && Boolean(c.verified);
  const enabled = configured && Boolean(c.enabled);
  const isDefault = enabled && Boolean(c.is_default);

  const steps: Omit<ConnectionStatusStep, 'current'>[] = [
    { id: 'not_configured', label: 'Настройка не завершена', reached: !configured },
    { id: 'keys_saved', label: 'Ключи сохранены', reached: configured },
    {
      id: 'not_verified',
      label: 'Не проверено',
      reached: configured && !verified,
    },
    { id: 'verified', label: 'Проверено', reached: verified },
    { id: 'disabled', label: 'Выключено', reached: configured && !enabled },
    { id: 'enabled', label: 'Включено', reached: enabled },
    { id: 'default', label: 'Основное', reached: isDefault },
  ];

  let currentId: ConnectionStatusId = 'not_configured';
  if (!configured) currentId = 'not_configured';
  else if (isDefault) currentId = 'default';
  else if (enabled) currentId = 'enabled';
  else if (verified) currentId = 'disabled';
  else currentId = 'not_verified';

  return steps.map(s => ({
    ...s,
    current: s.id === currentId,
  }));
}

/** Название по умолчанию без технических хвостов вроде (Test). */
export function defaultConnectionName(
  displayName: string,
  mode: 'test' | 'production' | string
): string {
  const base = (displayName || 'Подключение').trim();
  return mode === 'production' ? `${base} — рабочее` : `${base} — тестовое`;
}

/**
 * Технические имена из lifecycle/скриптов: UUID/hash, «fake #3», provider code.
 * Такие записи не переименовываем автоматически — показываем действие «Переименовать».
 */
export function isTechnicalConnectionName(name: string, providerCode?: string): boolean {
  const n = (name || '').trim();
  if (!n) return true;
  if (/\b[0-9a-f]{6,}\b/i.test(n)) return true;
  if (/#\s*\d+\s*$/i.test(n)) return true;
  if (/\(.*Test.*\)/i.test(n)) return true;
  if (/^Lifecycle\b/i.test(n)) return true;
  if (/^fake\s*#/i.test(n)) return true;
  if (providerCode && n.toLowerCase() === providerCode.toLowerCase()) return true;
  if (providerCode && new RegExp(`\\b${providerCode}\\b`, 'i').test(n) && /#\d+/.test(n)) {
    return true;
  }
  return false;
}

export function validateShopId(value: string): string | null {
  const v = (value || '').trim();
  if (!v) return 'Укажите Shop ID';
  if (v.includes('@') || !/^[0-9]{1,20}$/.test(v)) {
    return SHOP_ID_INVALID_RU;
  }
  return null;
}

export function validateCredentialField(
  fieldName: string,
  value: string,
  pattern: string | null | undefined,
  required: boolean,
  labelRu: string
): string | null {
  const v = (value || '').trim();
  if (!v) {
    return required ? `Заполните поле «${labelRu}»` : null;
  }
  if (fieldName === 'shop_id') {
    return validateShopId(v);
  }
  if (pattern) {
    try {
      const re = new RegExp(pattern);
      if (!re.test(v)) {
        return `Некорректный формат поля «${labelRu}»`;
      }
    } catch {
      /* ignore bad pattern from catalog */
    }
  }
  return null;
}

export function canDeleteConnection(c: PaymentProviderConnection): {
  ok: boolean;
  reason?: string;
} {
  if (c.is_default) {
    return {
      ok: false,
      reason: 'Нельзя удалить основное подключение. Сначала назначьте другое основным.',
    };
  }
  if (c.enabled) {
    return {
      ok: false,
      reason: 'Сначала выключите подключение, затем удалите его.',
    };
  }
  return { ok: true };
}

export function canShowEnableButton(c: PaymentProviderConnection): boolean {
  return Boolean(c.has_credentials && !c.enabled);
}

export function canShowDisableButton(c: PaymentProviderConnection): boolean {
  return Boolean(c.has_credentials && c.enabled);
}

export function canShowSetDefaultButton(c: PaymentProviderConnection): boolean {
  return Boolean(c.has_credentials && !c.is_default);
}

export function canShowVerifyButton(c: PaymentProviderConnection): boolean {
  return Boolean(c.has_credentials);
}

/** Отображать ли badge «Включён» (запрещено при отсутствии credentials). */
export function isConnectionShownAsEnabled(c: PaymentProviderConnection): boolean {
  return Boolean(c.has_credentials && c.enabled);
}

export function canSelectDefinition(d: PaymentProviderDefinition): boolean {
  return d.adapter_status === 'available' && d.can_connect !== false;
}

export function definitionAvailabilityLabel(d: PaymentProviderDefinition): string {
  return canSelectDefinition(d) ? 'Доступна' : 'Скоро';
}

export function canEnableConnection(c: PaymentProviderConnection): {
  ok: boolean;
  reason?: string;
} {
  if (c.enabled) {
    return { ok: false, reason: 'Уже включено' };
  }
  if (!c.has_credentials) {
    return { ok: false, reason: 'Сначала сохраните ключи' };
  }
  if (c.adapter_status !== 'available') {
    return { ok: false, reason: 'Платёжная система пока недоступна' };
  }
  if (!c.verified) {
    return { ok: false, reason: 'Сначала проверьте подключение' };
  }
  return { ok: true };
}

export function canDisableConnection(c: PaymentProviderConnection): {
  ok: boolean;
  reason?: string;
} {
  if (!c.enabled || !c.has_credentials) {
    return { ok: false, reason: 'Подключение не включено' };
  }
  if (c.is_default) {
    return { ok: false, reason: DISABLE_DEFAULT_HINT };
  }
  return { ok: true };
}

export function canSetDefaultConnection(c: PaymentProviderConnection): {
  ok: boolean;
  reason?: string;
} {
  if (c.is_default) {
    return { ok: false, reason: 'Уже основное' };
  }
  if (!c.has_credentials) {
    return { ok: false, reason: 'Сначала сохраните ключи' };
  }
  if (c.adapter_status !== 'available') {
    return { ok: false, reason: 'Платёжная система пока недоступна' };
  }
  if (!c.verified) {
    return { ok: false, reason: 'Сначала проверьте подключение' };
  }
  if (!c.enabled) {
    return { ok: false, reason: 'Сначала включите подключение' };
  }
  return { ok: true };
}

export function getDefaultConnection(
  items: PaymentProviderConnection[]
): PaymentProviderConnection | null {
  return items.find(c => c.is_default) ?? null;
}

export function countDefaultConnections(items: PaymentProviderConnection[]): number {
  return items.filter(c => c.is_default).length;
}

export function hasAlternateDefaultCandidate(
  items: PaymentProviderConnection[],
  excludeId?: number
): boolean {
  return items.some(c => c.id !== excludeId && canSetDefaultConnection(c).ok);
}

export function withUpdatedDefaultConnection(
  items: PaymentProviderConnection[],
  newDefault: PaymentProviderConnection
): PaymentProviderConnection[] {
  return items.map(c => {
    if (c.id === newDefault.id) {
      return { ...newDefault, is_default: true };
    }
    return { ...c, is_default: false };
  });
}

/** Response connection не должен содержать plaintext credentials. */
export function connectionResponseLooksSafe(
  connection: PaymentProviderConnection,
  submittedSecrets: Record<string, string>
): boolean {
  const blob = JSON.stringify(connection);
  for (const value of Object.values(submittedSecrets)) {
    if (value && value.length >= 4 && blob.includes(value)) {
      return false;
    }
  }
  if ('credentials' in (connection as object)) {
    return false;
  }
  return true;
}

export const SERVER_ENCRYPTION_NOT_CONFIGURED =
  'Серверное хранилище платёжных ключей не настроено. Укажите постоянный PAYMENT_CREDENTIALS_MASTER_KEY в настройках сервера.';

export function formatProviderActionError(
  status: number,
  rawMessage: string | null | undefined,
  code?: string | null
): string {
  if (
    status === 503 &&
    (code === 'master_key_missing' ||
      code === 'master_key_invalid' ||
      (rawMessage || '').toLowerCase().includes('payment_credentials_master_key'))
  ) {
    return SERVER_ENCRYPTION_NOT_CONFIGURED;
  }
  if (status === 503 && code === 'decrypt_failed') {
    return 'Не удалось расшифровать сохранённые ключи. Проверьте мастер-ключ сервера.';
  }
  if (code === 'invalid_credential_format' && (rawMessage || '').includes('Shop ID')) {
    return SHOP_ID_INVALID_RU;
  }
  if (code === 'cannot_delete_default') {
    return (
      rawMessage?.trim() ||
      'Нельзя удалить основное подключение. Сначала назначьте другое основным.'
    );
  }
  if (code === 'cannot_delete_enabled') {
    return rawMessage?.trim() || 'Сначала выключите подключение, затем удалите его.';
  }
  if (code === 'connection_in_use') {
    return rawMessage?.trim() || 'Нельзя удалить подключение: есть незавершённые платежи.';
  }
  if (status === 409) {
    const msg = (rawMessage || '').toLowerCase();
    if (code === 'cannot_delete_default' || msg.includes('cannot_delete_default')) {
      return 'Нельзя удалить основное подключение. Сначала назначьте другое основным.';
    }
    if (code === 'cannot_delete_enabled' || msg.includes('cannot_delete_enabled')) {
      return 'Сначала выключите подключение, затем удалите его.';
    }
    if (msg.includes('connection_in_use') || msg.includes('unfinished')) {
      return 'Нельзя удалить подключение: есть незавершённые платежи.';
    }
    if (
      msg.includes('default') ||
      msg.includes('cannot_disable') ||
      msg.includes('назначьте') ||
      msg.includes('отключите')
    ) {
      return DISABLE_DEFAULT_HINT;
    }
    if (msg.includes('not_enabled') || msg.includes('only an enabled')) {
      return 'Сначала включите подключение';
    }
    if (msg.includes('not_verified') || msg.includes('only a verified')) {
      return 'Сначала проверьте подключение';
    }
    if (msg.includes('adapter_planned') || msg.includes('planned')) {
      return 'Платёжная система пока недоступна';
    }
    const raw = (rawMessage || '').trim();
    if (raw) return raw;
    return 'Действие сейчас недоступно. Проверьте статус подключения и попробуйте снова.';
  }
  if (status === 403) {
    return (rawMessage || '').trim() || 'Недостаточно прав для управления платёжными ключами';
  }
  if (status === 422 && (rawMessage || '').includes('Shop ID')) {
    return SHOP_ID_INVALID_RU;
  }
  const msg = (rawMessage || '').trim();
  if (msg) return msg;
  if (status > 0) return `Ошибка (${status})`;
  return 'Не удалось выполнить действие';
}

export function formatConnectionsLoadError(
  status: number,
  rawMessage: string | null | undefined
): string {
  const msg = (rawMessage || '').trim();
  if (status === 404) {
    return (
      `API не найден (404): ${PROVIDER_CONNECTIONS_API_PATH}. ` +
      'Перезапустите backend с поддержкой этапа 6.10A.'
    );
  }
  if (status === 401 || status === 403) {
    return 'Недостаточно прав для просмотра платёжных подключений';
  }
  if (msg && msg.toLowerCase() !== 'not found') return msg;
  if (status > 0) return `Ошибка API (${status})${msg ? `: ${msg}` : ''}`;
  return msg || 'Не удалось загрузить подключения';
}

export function modeLabel(mode: string): string {
  return mode === 'production' ? 'Рабочий' : 'Тестовый';
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('ru-RU');
  } catch {
    return iso;
  }
}

/* —— Legacy env settings (отдельный блок, не смешивать с connections) —— */

export function readinessLabel(status: string): string {
  switch (status) {
    case 'ready':
      return 'Готов';
    case 'missing_secrets':
      return 'Нет настроек в env';
    case 'adapter_missing':
      return 'Адаптер не подключён';
    case 'disabled':
      return 'Отключён';
    case 'forbidden_in_production':
      return 'Запрещён в production';
    case 'fake_disabled':
      return 'Fake отключён';
    case 'not_ready':
      return 'Не готов';
    default:
      return status || 'Неизвестно';
  }
}

export function readinessTone(status: string): 'ok' | 'warn' | 'danger' | 'muted' {
  switch (status) {
    case 'ready':
      return 'ok';
    case 'adapter_missing':
    case 'disabled':
    case 'fake_disabled':
      return 'warn';
    case 'missing_secrets':
    case 'forbidden_in_production':
    case 'not_ready':
      return 'danger';
    default:
      return 'muted';
  }
}

export function formatProvidersLoadError(
  status: number,
  rawMessage: string | null | undefined
): string {
  const msg = (rawMessage || '').trim();
  if (status === 404) {
    return (
      `API не найден (404): ${PAYMENT_PROVIDERS_API_PATH}. ` +
      'Путь frontend совпадает с backend router. ' +
      'Если роут добавлен недавно (этап 6.9), перезапустите backend и обновите страницу.'
    );
  }
  if (status === 401 || status === 403) {
    return 'Недостаточно прав для управления платёжными провайдерами';
  }
  if (msg && msg.toLowerCase() !== 'not found') {
    return msg;
  }
  if (status > 0) {
    return `Ошибка API (${status})${msg ? `: ${msg}` : ''}`;
  }
  return msg || 'Не удалось загрузить провайдеров';
}

/** @deprecated legacy gates — оставлены для legacy-блока / старых тестов */
export function canSetAsDefault(p: PaymentProviderAdmin): { ok: boolean; reason?: string } {
  if (!p.enabled) return { ok: false, reason: 'Сначала включите провайдер' };
  if (p.is_fake && p.mode === 'production') {
    return { ok: false, reason: 'Fake нельзя использовать как production' };
  }
  if (p.readiness_status === 'forbidden_in_production') {
    return { ok: false, reason: 'Fake запрещён в production (fail-closed)' };
  }
  if (p.readiness_status === 'missing_secrets') {
    return { ok: false, reason: 'Не хватает обязательных env-настроек' };
  }
  if (p.readiness_status === 'fake_disabled') {
    return { ok: false, reason: 'Fake-провайдер отключён флагами окружения' };
  }
  if (p.mode === 'production' && p.readiness_status === 'adapter_missing') {
    return { ok: false, reason: 'Production default требует реализованный адаптер' };
  }
  if (p.is_default_for_new_payments) {
    return { ok: false, reason: 'Уже назначен по умолчанию' };
  }
  return { ok: true };
}

export function canEnableProvider(p: PaymentProviderAdmin): { ok: boolean; reason?: string } {
  if (p.is_fake && p.readiness_status === 'forbidden_in_production') {
    return { ok: false, reason: 'Fake нельзя включить в production' };
  }
  return { ok: true };
}

export function canDisableProvider(p: PaymentProviderAdmin): { ok: boolean; reason?: string } {
  if (p.is_default_for_new_payments) {
    return { ok: false, reason: DISABLE_DEFAULT_HINT };
  }
  return { ok: true };
}

export function getDefaultProvider(providers: PaymentProviderAdmin[]): PaymentProviderAdmin | null {
  return providers.find(p => p.is_default_for_new_payments) ?? null;
}

export function countDefaultProviders(providers: PaymentProviderAdmin[]): number {
  return providers.filter(p => p.is_default_for_new_payments).length;
}

export function withUpdatedDefault(
  providers: PaymentProviderAdmin[],
  newDefault: PaymentProviderAdmin
): PaymentProviderAdmin[] {
  return providers.map(p => {
    if (p.code === newDefault.code) {
      return { ...newDefault, is_default_for_new_payments: true };
    }
    return { ...p, is_default_for_new_payments: false };
  });
}
