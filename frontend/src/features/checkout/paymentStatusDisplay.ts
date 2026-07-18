/**
 * Пользовательские состояния оплаты (Этап 6.11.4).
 * Без provider codes, внутренних ID и технических деталей.
 */
import type { PaymentStatus } from '@/api/checkoutPay';

export type PaymentUiState =
  | 'awaiting_payment'
  | 'processing'
  | 'paid'
  | 'cancelled'
  | 'failed'
  | 'retryable';

const TITLES: Record<PaymentUiState, string> = {
  awaiting_payment: 'Ожидает оплаты',
  processing: 'Подтверждение обрабатывается',
  paid: 'Оплачено и активировано',
  cancelled: 'Платёж отменён',
  failed: 'Ошибка оплаты',
  retryable: 'Можно повторить оплату',
};

const OPEN_ATTEMPT = new Set(['created', 'pending']);

export function resolvePaymentUiState(status: PaymentStatus): PaymentUiState {
  const intent = (status.intent_status || '').toLowerCase();
  const normalized = (status.normalized_status || '').toLowerCase();
  const attempt = (status.attempt_status || '').toLowerCase();

  if (intent === 'fulfilled' || intent === 'paid' || normalized === 'succeeded') {
    return 'paid';
  }

  if (
    intent === 'cancelled' ||
    (normalized === 'cancelled' && status.is_final && !status.can_retry)
  ) {
    return 'cancelled';
  }

  if (
    status.can_retry &&
    (normalized === 'failed' ||
      normalized === 'cancelled' ||
      attempt === 'failed' ||
      attempt === 'cancelled')
  ) {
    return 'retryable';
  }

  if (intent === 'failed' || (normalized === 'failed' && status.is_final)) {
    return 'failed';
  }

  if (!status.is_final && attempt && OPEN_ATTEMPT.has(attempt)) {
    return 'processing';
  }

  if (!status.is_final) {
    return 'awaiting_payment';
  }

  return 'failed';
}

export function paymentUiTitle(state: PaymentUiState): string {
  return TITLES[state];
}

/** Текст для пользователя: API message, иначе заголовок состояния. */
export function paymentUiDescription(status: PaymentStatus | null, state: PaymentUiState): string {
  const fromApi = (status?.message || '').trim();
  if (fromApi) return fromApi;
  return TITLES[state];
}

/**
 * Кнопка отмены — только если контракт API допускает cancel:
 * intent pending или awaiting_payment.
 */
export function canShowCancelButton(status: PaymentStatus | null): boolean {
  if (!status || status.is_final) return false;
  const intent = (status.intent_status || '').toLowerCase();
  return intent === 'pending' || intent === 'awaiting_payment';
}

export function canShowRetryPayButton(status: PaymentStatus | null): boolean {
  if (!status) return false;
  return status.can_retry === true;
}
