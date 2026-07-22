/**
 * Возврат после YooKassa: статус, polling, cancel, retry (Этап 8.2.3).
 */
import React, { useCallback, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { startCheckoutPayment } from '@/api/checkout';
import type { PaymentStatus } from '@/api/checkoutPay';
import PaymentStatusCard from '@/features/checkout/PaymentStatusCard';
import {
  buildCheckoutIdempotencyKey,
  buildCheckoutReturnUrl,
  checkoutErrorMessage,
} from '@/features/checkout/checkoutUi';
import { resolvePaymentUiState } from '@/features/checkout/paymentStatusDisplay';
import './Checkout.css';

function parseIntentId(raw: string | null): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function CheckoutReturnPage() {
  const [params] = useSearchParams();
  const intentId = parseIntentId(params.get('intent'));

  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const retryLockRef = useRef(false);

  const uiState = paymentStatus ? resolvePaymentUiState(paymentStatus) : null;
  const isPaid = uiState === 'paid';
  const isCancelled = uiState === 'cancelled';

  const handleRetryPay = useCallback(async () => {
    if (intentId == null || retryLockRef.current || retrying) return;
    retryLockRef.current = true;
    setRetrying(true);
    setRetryError(null);
    try {
      const payKey = buildCheckoutIdempotencyKey(`retry-pay-${intentId}`);
      const returnUrl = buildCheckoutReturnUrl(intentId);
      const pay = await startCheckoutPayment(intentId, {
        idempotency_key: payKey,
        return_url: returnUrl,
      });
      const url = (pay.confirmation_url || '').trim();
      if (!url) {
        setRetryError(
          'Не удалось получить ссылку на оплату. Попробуйте ещё раз или обратитесь в поддержку.'
        );
        return;
      }
      window.location.assign(url);
    } catch (err) {
      setRetryError(checkoutErrorMessage(err));
    } finally {
      retryLockRef.current = false;
      setRetrying(false);
    }
  }, [intentId, retrying]);

  return (
    <div className="checkout-page" data-testid="checkout-return-page">
      <header className="checkout-header">
        <p className="checkout-eyebrow">Оплата</p>
        <h1 className="checkout-title">{isPaid ? 'Оплата прошла успешно' : 'Статус оплаты'}</h1>
        <p className="checkout-subtitle">
          {intentId == null
            ? 'Не удалось определить заказ. Вернитесь к тарифам или откройте финансы в кабинете.'
            : isPaid
              ? 'Тариф активирован. Актуальные лимиты подгрузятся при переходе в кабинет.'
              : 'Статус обновляется автоматически — страницу обновлять вручную не нужно.'}
        </p>
      </header>

      {intentId == null ? (
        <section className="checkout-card">
          <div
            className="checkout-alert checkout-alert--error"
            data-testid="checkout-return-missing-intent"
            role="alert"
          >
            Не указан или некорректен номер заказа. Polling статуса не запускается.
          </div>
          <div className="checkout-actions">
            <Link to="/pricing" className="checkout-btn checkout-btn--primary">
              К тарифам
            </Link>
            <Link to="/dashboard/finance" className="checkout-btn checkout-btn--ghost">
              Финансы и лимиты
            </Link>
          </div>
        </section>
      ) : (
        <section className="checkout-card checkout-return-card">
          <p className="checkout-meta" data-testid="checkout-return-intent">
            Заказ №{intentId}
          </p>

          <PaymentStatusCard
            intentId={intentId}
            className="checkout-payment-status"
            onStatusChange={setPaymentStatus}
            onRetryPay={() => {
              void handleRetryPay();
            }}
          />

          {retrying ? (
            <p className="checkout-meta" data-testid="checkout-return-retrying">
              Повторяем оплату…
            </p>
          ) : null}

          {retryError ? (
            <div
              className="checkout-alert checkout-alert--error"
              data-testid="checkout-return-retry-error"
              role="alert"
            >
              {retryError}
            </div>
          ) : null}

          {isCancelled ? (
            <div className="checkout-alert" data-testid="checkout-return-cancelled-hint">
              Оплата отменена. Вы можете выбрать тариф снова на странице тарифов.
            </div>
          ) : null}

          <div className="checkout-actions">
            {isPaid ? (
              <>
                <Link
                  to="/dashboard/finance"
                  className="checkout-btn checkout-btn--primary"
                  data-testid="checkout-return-to-finance"
                >
                  Финансы и лимиты
                </Link>
                <Link
                  to="/pricing"
                  className="checkout-btn checkout-btn--ghost"
                  data-testid="checkout-return-to-pricing"
                >
                  Тарифы
                </Link>
              </>
            ) : isCancelled ? (
              <Link
                to="/pricing"
                className="checkout-btn checkout-btn--primary"
                data-testid="checkout-return-to-pricing"
              >
                Вернуться к тарифам
              </Link>
            ) : (
              <>
                <Link to="/dashboard/finance" className="checkout-btn checkout-btn--ghost">
                  Финансы и лимиты
                </Link>
                <Link to="/pricing" className="checkout-btn checkout-btn--ghost">
                  К тарифам
                </Link>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
