/**
 * Display helpers for admin Plan catalog (7.1.1+).
 */
import type { AdminPlan, AdminPlanLimits } from '../../../api/tariffsAdmin';

export function planDisplayName(plan: Pick<AdminPlan, 'name_ru' | 'name' | 'code'>): string {
  return (plan.name_ru || plan.name || plan.code || '—').trim() || '—';
}

export function planActiveLabel(isActive: boolean): string {
  return isActive ? 'Активен' : 'Архивирован';
}

export function planPublicLabel(isPublic: boolean): string {
  return isPublic ? 'Публичный' : 'Скрыт';
}

export function formatPlanPrice(
  priceMonth: string | null | undefined,
  currency?: string | null
): string {
  if (priceMonth == null || String(priceMonth).trim() === '') {
    return 'По запросу';
  }
  const cur = (currency || 'RUB').toUpperCase() === 'RUB' ? '₽' : currency || '';
  return `${priceMonth} ${cur} / мес.`.trim();
}

export function formatLimitValue(value: number | null | undefined): string {
  if (value === null || value === undefined) return '∞';
  return String(value);
}

export function formatBoolRu(value: boolean): string {
  return value ? 'Да' : 'Нет';
}

export function formatAddonPurchase(limits: AdminPlanLimits): string {
  return limits.addon_purchase ? 'Да' : 'Нет';
}

export function planDeleteHint(plan: Pick<AdminPlan, 'has_references' | 'can_delete'>): string {
  if (plan.can_delete) return 'Физическое удаление возможно';
  return DELETE_PLAN_BLOCKED_HINT;
}

export function planUsageHint(plan: Pick<AdminPlan, 'has_references'>): string {
  return plan.has_references ? 'Используется' : 'Не используется';
}

export const LIVE_LIMITS_WARNING =
  'Изменение лимитов сразу повлияет на всех пользователей, у которых сейчас активен этот тариф.';

export const LIVE_LIMITS_CONFIRM =
  'Изменения лимитов применятся к действующим пользователям этого тарифа сразу после сохранения.';

export const PRICE_NEW_PURCHASES_NOTE =
  'Новая цена будет использоваться только для новых покупок. Уже созданные CheckoutIntent сохраняют свою сумму.';

export function formatSubscriptionCount(count: number): string {
  return `Текущих подписок: ${count}`;
}

export const PLAN_CODE_HELP =
  'Технический идентификатор тарифа. Используется системой. После начала использования тарифа изменить его нельзя.';

export const PLAN_RECOMMENDED_HELP = 'Рекомендуемый тариф выделяется в публичном каталоге.';

export const PLAN_SORT_ORDER_LABEL = 'Позиция в каталоге';

export const PLAN_SORT_ORDER_HELP = 'Чем меньше число, тем выше тариф отображается в каталоге.';

/** Default gap after max(sort_order) of active plans. */
export const PLAN_SORT_ORDER_STEP = 10;

export function nextDefaultSortOrder(
  plans: Array<Pick<AdminPlan, 'sort_order' | 'is_active'>>
): number {
  const active = plans.filter(p => p.is_active);
  const pool = active.length > 0 ? active : plans;
  if (pool.length === 0) return 0;
  const max = Math.max(...pool.map(p => Number(p.sort_order) || 0));
  return max + PLAN_SORT_ORDER_STEP;
}

const CYR_MAP: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

/** Deterministic plan code slug: lowercase [a-z0-9_]+ from display name. */
export function slugifyPlanCode(raw: string): string {
  const lower = String(raw || '')
    .trim()
    .toLowerCase();
  let out = '';
  for (const ch of lower) {
    if (CYR_MAP[ch] !== undefined) {
      out += CYR_MAP[ch];
    } else if (/[a-z0-9]/.test(ch)) {
      out += ch;
    } else if (/[\s\-./\\]+/.test(ch) || ch === '_') {
      out += '_';
    }
  }
  out = out.replace(/_+/g, '_').replace(/^_|_$/g, '');
  return out;
}

export const HIDE_PLAN_CONFIRM =
  'Тариф будет скрыт из публичного каталога. Действующие подписки продолжат работать.';

export const ARCHIVE_PLAN_CONFIRM =
  'Тариф станет недоступен для новых покупок. История и действующие подписки будут сохранены.';

export const DELETE_PLAN_CONFIRM =
  'Тариф будет удалён без возможности восстановления. Удаление разрешено только потому, что тариф ещё нигде не использовался.';

export const DELETE_PLAN_BLOCKED_HINT =
  'Тариф уже использовался в покупках или других данных и не может быть удалён. Его можно скрыть или архивировать.';

export const PLAN_IN_USE_HINT =
  'Тариф уже использовался в покупках или других данных и не может быть удалён. Его можно скрыть или архивировать.';
