/**
 * Пользовательский refund API (Этап 6.14.4.2 / 6.14.4).
 */
import { get, post, ApiError } from './client';

export interface RefundStatusHistoryItem {
  id: number;
  occurred_at: string;
  title: string;
  description: string;
  category: string;
  status: string | null;
}

export interface RefundRequest {
  id: number;
  checkout_intent_id: number;
  payment_attempt_id: number;
  status: string;
  reason_category: string;
  user_comment: string | null;
  current_revision_number: number;
  version: number;
  recommended_refund_amount: string | null;
  currency: string | null;
  refund_type: string | null;
  calculation_status: string | null;
  proposed_amount_undefined: boolean;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  completed_at: string | null;
  /** 6.14.10A — только detail; list обычно []. */
  status_history: RefundStatusHistoryItem[];
  public_decision_message: string | null;
  /** 8.3.5 — покупка для user UI. */
  product_type: string | null;
  product_code: string | null;
  product_name: string | null;
  amount: string | null;
  paid_at: string | null;
}

export interface RefundablePurchase {
  checkout_intent_id: number;
  payment_attempt_id: number;
  product_type: string;
  product_code: string;
  product_name: string;
  amount: string;
  currency: string;
  paid_at: string | null;
  current_refund_status: string | null;
  current_refund_request_id: number | null;
  can_request_refund: boolean;
  unavailable_reason: string | null;
}

export interface RefundablePurchaseList {
  items: RefundablePurchase[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateRefundInput {
  checkout_intent_id: number;
  payment_attempt_id?: number | null;
  reason_category: string;
  idempotency_key: string;
  user_comment?: string | null;
}

export interface CancelRefundInput {
  expected_version: number;
  reason?: string | null;
}

export interface ProvideRefundInformationInput {
  message: string;
  expected_version: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Нормализация ответа refund API (суммы — строки или null). */
export function normalizeRefundRequest(raw: unknown): RefundRequest {
  const o = asRecord(raw) ?? {};
  const amountRaw = o.recommended_refund_amount;
  let recommended: string | null = null;
  if (typeof amountRaw === 'string') {
    recommended = amountRaw;
  } else if (typeof amountRaw === 'number' && Number.isFinite(amountRaw)) {
    recommended = amountRaw.toFixed(2);
  }

  const historyRaw = Array.isArray(o.status_history) ? o.status_history : [];
  const status_history: RefundStatusHistoryItem[] = historyRaw.map(row => {
    const h = asRecord(row) ?? {};
    return {
      id: asNumber(h.id),
      occurred_at: asString(h.occurred_at),
      title: asString(h.title),
      description: asString(h.description),
      category: asString(h.category),
      status: asNullableString(h.status),
    };
  });

  return {
    id: asNumber(o.id),
    checkout_intent_id: asNumber(o.checkout_intent_id),
    payment_attempt_id: asNumber(o.payment_attempt_id),
    status: asString(o.status),
    reason_category: asString(o.reason_category),
    user_comment: asNullableString(o.user_comment),
    current_revision_number: asNumber(o.current_revision_number),
    version: asNumber(o.version, 1),
    recommended_refund_amount: recommended,
    currency: asNullableString(o.currency),
    refund_type: asNullableString(o.refund_type),
    calculation_status: asNullableString(o.calculation_status),
    proposed_amount_undefined: asBool(o.proposed_amount_undefined, false),
    created_at: asString(o.created_at),
    updated_at: asString(o.updated_at),
    submitted_at: asString(o.submitted_at),
    completed_at: asNullableString(o.completed_at),
    status_history,
    public_decision_message: asNullableString(o.public_decision_message),
    product_type: asNullableString(o.product_type),
    product_code: asNullableString(o.product_code),
    product_name: asNullableString(o.product_name),
    amount: asNullableString(o.amount),
    paid_at: asNullableString(o.paid_at),
  };
}

export function normalizeRefundablePurchase(raw: unknown): RefundablePurchase {
  const o = asRecord(raw) ?? {};
  const amountRaw = o.amount;
  let amount = '0.00';
  if (typeof amountRaw === 'string') {
    amount = amountRaw;
  } else if (typeof amountRaw === 'number' && Number.isFinite(amountRaw)) {
    amount = amountRaw.toFixed(2);
  }
  return {
    checkout_intent_id: asNumber(o.checkout_intent_id),
    payment_attempt_id: asNumber(o.payment_attempt_id),
    product_type: asString(o.product_type),
    product_code: asString(o.product_code),
    product_name: asString(o.product_name),
    amount,
    currency: asString(o.currency, 'RUB'),
    paid_at: asNullableString(o.paid_at),
    current_refund_status: asNullableString(o.current_refund_status),
    current_refund_request_id: asNullableNumber(o.current_refund_request_id),
    can_request_refund: asBool(o.can_request_refund, false),
    unavailable_reason: asNullableString(o.unavailable_reason),
  };
}

export async function listMyRefundRequests(): Promise<RefundRequest[]> {
  const raw = await get('/me/refund-requests');
  const rows = Array.isArray(raw) ? raw : [];
  return rows.map(normalizeRefundRequest);
}

export async function listMyRefundablePurchases(params?: {
  limit?: number;
  offset?: number;
}): Promise<RefundablePurchaseList> {
  const limit = params?.limit ?? 50;
  const offset = params?.offset ?? 0;
  const raw = await get(`/me/refundable-purchases?limit=${limit}&offset=${offset}`);
  const o = asRecord(raw) ?? {};
  const itemsRaw = Array.isArray(o.items) ? o.items : [];
  return {
    items: itemsRaw.map(normalizeRefundablePurchase),
    total: asNumber(o.total),
    limit: asNumber(o.limit, limit),
    offset: asNumber(o.offset, offset),
  };
}

export async function getMyRefundRequest(id: number): Promise<RefundRequest> {
  const raw = await get(`/me/refund-requests/${id}`);
  return normalizeRefundRequest(raw);
}

export async function createMyRefundRequest(body: CreateRefundInput): Promise<RefundRequest> {
  const raw = await post('/me/refund-requests', {
    checkout_intent_id: body.checkout_intent_id,
    payment_attempt_id: body.payment_attempt_id ?? null,
    reason_category: body.reason_category,
    idempotency_key: body.idempotency_key,
    user_comment: body.user_comment ?? null,
  });
  return normalizeRefundRequest(raw);
}

export async function cancelMyRefundRequest(
  id: number,
  body: CancelRefundInput
): Promise<RefundRequest> {
  const raw = await post(`/me/refund-requests/${id}/cancel`, {
    expected_version: body.expected_version,
    reason: body.reason ?? null,
  });
  return normalizeRefundRequest(raw);
}

export async function provideRefundInformation(
  id: number,
  body: ProvideRefundInformationInput
): Promise<RefundRequest> {
  const raw = await post(`/me/refund-requests/${id}/provide-information`, {
    message: body.message,
    expected_version: body.expected_version,
  });
  return normalizeRefundRequest(raw);
}

export function safeRefundErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return 'Требуется вход в аккаунт. Обновите страницу или войдите снова.';
    }
    if (err.status === 403) {
      return 'Недостаточно прав для этого действия.';
    }
    if (err.status === 404) {
      if (err.code === 'request_not_found') {
        return 'Заявка на возврат не найдена.';
      }
      return 'Не удалось загрузить данные. Обновите страницу или попробуйте позже.';
    }
    if (err.status === 409) {
      if (err.code === 'duplicate_open_request') {
        return 'По этой покупке уже есть активная заявка на возврат.';
      }
      if (err.code === 'version_conflict') {
        return 'Заявка уже была изменена. Данные обновлены.';
      }
      if (err.code === 'invalid_status_for_reply') {
        return 'Дополнительные сведения больше не требуются. Данные обновлены.';
      }
      if (err.code === 'request_terminal' || err.code === 'approved_terminal') {
        return 'Эту заявку уже нельзя отменить.';
      }
      return 'Заявка уже была изменена. Данные обновлены.';
    }
    if (err.status === 422) {
      if (err.code === 'message_required' || err.code === 'message_too_long') {
        return 'Проверьте текст ответа: он должен быть от 1 до 2000 символов.';
      }
      return 'Проверьте введённые данные и попробуйте снова.';
    }
    if (err.code === 'version_conflict') {
      return 'Заявка уже была изменена. Данные обновлены.';
    }
    if (err.code === 'request_terminal' || err.code === 'approved_terminal') {
      return 'Эту заявку уже нельзя отменить.';
    }
    if (err.code === 'duplicate_open_request') {
      return 'По этой покупке уже есть активная заявка на возврат.';
    }
    if (err.code === 'reason_required') {
      return 'Выберите причину возврата.';
    }
    if (err.message && err.message.trim() && !/^[{[]/.test(err.message.trim())) {
      return err.message;
    }
  }
  if (err instanceof Error && /failed to fetch|network|abort/i.test(err.message)) {
    return 'Нет связи с сервером. Проверьте интернет и попробуйте снова.';
  }
  return 'Не удалось выполнить действие. Попробуйте позже.';
}
