import type { TariffAddonItem, TariffGiftItem, UsageBlock } from '../../../api/tariff';

export const PLAN_SOURCE_LABELS: Record<string, string> = {
  subscription: 'Активная подписка',
  gift_plan: 'Подарочный тариф',
  legacy_plan_code: 'Тариф аккаунта',
  fallback_start: 'Стартовый тариф',
};

export const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: 'Активна',
  trialing: 'Пробный период',
  past_due: 'Ожидает оплаты',
  cancelled: 'Отменена',
  expired: 'Истекла',
};

export const GIFT_TYPE_LABELS: Record<string, string> = {
  plan: 'Тариф',
  addon: 'Пакет',
  messages: 'Сообщения',
  active_bot: 'Активный бот',
  team_member: 'Участник команды',
};

export const WARNING_TYPE_LABELS: Record<string, string> = {
  messages_usage: 'Сообщения',
  active_bots_usage: 'Активные боты',
  team_members_usage: 'Участники команды',
};

export function planSourceLabel(source: string): string {
  return PLAN_SOURCE_LABELS[source] ?? 'Тариф';
}

export function subscriptionStatusLabel(status: string): string {
  return SUBSCRIPTION_STATUS_LABELS[status] ?? status;
}

export function formatBillingPeriod(period: { start: string; end: string } | null): string {
  if (!period) return 'Период не указан';
  return `${formatPeriodDate(period.start)} — ${formatPeriodDate(period.end)}`;
}

export function formatLimitValue(value: number | null): string {
  if (value === null) return 'Безлимит';
  return String(value);
}

export function formatUsageLine(block: UsageBlock): string {
  const used = Number.isFinite(block.used) ? Math.max(0, block.used) : 0;
  const limitText = formatLimitValue(block.limit);
  const remainingText = block.remaining === null ? '—' : String(Math.max(0, block.remaining));
  return `${used} / ${limitText} · осталось: ${remainingText}`;
}

export function usagePercent(block: UsageBlock): number | null {
  if (block.limit === null || block.limit <= 0) return null;
  return Math.min(100, Math.round((block.used / block.limit) * 100));
}

export function warningSeverityColor(threshold: number): string {
  if (threshold >= 100) return '#dc2626';
  if (threshold >= 95) return '#ef4444';
  if (threshold >= 85) return '#f97316';
  return '#f59e0b';
}

export function formatPeriodDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function addonTitle(item: TariffAddonItem): string {
  const name = item.name_ru ?? item.code;
  return typeof name === 'string' ? name : 'Пакет';
}

export function addonDetails(item: TariffAddonItem): string {
  const type = item.type != null ? String(item.type) : '';
  const amount = item.amount != null ? String(item.amount) : '';
  const parts = [type, amount ? `+${amount}` : ''].filter(Boolean);
  return parts.join(' · ') || 'Активный пакет';
}

export function giftTitle(item: TariffGiftItem): string {
  if (item.status === 'unsupported_missing_plan_id') {
    return 'Подарок тарифа (требует настройки)';
  }
  if (item.plan_name_ru && typeof item.plan_name_ru === 'string') {
    return `Тариф «${item.plan_name_ru}»`;
  }
  const giftType = item.gift_type != null ? String(item.gift_type) : '';
  const label = giftType ? (GIFT_TYPE_LABELS[giftType] ?? 'Подарок') : 'Подарок';
  return label;
}

export function giftDetails(item: TariffGiftItem): string {
  if (item.status === 'unsupported_missing_plan_id') {
    return typeof item.message === 'string'
      ? item.message
      : 'Подарок пока не применяется к лимитам. Обратитесь в поддержку.';
  }
  const amount = item.amount != null ? `+${item.amount}` : '';
  const code = item.plan_code != null ? String(item.plan_code) : '';
  return [amount, code].filter(Boolean).join(' · ') || 'Активное начисление';
}
