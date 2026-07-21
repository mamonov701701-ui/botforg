/**
 * Frontend API: создание CheckoutIntent и запуск оплаты (Этап 8.2.1).
 *
 * Status / cancel / polling — в `checkoutPay.ts` (этап 8.2.3).
 * Idempotency key передаёт вызывающая сторона — клиент его не генерирует.
 */
import { get, post } from './client';

export type CheckoutProductType = 'tariff' | 'addon';

/** Известные коды ошибок checkout (из backend detail.code). UI читает ApiError.code. */
export const CHECKOUT_ERROR_CODES = {
  productUnavailable: 'product_unavailable',
  productUnpriced: 'product_unpriced',
  legalLaunchNotReady: 'legal_launch_not_ready',
  intentNotFound: 'intent_not_found',
  intentNotPayable: 'intent_not_payable',
  intentAlreadyFulfilled: 'intent_already_fulfilled',
  intentAlreadyPaid: 'intent_already_paid',
  noDefaultConnection: 'no_default_connection',
  defaultConnectionNotReady: 'default_connection_not_ready',
  providerUnavailable: 'provider_unavailable',
  providerTimeout: 'provider_timeout',
  providerError: 'provider_error',
  providerMisconfigured: 'provider_misconfigured',
  idempotencyRequired: 'idempotency_required',
  invalidProductType: 'invalid_product_type',
} as const;

export interface CreateCheckoutIntentInput {
  product_type: CheckoutProductType;
  code: string;
  idempotency_key: string;
}

/** Соответствует backend CheckoutIntentOut. */
export interface CheckoutIntent {
  id: number;
  product_type: string;
  product_code: string;
  product_name: string;
  description: string | null;
  amount: string;
  currency: string;
  status: string;
  idempotency_key: string;
  payment_provider: string | null;
  provider_payment_id: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  failed_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  fulfilled_subscription_id: number | null;
  fulfilled_addon_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface StartCheckoutPaymentInput {
  idempotency_key: string;
  return_url?: string;
}

/** Соответствует backend PayOut. */
export interface StartCheckoutPaymentResult {
  intent_id: number;
  attempt_id: number;
  provider: string;
  provider_payment_id: string | null;
  confirmation_url: string | null;
  already_started: boolean;
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

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  return typeof value === 'string' ? value : String(value);
}

function asNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Decimal из JSON может быть number или string. */
function moneyStr(value: unknown, fallback = '0.00'): string {
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? `${value}.00` : String(value);
  }
  return fallback;
}

export function normalizeCheckoutIntent(raw: unknown): CheckoutIntent {
  const o = asRecord(raw) ?? {};
  return {
    id: asNumber(o.id),
    product_type: asString(o.product_type),
    product_code: asString(o.product_code),
    product_name: asString(o.product_name),
    description: o.description == null ? null : asString(o.description),
    amount: moneyStr(o.amount),
    currency: asString(o.currency, 'RUB'),
    status: asString(o.status),
    idempotency_key: asString(o.idempotency_key),
    payment_provider: asNullableString(o.payment_provider),
    provider_payment_id: asNullableString(o.provider_payment_id),
    paid_at: asNullableString(o.paid_at),
    fulfilled_at: asNullableString(o.fulfilled_at),
    failed_at: asNullableString(o.failed_at),
    cancelled_at: asNullableString(o.cancelled_at),
    refunded_at: asNullableString(o.refunded_at),
    fulfilled_subscription_id: asNullableNumber(o.fulfilled_subscription_id),
    fulfilled_addon_id: asNullableNumber(o.fulfilled_addon_id),
    created_at: asString(o.created_at),
    updated_at: asString(o.updated_at),
  };
}

export function normalizeStartCheckoutPaymentResult(raw: unknown): StartCheckoutPaymentResult {
  const o = asRecord(raw) ?? {};
  return {
    intent_id: asNumber(o.intent_id),
    attempt_id: asNumber(o.attempt_id),
    provider: asString(o.provider),
    provider_payment_id: asNullableString(o.provider_payment_id),
    confirmation_url: asNullableString(o.confirmation_url),
    already_started: asBool(o.already_started, false),
  };
}

/**
 * POST /me/checkout-intents
 * Тело: только product_type, code, idempotency_key (без цены/provider).
 */
export async function createCheckoutIntent(
  input: CreateCheckoutIntentInput
): Promise<CheckoutIntent> {
  const body = {
    product_type: input.product_type,
    code: input.code,
    idempotency_key: input.idempotency_key,
  };
  const raw = await post('/me/checkout-intents', body);
  return normalizeCheckoutIntent(raw);
}

/** GET /me/checkout-intents/{id} */
export async function getCheckoutIntent(intentId: number): Promise<CheckoutIntent> {
  const raw = await get(`/me/checkout-intents/${intentId}`);
  return normalizeCheckoutIntent(raw);
}

/**
 * POST /me/checkout-intents/{id}/pay
 * return_url только если передан в payload — клиент не подставляет скрытый default.
 */
export async function startCheckoutPayment(
  intentId: number,
  payload: StartCheckoutPaymentInput
): Promise<StartCheckoutPaymentResult> {
  const body: Record<string, string> = {
    idempotency_key: payload.idempotency_key,
  };
  if (payload.return_url != null && payload.return_url !== '') {
    body.return_url = payload.return_url;
  }
  const raw = await post(`/me/checkout-intents/${intentId}/pay`, body);
  return normalizeStartCheckoutPaymentResult(raw);
}
