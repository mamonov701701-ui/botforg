/**
 * Пользовательский API статуса и отмены оплаты CheckoutIntent (Этап 6.11.4).
 */
import { get, post, ApiError } from './client';

export type NormalizedPaymentStatus = 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'refunded';

export interface PaymentStatus {
  intent_id: number;
  intent_status: string;
  amount: string;
  currency: string;
  provider?: string | null;
  provider_payment_id?: string | null;
  confirmation_url?: string | null;
  attempt_status?: string | null;
  normalized_status: NormalizedPaymentStatus | string;
  is_final: boolean;
  can_retry: boolean;
  message: string;
}

export interface CancelPaymentResult {
  intent_id: number;
  intent_status: string;
  attempt_id?: number | null;
  attempt_status?: string | null;
  already_cancelled: boolean;
  message: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Нормализация ответа GET .../payment без технических extras. */
export function normalizePaymentStatus(raw: unknown): PaymentStatus {
  const o = asRecord(raw) ?? {};
  return {
    intent_id: asNumber(o.intent_id),
    intent_status: asString(o.intent_status),
    amount: asString(o.amount, '0.00'),
    currency: asString(o.currency, 'RUB'),
    provider: o.provider == null ? null : asString(o.provider),
    provider_payment_id: o.provider_payment_id == null ? null : asString(o.provider_payment_id),
    confirmation_url: o.confirmation_url == null ? null : asString(o.confirmation_url),
    attempt_status: o.attempt_status == null ? null : asString(o.attempt_status),
    normalized_status: asString(o.normalized_status, 'pending'),
    is_final: asBool(o.is_final, false),
    can_retry: asBool(o.can_retry, false),
    message: asString(o.message, 'Ожидает оплаты'),
  };
}

export function normalizeCancelResult(raw: unknown): CancelPaymentResult {
  const o = asRecord(raw) ?? {};
  return {
    intent_id: asNumber(o.intent_id),
    intent_status: asString(o.intent_status),
    attempt_id: o.attempt_id == null ? null : asNumber(o.attempt_id),
    attempt_status: o.attempt_status == null ? null : asString(o.attempt_status),
    already_cancelled: asBool(o.already_cancelled, false),
    message: asString(o.message, 'Оплата отменена'),
  };
}

export async function getCheckoutPaymentStatus(intentId: number): Promise<PaymentStatus> {
  const raw = await get(`/me/checkout-intents/${intentId}/payment`);
  return normalizePaymentStatus(raw);
}

export async function cancelCheckoutPayment(intentId: number): Promise<CancelPaymentResult> {
  const raw = await post(`/me/checkout-intents/${intentId}/cancel`);
  return normalizeCancelResult(raw);
}

/** Безопасное сообщение для UI: без stack/raw detail. */
export function safePaymentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const msg = (error.message || '').trim();
    if (msg && !msg.includes('Traceback') && !msg.includes('stack')) {
      return msg;
    }
    return 'Не удалось выполнить операцию. Попробуйте позже.';
  }
  if (error instanceof Error) {
    const msg = (error.message || '').trim();
    if (msg === 'Failed to fetch' || msg.toLowerCase().includes('network')) {
      return 'Нет связи с сервером. Проверьте интернет и попробуйте снова.';
    }
    if (msg.toLowerCase().includes('abort')) {
      return 'Превышено время ожидания. Попробуйте снова.';
    }
  }
  return 'Не удалось выполнить операцию. Попробуйте позже.';
}
