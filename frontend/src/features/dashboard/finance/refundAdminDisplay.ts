/**
 * Админские подписи и доступность действий по возвратам (6.14.4).
 */
import {
  MANUAL_AMOUNT_LABEL,
  formatRecommendedRefundAmount,
  formatRefundDate,
  reasonCategoryLabel,
  refundStatusLabel,
} from '../refunds/refundDisplay';

export {
  MANUAL_AMOUNT_LABEL,
  formatRecommendedRefundAmount,
  formatRefundDate,
  reasonCategoryLabel,
  refundStatusLabel,
};

export const ADMIN_APPROVED_NOTICE = 'Заявка одобрена, выплата ещё не выполнена';

export const ADMIN_NO_MONEY_MOVED =
  'Денежный возврат через платёжного провайдера на этом этапе не выполняется.';

export const ADMIN_STAGE_NO_PAYOUT =
  'На этом этапе одобрение не выполняет денежный возврат и не изменяет тариф или пакет.';

export const MANUAL_REVIEW_GUIDANCE =
  'Автоматически определить сумму возврата не удалось. Администратор должен указать сумму и основание.';

export const SET_REFUND_AMOUNT_LABEL = 'Указать сумму возврата';
export const CONFIRM_CALC_LABEL = 'Подтвердить расчёт';
export const APPROVE_REQUEST_LABEL = 'Одобрить заявку';

const RECALC_STATUSES = new Set([
  'awaiting_admin_review',
  'manual_review_required',
  'admin_edited',
  'needs_information',
  'awaiting_final_confirmation',
  'calculation_failed',
]);

const EDIT_STATUSES = new Set([
  'awaiting_admin_review',
  'manual_review_required',
  'admin_edited',
  'needs_information',
  'awaiting_final_confirmation',
]);

const NEEDS_INFO_STATUSES = new Set([
  'awaiting_admin_review',
  'manual_review_required',
  'admin_edited',
  'awaiting_final_confirmation',
  'calculation_failed',
]);

const REJECT_STATUSES = new Set([
  'submitted',
  'calculating',
  'awaiting_admin_review',
  'manual_review_required',
  'admin_edited',
  'needs_information',
  'awaiting_final_confirmation',
  'calculation_failed',
]);

const TERMINAL = new Set(['completed', 'rejected', 'canceled', 'approved']);

export function canAdminRecalculate(status: string): boolean {
  return RECALC_STATUSES.has(status);
}

export function canAdminCreateRevision(status: string): boolean {
  return EDIT_STATUSES.has(status);
}

export function canAdminNeedsInformation(status: string): boolean {
  return NEEDS_INFO_STATUSES.has(status);
}

export function canAdminReject(status: string): boolean {
  return REJECT_STATUSES.has(status) && !TERMINAL.has(status);
}

export function canAdminConfirm(status: string): boolean {
  return status === 'admin_edited';
}

export function canAdminApprove(status: string): boolean {
  return status === 'awaiting_admin_review' || status === 'awaiting_final_confirmation';
}

export function adminStatusHint(status: string): string | null {
  if (status === 'approved') return ADMIN_APPROVED_NOTICE;
  if (status === 'manual_review_required') {
    return MANUAL_REVIEW_GUIDANCE;
  }
  if (status === 'awaiting_final_confirmation') {
    return 'Ожидает финального подтверждения перед одобрением.';
  }
  if (status === 'admin_edited') {
    return 'Сумма скорректирована. Подтвердите расчёт, чтобы перейти к одобрению.';
  }
  return null;
}

export type NextAdminStep = {
  primaryAction: 'revision' | 'confirm' | 'approve' | null;
  primaryLabel: string | null;
  nextActionText: string;
  statusNote: string | null;
  blockedNotes: string[];
};

/**
 * Следующий шаг workflow для admin UI (без изменения backend).
 */
export function resolveNextAdminStep(
  status: string,
  options?: { manualReviewRequired?: boolean }
): NextAdminStep {
  const manual = Boolean(options?.manualReviewRequired) || status === 'manual_review_required';

  if (status === 'approved' || status === 'completed' || status === 'refunded') {
    return {
      primaryAction: null,
      primaryLabel: null,
      nextActionText: ADMIN_APPROVED_NOTICE,
      statusNote: ADMIN_APPROVED_NOTICE,
      blockedNotes: [],
    };
  }
  if (status === 'rejected' || status === 'canceled') {
    return {
      primaryAction: null,
      primaryLabel: null,
      nextActionText: 'Заявка закрыта — дальнейшие действия не требуются',
      statusNote: null,
      blockedNotes: [],
    };
  }
  if (manual || status === 'manual_review_required') {
    return {
      primaryAction: 'revision',
      primaryLabel: SET_REFUND_AMOUNT_LABEL,
      nextActionText: SET_REFUND_AMOUNT_LABEL,
      statusNote: MANUAL_REVIEW_GUIDANCE,
      blockedNotes: [
        'Одобрение недоступно: сначала укажите сумму возврата.',
        'Подтверждение расчёта недоступно: сначала укажите сумму.',
      ],
    };
  }
  if (status === 'admin_edited') {
    return {
      primaryAction: 'confirm',
      primaryLabel: CONFIRM_CALC_LABEL,
      nextActionText: CONFIRM_CALC_LABEL,
      statusNote: 'После корректировки подтвердите расчёт.',
      blockedNotes: ['Одобрение недоступно: сначала подтвердите расчёт.'],
    };
  }
  if (status === 'awaiting_final_confirmation' || status === 'awaiting_admin_review') {
    return {
      primaryAction: 'approve',
      primaryLabel: APPROVE_REQUEST_LABEL,
      nextActionText: APPROVE_REQUEST_LABEL,
      statusNote:
        status === 'awaiting_final_confirmation'
          ? 'Расчёт подтверждён. Можно одобрить заявку.'
          : 'Автоматический расчёт готов. Можно одобрить заявку.',
      blockedNotes: [],
    };
  }
  if (status === 'needs_information') {
    return {
      primaryAction: 'revision',
      primaryLabel: SET_REFUND_AMOUNT_LABEL,
      nextActionText: 'Дождитесь сведений или скорректируйте сумму',
      statusNote: 'Запрошены дополнительные сведения у пользователя.',
      blockedNotes: ['Одобрение недоступно: нужны дополнительные сведения или новая сумма.'],
    };
  }
  return {
    primaryAction: null,
    primaryLabel: null,
    nextActionText: 'Ожидание обработки',
    statusNote: adminStatusHint(status),
    blockedNotes: [],
  };
}

export function revisionTypeLabel(type: string): string {
  if (type === 'automatic') return 'Автоматическая';
  if (type === 'admin') return 'Административная';
  return type;
}

export function actorTypeLabel(actor: string): string {
  const map: Record<string, string> = {
    system: 'Система',
    admin: 'Администратор',
    user: 'Пользователь',
  };
  return map[actor] ?? actor;
}

export function auditActionLabel(action: string): string {
  const map: Record<string, string> = {
    created: 'Создана',
    status_changed: 'Смена статуса',
    recalculated: 'Пересчёт',
    revision_created: 'Создан новый расчёт',
    admin_edited: 'Правка администратора',
    needs_information: 'Запрос сведений',
    user_information_provided: 'Пользователь предоставил дополнительную информацию',
    rejected: 'Отклонена',
    confirmed: 'Подтверждена',
    approved: 'Одобрена',
  };
  return map[action] ?? action;
}

export function calculationStatusLabel(status: string): string {
  const map: Record<string, string> = {
    ok: 'Готово',
    success: 'Готово',
    pending: 'В ожидании',
    failed: 'Ошибка',
    error: 'Ошибка',
    manual: 'Требуется ручная проверка',
    manual_required: 'Требуется ручная проверка',
    deferred: 'Отложен',
  };
  return map[status] ?? (status ? 'Статус расчёта обновлён' : '—');
}

export function productTypeLabel(type: string): string {
  const map: Record<string, string> = {
    addon: 'Пакет',
    tariff: 'Тариф',
    plan: 'Тариф',
    subscription: 'Подписка',
  };
  return map[type] ?? type;
}

export function paymentStatusLabel(status: string): string {
  const map: Record<string, string> = {
    succeeded: 'Успешно',
    success: 'Успешно',
    pending: 'В ожидании',
    failed: 'Ошибка',
    cancelled: 'Отменён',
    canceled: 'Отменён',
    refunded: 'Возвращён',
  };
  return map[status] ?? status;
}

export function checkoutStatusLabel(status: string): string {
  const map: Record<string, string> = {
    fulfilled: 'Оплачен и выполнен',
    paid: 'Оплачен',
    pending: 'В ожидании',
    created: 'Создан',
    failed: 'Ошибка',
    canceled: 'Отменён',
    cancelled: 'Отменён',
    expired: 'Истёк',
  };
  return map[status] ?? status;
}

export function providerLabel(provider: string | null | undefined): string {
  if (!provider) return '—';
  const map: Record<string, string> = {
    yookassa: 'ЮKassa',
    fake: 'Тестовый провайдер',
    stripe: 'Stripe',
    cloudpayments: 'CloudPayments',
  };
  return map[provider] ?? provider;
}

export function yesNoRu(value: boolean): string {
  return value ? 'Да' : 'Нет';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function isZeroMoney(amount: string | null | undefined): boolean {
  if (amount == null || amount === '') return false;
  const n = Number(String(amount).replace(',', '.'));
  return Number.isFinite(n) && n === 0;
}

export function formatMoneyAmount(
  amount: string | null | undefined,
  currency?: string | null
): string {
  if (amount == null || amount === '') return '—';
  const cur = (currency || 'RUB').toUpperCase() === 'RUB' ? '₽' : currency || '';
  return `${amount} ${cur}`.trim();
}

/**
 * Рекомендуемая сумма для admin UI.
 * Не показывает технический 0.00 / пустое значение как «рекомендацию».
 */
export function formatRecommendedOrManual(
  amount: string | null | undefined,
  options?: {
    proposedAmountUndefined?: boolean;
    manualReviewRequired?: boolean;
    currency?: string | null;
  }
): string {
  if (options?.proposedAmountUndefined || options?.manualReviewRequired) {
    return MANUAL_AMOUNT_LABEL;
  }
  if (amount == null || amount === '' || isZeroMoney(amount)) {
    return MANUAL_AMOUNT_LABEL;
  }
  return formatRecommendedRefundAmount(amount, {
    proposedAmountUndefined: false,
    currency: options?.currency,
  });
}

export type UsageDisplay = {
  messagesUsed: number;
  activeBots: number;
  teamMembers: number;
  activityAfterPurchase: boolean | null;
  hasData: boolean;
};

export function parseUsageDisplay(snap: Record<string, unknown> | null | undefined): UsageDisplay {
  const empty: UsageDisplay = {
    messagesUsed: 0,
    activeBots: 0,
    teamMembers: 0,
    activityAfterPurchase: null,
    hasData: false,
  };
  if (!snap || Object.keys(snap).length === 0) return empty;

  const messagesUsed = asNumber(snap.messages_used_total ?? snap.messages_used ?? snap.used, 0);
  const activeBots = asNumber(snap.active_bots_used_total ?? snap.active_bots_used, 0);
  const teamMembers = asNumber(snap.team_members_used_total ?? snap.team_members_used, 0);

  let activity: boolean | null = null;
  if (typeof snap.detectable_pool_usage_after_purchase === 'boolean') {
    activity = snap.detectable_pool_usage_after_purchase;
  } else if (Array.isArray(snap.counters)) {
    activity = snap.counters.some(item => {
      const row = asRecord(item);
      return row?.post_purchase_activity_heuristic === true;
    });
  }

  return {
    messagesUsed,
    activeBots,
    teamMembers,
    activityAfterPurchase: activity,
    hasData: true,
  };
}

export type RefundCalcDisplay = {
  paid: string | null;
  alreadyRefunded: string | null;
  reserved: string | null;
  available: string | null;
  recommended: string | null;
  currency: string | null;
  hasData: boolean;
};

export function parseRefundCalcDisplay(
  financial: Record<string, unknown> | null | undefined,
  revision?: {
    paid_amount?: string | null;
    prior_refunded_amount?: string | null;
    proposed_refund_amount?: string | null;
    currency?: string | null;
  } | null
): RefundCalcDisplay {
  const ledger = asRecord(financial?.ledger_balance) ?? financial ?? null;
  const currency =
    revision?.currency ??
    asString(financial?.currency) ??
    asString(ledger && 'currency' in ledger ? ledger.currency : null) ??
    'RUB';

  const paid =
    asString(ledger?.paid_amount) ??
    asString(financial?.paid_amount) ??
    asString(financial?.paid) ??
    revision?.paid_amount ??
    null;
  const alreadyRefunded =
    asString(ledger?.confirmed_refunded_amount) ??
    asString(financial?.confirmed_refunded_amount) ??
    revision?.prior_refunded_amount ??
    null;
  const reserved =
    asString(ledger?.active_reserved_amount) ?? asString(financial?.active_reserved_amount) ?? null;
  const available =
    asString(ledger?.refundable_available_amount) ??
    asString(financial?.refundable_available_amount) ??
    null;
  const recommended =
    asString(financial?.admin_proposed_refund_amount) ??
    revision?.proposed_refund_amount ??
    asString(financial?.proposed_refund_amount) ??
    null;

  const hasData = Boolean(
    paid || alreadyRefunded || reserved || available || recommended || financial
  );

  return {
    paid,
    alreadyRefunded,
    reserved,
    available,
    recommended,
    currency,
    hasData,
  };
}

export function extractInputFingerprint(
  financial: Record<string, unknown> | null | undefined,
  revisionCalc?: Record<string, unknown> | null
): string | null {
  return (
    asString(financial?.input_fingerprint) ?? asString(revisionCalc?.input_fingerprint) ?? null
  );
}

export function formatSnapshotJson(snap: Record<string, unknown> | null | undefined): string {
  if (!snap || Object.keys(snap).length === 0) return 'Нет данных';
  try {
    return JSON.stringify(snap, null, 2);
  } catch {
    return 'Нет данных';
  }
}

export function formatAuditDecisionLine(event: {
  created_at: string;
  action: string;
  title?: string | null;
  actor_type: string;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
  details?: Record<string, unknown> | null;
  event_metadata?: unknown;
}): string {
  const title = (event.title || '').trim() || auditActionLabel(event.action);
  const parts = [formatRefundDate(event.created_at), title, actorTypeLabel(event.actor_type)];
  if (event.previous_status || event.new_status) {
    parts.push(
      `${event.previous_status ? refundStatusLabel(event.previous_status) : '—'} → ${
        event.new_status ? refundStatusLabel(event.new_status) : '—'
      }`
    );
  }
  // Многострочный ответ пользователя показываем отдельно в UI.
  if (event.action !== 'user_information_provided' && event.reason) {
    parts.push(event.reason);
  }
  return parts.join(' · ');
}

export function isUserInformationProvidedAudit(action: string): boolean {
  return action === 'user_information_provided';
}

/** Разрешённые admin details для отображения (whitelist). */
export function formatAuditAllowedDetails(
  details: Record<string, unknown> | null | undefined
): string | null {
  if (!details || typeof details !== 'object') return null;
  const allowed = [
    'outcome',
    'error_code',
    'provider_refund_id',
    'applied_action',
    'entitlement_action',
    'addon_revoke_units',
    'units',
    'revision_number',
    'revision_id',
    'refund_revision_id',
    'proposed_refund_amount',
    'final_refund_amount',
    'recovery',
    'retry',
    'note',
  ] as const;
  const labels: Record<string, string> = {
    outcome: 'Исход',
    error_code: 'Код ошибки',
    provider_refund_id: 'ID возврата провайдера',
    applied_action: 'Действие entitlement',
    entitlement_action: 'Entitlement',
    addon_revoke_units: 'Единицы',
    units: 'Единицы',
    revision_number: 'Ревизия',
    revision_id: 'ID ревизии',
    refund_revision_id: 'ID ревизии',
    proposed_refund_amount: 'Сумма',
    final_refund_amount: 'Итоговая сумма',
    recovery: 'Recovery',
    retry: 'Retry',
    note: 'Заметка',
  };
  const chunks: string[] = [];
  for (const key of allowed) {
    if (!(key in details)) continue;
    const val = details[key];
    if (val === null || val === undefined || val === '') continue;
    if (typeof val === 'object') continue;
    chunks.push(`${labels[key] || key}: ${String(val)}`);
  }
  return chunks.length ? chunks.join(' · ') : null;
}

export const ADMIN_STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Все статусы' },
  { value: 'awaiting_admin_review', label: refundStatusLabel('awaiting_admin_review') },
  { value: 'manual_review_required', label: refundStatusLabel('manual_review_required') },
  { value: 'admin_edited', label: refundStatusLabel('admin_edited') },
  { value: 'needs_information', label: refundStatusLabel('needs_information') },
  { value: 'awaiting_final_confirmation', label: refundStatusLabel('awaiting_final_confirmation') },
  { value: 'approved', label: refundStatusLabel('approved') },
  { value: 'rejected', label: refundStatusLabel('rejected') },
  { value: 'canceled', label: refundStatusLabel('canceled') },
];

export const ADMIN_REASON_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Все причины' },
  { value: 'unused', label: reasonCategoryLabel('unused') },
  { value: 'defect', label: reasonCategoryLabel('defect') },
  { value: 'other', label: reasonCategoryLabel('other') },
];

export const ADMIN_MANUAL_REVIEW_FILTER_OPTIONS: {
  value: 'all' | 'yes' | 'no';
  label: string;
}[] = [
  { value: 'all', label: 'Все заявки' },
  { value: 'yes', label: 'Требуется ручная проверка' },
  { value: 'no', label: 'Ручная проверка не требуется' },
];

export const ADJUSTMENT_REASON_OPTIONS: { value: string; label: string }[] = [
  { value: 'policy', label: 'Политика возвратов' },
  { value: 'goodwill', label: 'Жест доброй воли' },
  { value: 'usage_correction', label: 'Коррекция по использованию' },
  { value: 'other', label: 'Другое' },
];
