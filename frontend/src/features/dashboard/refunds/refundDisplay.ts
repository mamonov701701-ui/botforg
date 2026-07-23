/**
 * Отображение статусов и сумм возвратов (user UI, этап 6.14.4.2).
 */

/** Статусы, в которых пользователь может отменить заявку (зеркало backend cancel_request). */
const CANCELABLE_STATUSES = new Set([
  'submitted',
  'calculating',
  'awaiting_admin_review',
  'manual_review_required',
  'admin_edited',
  'needs_information',
  'awaiting_final_confirmation',
  'calculation_failed',
]);

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Отправлена',
  calculating: 'Расчёт',
  awaiting_admin_review: 'На проверке',
  manual_review_required: 'Требуется ручная проверка',
  admin_edited: 'Скорректирована администратором',
  awaiting_final_confirmation: 'Ожидает подтверждения',
  approved: 'Возврат одобрен',
  needs_information: 'Нужны дополнительные сведения',
  rejected: 'Отклонена',
  canceled: 'Отменена',
  calculation_failed: 'Ошибка расчёта',
  refund_processing: 'Возврат выполняется',
  refunded: 'Деньги возвращены',
  partially_refunded: 'Частичный возврат выполнен',
  completed: 'Деньги возвращены',
};

const STATUS_HINTS: Record<string, string> = {
  manual_review_required:
    'Автоматический расчёт не определил сумму. Администратор рассмотрит заявку вручную.',
  needs_information: 'Администратору нужны дополнительные сведения. Отправьте ответ в форме ниже.',
  rejected: 'Заявка отклонена. Возврат средств по этой заявке не выполняется.',
  approved:
    'Деньги ещё не отправлены через платёжную систему. Следующий этап — выполнение возврата.',
  refund_processing: 'Запрос на возврат передан в платёжную систему.',
  refunded: 'Платёжная система подтвердила возврат.',
  partially_refunded:
    'Часть суммы возвращена. Можно оформить возврат на остаток, если он доступен.',
  completed: 'Возврат выполнен, изменения по тарифу или пакету применены.',
  canceled: 'Вы отменили эту заявку.',
  awaiting_admin_review: 'Заявка ожидает решения администратора.',
};

export const MANUAL_AMOUNT_LABEL = 'Сумма определяется администратором';

export function refundStatusLabel(
  status: string,
  options?: { confirmedRefunded?: string | null; remainingRefundable?: string | null }
): string {
  if (status === 'completed' && isPartialMoneyState(options)) {
    return 'Частичный возврат выполнен';
  }
  return STATUS_LABELS[status] ?? status;
}

function isPartialMoneyState(options?: {
  confirmedRefunded?: string | null;
  remainingRefundable?: string | null;
}): boolean {
  const confirmed = Number(options?.confirmedRefunded);
  const remaining = Number(options?.remainingRefundable);
  return Number.isFinite(confirmed) && confirmed > 0 && Number.isFinite(remaining) && remaining > 0;
}

export function refundStatusHint(
  status: string,
  options?: {
    amountLabel?: string | null;
    confirmedRefunded?: string | null;
    remainingRefundable?: string | null;
  }
): string | null {
  const amount = (options?.amountLabel || '').trim();
  if (status === 'approved') {
    const amountPart = amount ? `Сумма возврата: ${amount}. ` : '';
    return `${amountPart}Деньги ещё не отправлены через платёжную систему. Следующий этап — выполнение возврата.`;
  }
  if (status === 'refund_processing') {
    return STATUS_HINTS.refund_processing;
  }
  if (status === 'refunded') {
    return amount ? `Платёжная система подтвердила возврат ${amount}.` : STATUS_HINTS.refunded;
  }
  if (status === 'completed') {
    if (isPartialMoneyState(options)) {
      return 'Деньги возвращены частично; изменения по тарифу или пакету применены. Можно оформить возврат на остаток.';
    }
    return STATUS_HINTS.completed;
  }
  if (status === 'partially_refunded') {
    return STATUS_HINTS.partially_refunded;
  }
  return STATUS_HINTS[status] ?? null;
}

/** «Возвращено: X ₽ из Y ₽» */
export function formatPartialRefundProgress(input: {
  confirmedRefunded?: string | null;
  paidAmount?: string | null;
  currency?: string | null;
}): string | null {
  const confirmed = (input.confirmedRefunded || '').trim();
  const paid = (input.paidAmount || '').trim();
  if (!confirmed || !paid) return null;
  const cur = (input.currency || 'RUB').toUpperCase() === 'RUB' ? '₽' : input.currency;
  return `Возвращено: ${confirmed} ${cur} из ${paid} ${cur}`.trim();
}

export function formatRemainingRefundable(input: {
  remaining?: string | null;
  currency?: string | null;
}): string | null {
  const rem = (input.remaining || '').trim();
  if (!rem) return null;
  const cur = (input.currency || 'RUB').toUpperCase() === 'RUB' ? '₽' : input.currency;
  return `Осталось доступно к возврату: ${rem} ${cur}`.trim();
}

export function formatAddonRevokedUnits(units: number | null | undefined): string | null {
  if (units == null || !Number.isFinite(units) || units <= 0) return null;
  const n = Math.trunc(units);
  const mod100 = n % 100;
  const mod10 = n % 10;
  let word = 'сообщений';
  if (!(mod100 >= 11 && mod100 <= 14)) {
    if (mod10 === 1) word = 'сообщение';
    else if (mod10 >= 2 && mod10 <= 4) word = 'сообщения';
  }
  return `Отозвано: ${n} ${word}`;
}

export function canUserCancelRefund(status: string): boolean {
  return CANCELABLE_STATUSES.has(status);
}

/**
 * Показ рекомендуемой суммы.
 * null / undefined / placeholder flags → текст про администратора, не «0 ₽».
 */
export function formatRecommendedRefundAmount(
  amount: string | null | undefined,
  options?: { proposedAmountUndefined?: boolean; currency?: string | null }
): string {
  if (options?.proposedAmountUndefined) {
    return MANUAL_AMOUNT_LABEL;
  }
  if (amount === null || amount === undefined || amount === '') {
    return MANUAL_AMOUNT_LABEL;
  }
  const trimmed = String(amount).trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null') {
    return MANUAL_AMOUNT_LABEL;
  }
  const currency = (options?.currency || 'RUB').toUpperCase() === 'RUB' ? '₽' : options?.currency;
  return `${trimmed} ${currency}`.trim();
}

export function formatRefundDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function reasonCategoryLabel(category: string): string {
  const map: Record<string, string> = {
    unused: 'Не использовал(а)',
    defect: 'Не работает / ошибка',
    other: 'Другое',
    unused_service: 'Не использовал(а)',
  };
  return map[category] ?? category;
}

export const REFUND_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: 'unused', label: reasonCategoryLabel('unused') },
  { value: 'defect', label: reasonCategoryLabel('defect') },
  { value: 'other', label: reasonCategoryLabel('other') },
];

export function unavailableReasonLabel(reason: string | null | undefined): string {
  if (!reason) return '';
  const map: Record<string, string> = {
    active_refund_request: 'Уже есть активная заявка',
    refund_completed: 'Возврат по покупке завершён',
    purchase_fully_refunded: 'Покупка уже полностью возвращена',
    purchase_refunded: 'Покупка уже возвращена',
  };
  return map[reason] ?? reason;
}

/** User-facing purchase line for refund list/detail (без Intent #). */
export function refundPurchaseTitle(input: {
  product_name?: string | null;
  product_type?: string | null;
}): string {
  const name = (input.product_name || '').trim();
  return name || 'Покупка';
}

export function refundPurchaseSubtitle(input: {
  product_type?: string | null;
  amount?: string | null;
  currency?: string | null;
}): string {
  const typeKey = (input.product_type || '').trim().toLowerCase();
  const typeLabel =
    typeKey === 'tariff' ? 'Тариф' : typeKey === 'addon' ? 'Доп. пакет' : typeKey || 'Покупка';
  const amount = (input.amount || '').trim();
  if (!amount) return typeLabel;
  const currency = (input.currency || 'RUB').toUpperCase() === 'RUB' ? '₽' : input.currency;
  return `${typeLabel} · ${amount} ${currency}`.trim();
}
