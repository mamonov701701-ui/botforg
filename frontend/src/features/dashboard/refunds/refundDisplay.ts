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
  approved: 'Одобрена',
  needs_information: 'Нужны дополнительные сведения',
  rejected: 'Отклонена',
  canceled: 'Отменена',
  calculation_failed: 'Ошибка расчёта',
  refund_processing: 'Обработка возврата',
  refunded: 'Средства возвращены',
  completed: 'Завершена',
};

const STATUS_HINTS: Record<string, string> = {
  manual_review_required:
    'Автоматический расчёт не определил сумму. Администратор рассмотрит заявку вручную.',
  needs_information:
    'Администратору нужны дополнительные сведения. Дополните комментарий через поддержку или дождитесь запроса.',
  rejected: 'Заявка отклонена. Возврат средств по этой заявке не выполняется.',
  approved: 'Заявка одобрена. Возврат средств ещё не выполнен — ожидает дальнейшей обработки.',
  canceled: 'Вы отменили эту заявку.',
  awaiting_admin_review: 'Заявка ожидает решения администратора.',
};

export const MANUAL_AMOUNT_LABEL = 'Сумма определяется администратором';

export function refundStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function refundStatusHint(status: string): string | null {
  return STATUS_HINTS[status] ?? null;
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
    purchase_refunded: 'Покупка уже возвращена',
  };
  return map[reason] ?? reason;
}
