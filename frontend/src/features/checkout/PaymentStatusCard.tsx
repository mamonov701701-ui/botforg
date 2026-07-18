/**
 * Переиспользуемая карточка статуса оплаты (Этап 6.11.4).
 * Не показывает внутренние ID, provider codes, stack traces.
 */
import React, { useCallback, useState } from 'react';
import { cancelCheckoutPayment, safePaymentErrorMessage } from '@/api/checkoutPay';
import { toast } from '@/utils/toast';
import {
  canShowCancelButton,
  canShowRetryPayButton,
  paymentUiDescription,
  paymentUiTitle,
  resolvePaymentUiState,
  type PaymentUiState,
} from './paymentStatusDisplay';
import {
  DEFAULT_PAYMENT_POLL_INTERVAL_MS,
  usePaymentStatusPolling,
} from './usePaymentStatusPolling';

export interface PaymentStatusCardProps {
  intentId: number;
  enabled?: boolean;
  pollIntervalMs?: number;
  onRetryPay?: () => void;
  onCancelled?: () => void;
  className?: string;
}

const STATE_HINT: Record<PaymentUiState, string> = {
  awaiting_payment: 'Перейдите к оплате и завершите её в платёжной системе.',
  processing: 'Мы получили платёж и ждём подтверждение. Это обычно занимает несколько секунд.',
  paid: 'Доступ активирован. Можно пользоваться тарифом или пакетом.',
  cancelled: 'Для повторной оплаты создайте новый заказ.',
  failed: 'Оплата не завершена. При необходимости обратитесь в поддержку.',
  retryable: 'Можно начать оплату заново.',
};

export default function PaymentStatusCard({
  intentId,
  enabled = true,
  pollIntervalMs = DEFAULT_PAYMENT_POLL_INTERVAL_MS,
  onRetryPay,
  onCancelled,
  className,
}: PaymentStatusCardProps) {
  const { status, loading, error, isPolling, refresh } = usePaymentStatusPolling({
    intentId,
    enabled,
    intervalMs: pollIntervalMs,
  });

  const [cancelling, setCancelling] = useState(false);
  const cancelLockRef = React.useRef(false);

  const uiState = status ? resolvePaymentUiState(status) : 'awaiting_payment';
  const title = paymentUiTitle(uiState);
  const description = paymentUiDescription(status, uiState);
  const showCancel = canShowCancelButton(status);
  const showRetry = canShowRetryPayButton(status) && typeof onRetryPay === 'function';

  const handleCancel = useCallback(async () => {
    if (cancelLockRef.current || cancelling) return;
    cancelLockRef.current = true;
    setCancelling(true);
    try {
      const result = await cancelCheckoutPayment(intentId);
      toast.success(result.message || 'Оплата отменена');
      await refresh();
      onCancelled?.();
    } catch (err) {
      toast.error(safePaymentErrorMessage(err));
    } finally {
      cancelLockRef.current = false;
      setCancelling(false);
    }
  }, [cancelling, intentId, onCancelled, refresh]);

  return (
    <div
      className={className}
      data-testid="payment-status-card"
      style={{
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 12,
        padding: 16,
        background: 'var(--card, #fff)',
        color: 'var(--foreground, #111827)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div
            data-testid="payment-status-title"
            style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}
          >
            {title}
          </div>
          <div
            data-testid="payment-status-description"
            style={{ fontSize: 14, opacity: 0.9, lineHeight: 1.45 }}
          >
            {description}
          </div>
          <div style={{ fontSize: 13, opacity: 0.7, marginTop: 8 }}>{STATE_HINT[uiState]}</div>
          {status?.amount ? (
            <div
              data-testid="payment-status-amount"
              style={{ fontSize: 13, marginTop: 10, fontWeight: 500 }}
            >
              Сумма: {status.amount} {status.currency}
            </div>
          ) : null}
        </div>
        <div style={{ fontSize: 12, opacity: 0.65, whiteSpace: 'nowrap' }}>
          {loading || isPolling ? 'Обновляем…' : status?.is_final ? 'Готово' : null}
        </div>
      </div>

      {error ? (
        <div
          data-testid="payment-status-error"
          role="alert"
          style={{
            marginTop: 12,
            fontSize: 13,
            color: 'var(--danger, #b91c1c)',
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <button
          type="button"
          data-testid="payment-status-refresh"
          onClick={() => void refresh()}
          disabled={loading || cancelling}
          style={secondaryBtnStyle}
        >
          Проверить снова
        </button>

        {showCancel ? (
          <button
            type="button"
            data-testid="payment-status-cancel"
            onClick={() => void handleCancel()}
            disabled={cancelling || loading}
            style={dangerBtnStyle}
          >
            {cancelling ? 'Отменяем…' : 'Отменить оплату'}
          </button>
        ) : null}

        {showRetry ? (
          <button
            type="button"
            data-testid="payment-status-retry"
            onClick={() => onRetryPay?.()}
            disabled={cancelling}
            style={primaryBtnStyle}
          >
            Повторить оплату
          </button>
        ) : null}
      </div>
    </div>
  );
}

const secondaryBtnStyle: React.CSSProperties = {
  border: '1px solid var(--border, #d1d5db)',
  background: 'transparent',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  cursor: 'pointer',
};

const dangerBtnStyle: React.CSSProperties = {
  border: '1px solid #fecaca',
  background: '#fef2f2',
  color: '#991b1b',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  cursor: 'pointer',
};

const primaryBtnStyle: React.CSSProperties = {
  border: 'none',
  background: 'var(--primary, #2563eb)',
  color: '#fff',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  cursor: 'pointer',
};
