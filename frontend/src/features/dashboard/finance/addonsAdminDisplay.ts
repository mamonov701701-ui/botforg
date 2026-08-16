/**
 * Display helpers for admin AddonPackage catalog (7.2).
 */
import type { AdminAddon } from '../../../api/addonsAdmin';
import { formatMoneyRu } from '../../pricing/pricingDisplay';
import { slugifyPlanCode } from './tariffsAdminDisplay';

export const ADDON_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'messages', label: 'Сообщения' },
  { value: 'active_bot', label: 'Боты' },
  { value: 'team_member', label: 'Участники команды' },
  { value: 'ai_credits', label: 'ИИ-кредиты' },
];

export const ADDON_DURATION_OPTIONS: { value: string; label: string }[] = [
  { value: 'current_period', label: 'До конца текущего периода' },
  { value: 'current_billing_period', label: 'До конца текущего расчётного периода' },
];

export function addonDisplayName(pkg: Pick<AdminAddon, 'name_ru' | 'code'>): string {
  return (pkg.name_ru || pkg.code || '—').trim() || '—';
}

export function addonTypeLabel(type: string): string {
  const key = (type || '').toLowerCase();
  const found = ADDON_TYPE_OPTIONS.find(o => o.value === key);
  if (found) return found.label;
  if (key === 'bots' || key === 'active_bots') return 'Боты';
  return type || '—';
}

export function addonDurationLabel(durationType: string): string {
  const key = (durationType || '').toLowerCase();
  const found = ADDON_DURATION_OPTIONS.find(o => o.value === key);
  return found ? found.label : durationType || '—';
}

export function addonActiveLabel(isActive: boolean): string {
  return isActive ? 'Активен' : 'Архивирован';
}

export function addonPublicLabel(isPublic: boolean): string {
  return isPublic ? 'Публичный' : 'Скрыт';
}

export function formatAddonAdminPrice(
  price: string | null | undefined,
  currency?: string | null
): string {
  if (price == null || String(price).trim() === '') return '—';
  return formatMoneyRu(price, currency || 'RUB');
}

export function formatAddonAmount(pkg: Pick<AdminAddon, 'type' | 'amount'>): string {
  return `${addonTypeLabel(pkg.type)}: +${pkg.amount}`;
}

export function addonValidityLabel(days: number): string {
  const n = Number.isFinite(days) && days > 0 ? days : 30;
  return `${n} дн. с активации`;
}

export type AddonDurationUiKind = 'messages' | 'capacity' | 'ai_credits' | 'other';

export function addonDurationUiKind(type: string): AddonDurationUiKind {
  const key = (type || '').toLowerCase();
  if (key === 'messages') return 'messages';
  if (key === 'active_bot' || key === 'team_member' || key === 'bots' || key === 'active_bots') {
    return 'capacity';
  }
  if (key === 'ai_credits') return 'ai_credits';
  return 'other';
}

export function addonAdminDurationLabel(pkg: Pick<AdminAddon, 'type' | 'validity_days'>): string {
  const kind = addonDurationUiKind(pkg.type);
  if (kind === 'messages') return addonValidityLabel(pkg.validity_days);
  if (kind === 'capacity') return 'Срок действия: до конца текущего тарифного периода';
  if (kind === 'ai_credits') return 'Срок будет определён на следующих этапах';
  return '—';
}

export const ADDON_CAPACITY_DURATION_HELP =
  'Пакет расширяет ёмкость текущего платного тарифа и действует до конца текущего тарифного периода.';

export const ADDON_AI_DURATION_HELP =
  'Срок действия ИИ-кредитов будет задан на этапах 7.3–7.4. Сейчас это поле не утверждает экономику.';

export function addonDeleteHint(pkg: Pick<AdminAddon, 'has_references' | 'can_delete'>): string {
  if (pkg.can_delete) return 'Физическое удаление возможно';
  return DELETE_ADDON_BLOCKED_HINT;
}

export function addonUsageHint(pkg: Pick<AdminAddon, 'has_references'>): string {
  return pkg.has_references ? 'Используется' : 'Не используется';
}

export function formatAddonReferenceCounts(pkg: AdminAddon): string {
  return `Покупки: ${pkg.user_addon_count} · Checkout: ${pkg.checkout_count} · Подарки: ${pkg.gift_count} · Возвраты: ${pkg.refund_count}`;
}

export const ADDON_CODE_HELP =
  'Технический идентификатор пакета. Используется в покупках. После создания изменить его нельзя.';

export const ADDON_TYPE_HELP =
  'Тип ресурса пакета. «Боты» сохраняется как active_bot. ИИ-кредиты пока только в каталоге администратора.';

export const ADDON_AI_CREDITS_HELP =
  'ИИ-кредиты на этом этапе не продаются и не списываются. Цена и количество хранятся в каталоге для следующих этапов.';

export const ADDON_PRICE_NEW_PURCHASES_NOTE =
  'Новая цена будет использоваться только для новых покупок. Уже созданные CheckoutIntent сохраняют свою сумму.';

export const ADDON_AMOUNT_NOTE =
  'Количество уже купленных пакетов не меняется. Новое значение действует для следующих покупок.';

export const ADDON_SORT_ORDER_LABEL = 'Позиция в каталоге';

export const ADDON_SORT_ORDER_HELP = 'Чем меньше число, тем выше пакет отображается в каталоге.';

export const ADDON_SORT_ORDER_STEP = 10;

export function nextAddonDefaultSortOrder(
  packages: Array<Pick<AdminAddon, 'sort_order' | 'is_active'>>
): number {
  const active = packages.filter(p => p.is_active);
  const pool = active.length > 0 ? active : packages;
  if (pool.length === 0) return 0;
  const max = Math.max(...pool.map(p => Number(p.sort_order) || 0));
  return max + ADDON_SORT_ORDER_STEP;
}

export function slugifyAddonCode(raw: string): string {
  return slugifyPlanCode(raw);
}

export const HIDE_ADDON_CONFIRM =
  'Пакет будет скрыт из публичного каталога. Уже купленные пакеты продолжат действовать.';

export const ARCHIVE_ADDON_CONFIRM =
  'Пакет станет недоступен для новых покупок. История и уже приобретённые права будут сохранены.';

export const DELETE_ADDON_CONFIRM =
  'Пакет будет удалён без возможности восстановления. Удаление разрешено только потому, что пакет ещё нигде не использовался.';

export const DELETE_ADDON_BLOCKED_HINT =
  'Пакет уже использовался в покупках или других данных и не может быть удалён. Его можно скрыть или архивировать.';
