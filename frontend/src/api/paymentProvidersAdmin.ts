/**
 * Admin API: настройки платёжных провайдеров (Этап 6.9/6.10).
 * Секреты не передаются и не ожидаются.
 * Backend prefix: /api/admin/payment-providers (см. payment_provider_admin router).
 */
import api from './client';

/** Совпадает с backend APIRouter prefix. */
export const PAYMENT_PROVIDERS_API_PATH = '/api/admin/payment-providers';

export type PaymentProviderMode = 'test' | 'production';

export interface PaymentProviderAdmin {
  code: string;
  display_name: string;
  enabled: boolean;
  mode: PaymentProviderMode | string;
  currency: string;
  priority: number;
  is_default_for_new_payments: boolean;
  configured: boolean;
  readiness_status: string;
  missing_required_settings: string[];
  masked_identifiers: Record<string, string>;
  adapter_implemented: boolean;
  is_fake: boolean;
  last_health_check_at: string | null;
  last_health_check_status: string | null;
  last_health_check_message: string | null;
  last_webhook_status: string | null;
  last_webhook_at: string | null;
  updated_at: string;
}

export interface PaymentProviderUpdatePayload {
  display_name?: string;
  enabled?: boolean;
  mode?: PaymentProviderMode;
  currency?: string;
  priority?: number;
}

export interface PaymentProviderHealthResult {
  code: string;
  status: string;
  message: string;
  configured: boolean;
  readiness_status: string;
  checked_at: string;
  details: Record<string, unknown>;
}

export async function listPaymentProviders(): Promise<PaymentProviderAdmin[]> {
  return api.get(PAYMENT_PROVIDERS_API_PATH) as Promise<PaymentProviderAdmin[]>;
}

export async function getPaymentProvider(code: string): Promise<PaymentProviderAdmin> {
  return api.get(
    `${PAYMENT_PROVIDERS_API_PATH}/${encodeURIComponent(code)}`
  ) as Promise<PaymentProviderAdmin>;
}

export async function updatePaymentProvider(
  code: string,
  payload: PaymentProviderUpdatePayload
): Promise<PaymentProviderAdmin> {
  return api.patch(
    `${PAYMENT_PROVIDERS_API_PATH}/${encodeURIComponent(code)}`,
    payload
  ) as Promise<PaymentProviderAdmin>;
}

export async function setDefaultPaymentProvider(code: string): Promise<PaymentProviderAdmin> {
  return api.post(
    `${PAYMENT_PROVIDERS_API_PATH}/${encodeURIComponent(code)}/set-default`,
    {}
  ) as Promise<PaymentProviderAdmin>;
}

export async function healthCheckPaymentProvider(
  code: string
): Promise<PaymentProviderHealthResult> {
  return api.post(
    `${PAYMENT_PROVIDERS_API_PATH}/${encodeURIComponent(code)}/health-check`,
    {}
  ) as Promise<PaymentProviderHealthResult>;
}
