/**
 * Детальная страница покупки + PaymentStatusCard (Этап 8.3.3 / 8.3.5 compact).
 * Без нового payment workflow: getCheckoutIntent + checkoutPay + PaymentStatusCard.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { ApiError } from '../../../api/client';
import {
  getCheckoutIntent,
  startCheckoutPayment,
  type CheckoutIntent,
} from '../../../api/checkout';
import type { PaymentStatus } from '../../../api/checkoutPay';
import PaymentStatusCard from '../../checkout/PaymentStatusCard';
import { buildCheckoutIdempotencyKey, checkoutErrorMessage } from '../../checkout/checkoutUi';
import {
  buildPurchaseDetailReturnUrl,
  canShowPurchaseRefundCta,
  formatPurchaseAmount,
  formatPurchaseDate,
  parsePurchaseIdParam,
  purchaseFulfillmentMessage,
  purchaseIntentStatusLabel,
  purchaseProductTypeLabel,
  purchaseProviderLabel,
} from '../purchases/purchaseDisplay';
import {
  formatAverageUnitPriceRu,
  formatMoneyRu,
  humanPricingBreakdownLines,
  type PricingBandLike,
} from '../../pricing/pricingDisplay';
import { findRefundablePurchaseByIntent } from '../refunds/findRefundablePurchase';
import type { RefundablePurchase } from '../../../api/refunds';
import {
  unavailableReasonLabel,
  formatPartialRefundProgress,
  formatRemainingRefundable,
} from '../refunds/refundDisplay';

const linkStyle: React.CSSProperties = {
  color: 'var(--primary)',
  fontWeight: 600,
  textDecoration: 'none',
  fontSize: 14,
};

const mutedLabel: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 12,
  marginBottom: 2,
};

const compactField: React.CSSProperties = {
  display: 'grid',
  gap: 1,
};

function CompactField({
  label,
  children,
  testId,
}: {
  label: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div style={compactField} data-testid={testId}>
      <div style={mutedLabel}>{label}</div>
      <div style={{ fontSize: 14 }}>{children}</div>
    </div>
  );
}

function isFinalSucceededIntent(status: string | null | undefined): boolean {
  const key = (status || '').trim().toLowerCase();
  return key === 'fulfilled' || key === 'paid';
}

function purchaseProminentStatus(item: CheckoutIntent): string {
  if (isFinalSucceededIntent(item.status)) {
    return 'Оплачено и активировано';
  }
  return purchaseIntentStatusLabel(item.status);
}

export default function PurchaseDetailPage() {
  const { purchaseId: purchaseIdParam } = useParams<{ purchaseId: string }>();
  const purchaseId = parsePurchaseIdParam(purchaseIdParam);

  const [item, setItem] = useState<CheckoutIntent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [refundable, setRefundable] = useState<RefundablePurchase | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);
  const retryLockRef = useRef(false);
  const lastFinalRefreshKey = useRef<string | null>(null);

  const loadRefundEligibility = useCallback(async (intent: CheckoutIntent) => {
    if (!canShowPurchaseRefundCta(intent.status)) {
      setRefundable(null);
      return;
    }
    try {
      const found = await findRefundablePurchaseByIntent(intent.id);
      setRefundable(found);
    } catch {
      // Fail closed: hide CTA if eligibility cannot be confirmed.
      setRefundable(null);
    }
  }, []);

  const loadIntent = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (purchaseId == null) {
        setError('Покупка не найдена.');
        setLoading(false);
        setItem(null);
        setRefundable(null);
        return;
      }
      if (!opts?.quiet) {
        setLoading(true);
      }
      setError(null);
      try {
        const data = await getCheckoutIntent(purchaseId);
        setItem(data);
        await loadRefundEligibility(data);
      } catch (e) {
        setItem(null);
        setRefundable(null);
        if (e instanceof ApiError && (e.status === 404 || e.status === 403)) {
          setError('Покупка не найдена.');
        } else {
          setError('Не удалось загрузить покупку. Попробуйте позже.');
        }
      } finally {
        if (!opts?.quiet) {
          setLoading(false);
        }
      }
    },
    [loadRefundEligibility, purchaseId]
  );

  useEffect(() => {
    lastFinalRefreshKey.current = null;
    setRetryError(null);
    void loadIntent();
  }, [loadIntent]);

  const handleStatusChange = useCallback(
    (status: PaymentStatus | null) => {
      if (!status?.is_final || purchaseId == null) return;
      const key = `${status.intent_status}:${status.normalized_status}`;
      if (lastFinalRefreshKey.current === key) return;
      lastFinalRefreshKey.current = key;
      void loadIntent({ quiet: true });
    },
    [loadIntent, purchaseId]
  );

  const handleCancelled = useCallback(() => {
    void loadIntent({ quiet: true });
  }, [loadIntent]);

  const handleRetryPay = useCallback(async () => {
    if (purchaseId == null || retryLockRef.current || retrying) return;
    retryLockRef.current = true;
    setRetrying(true);
    setRetryError(null);
    try {
      const payKey = buildCheckoutIdempotencyKey(`purchase-retry-${purchaseId}`);
      const returnUrl = buildPurchaseDetailReturnUrl(purchaseId);
      const pay = await startCheckoutPayment(purchaseId, {
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
  }, [purchaseId, retrying]);

  const fulfillmentMsg = item ? purchaseFulfillmentMessage(item) : null;
  const providerLabel = item ? purchaseProviderLabel(item.payment_provider) : null;
  const showRefundCta = !!refundable?.can_request_refund;
  const existingRefundId = refundable?.current_refund_request_id ?? null;
  const refundBlockedReason =
    refundable && !refundable.can_request_refund
      ? unavailableReasonLabel(refundable.unavailable_reason)
      : null;
  const finalSucceeded = item ? isFinalSucceededIntent(item.status) : false;
  const showFullPaymentCard =
    purchaseId != null && !loading && !error && item != null && !finalSucceeded;
  const showCompactFinal = item != null && finalSucceeded;

  return (
    <DashboardPage
      title="Покупка"
      subtitle="Подробности покупки и статус оплаты."
      breadcrumbs={[
        { label: 'Финансы и лимиты', path: '/dashboard/finance' },
        { label: 'Мои покупки', path: '/dashboard/finance/purchases' },
        { label: 'Подробнее' },
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading && (
          <Card>
            <p
              data-testid="purchase-detail-loading"
              style={{ margin: 0, color: 'var(--text-muted)' }}
            >
              Загрузка покупки…
            </p>
          </Card>
        )}

        {!loading && error && (
          <Card>
            <div
              data-testid="purchase-detail-error"
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}
            >
              <AlertTriangle size={18} style={{ color: '#ef4444', marginTop: 2 }} />
              <div>
                <p style={{ margin: '0 0 10px', color: '#ef4444' }}>{error}</p>
                <Link to="/dashboard/finance/purchases" style={linkStyle}>
                  Назад к моим покупкам
                </Link>
              </div>
            </div>
          </Card>
        )}

        {!loading && !error && item && (
          <>
            <Card>
              <div data-testid="purchase-detail-basic" style={{ display: 'grid', gap: 10 }}>
                <div>
                  <div
                    data-testid="purchase-detail-name"
                    style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.3 }}
                  >
                    {item.product_name}
                  </div>
                  <div
                    data-testid="purchase-detail-type-amount"
                    style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 2 }}
                  >
                    <span data-testid="purchase-detail-type">
                      {purchaseProductTypeLabel(item.product_type)}
                    </span>
                    {' · '}
                    <span data-testid="purchase-detail-amount">
                      {formatPurchaseAmount(item.amount, item.currency)}
                    </span>
                  </div>
                </div>

                <div
                  data-testid="purchase-detail-status-row"
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: finalSucceeded
                      ? 'rgba(34, 197, 94, 0.12)'
                      : 'rgba(148, 163, 184, 0.12)',
                  }}
                >
                  <div
                    data-testid="purchase-detail-status"
                    style={{ fontWeight: 700, fontSize: 15 }}
                  >
                    {purchaseProminentStatus(item)}
                  </div>
                  {fulfillmentMsg ? (
                    <div
                      data-testid="purchase-detail-fulfillment"
                      style={{ marginTop: 2, fontSize: 13, color: 'var(--text-muted)' }}
                    >
                      {fulfillmentMsg}
                    </div>
                  ) : null}
                </div>

                <div
                  data-testid="purchase-detail-meta"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '8px 12px',
                  }}
                >
                  <CompactField label="Создана">
                    <span data-testid="purchase-detail-created">
                      {formatPurchaseDate(item.created_at)}
                    </span>
                  </CompactField>
                  {item.paid_at ? (
                    <CompactField label="Оплачена">
                      <span data-testid="purchase-detail-paid-at">
                        {formatPurchaseDate(item.paid_at)}
                      </span>
                    </CompactField>
                  ) : null}
                  {item.fulfilled_at ? (
                    <CompactField label="Активирована">
                      <span data-testid="purchase-detail-fulfilled-at">
                        {formatPurchaseDate(item.fulfilled_at)}
                      </span>
                    </CompactField>
                  ) : null}
                  {item.cancelled_at ? (
                    <CompactField label="Отменена">
                      <span data-testid="purchase-detail-cancelled-at">
                        {formatPurchaseDate(item.cancelled_at)}
                      </span>
                    </CompactField>
                  ) : null}
                  {item.refunded_at ? (
                    <CompactField label="Возвращена">
                      <span data-testid="purchase-detail-refunded-at">
                        {formatPurchaseDate(item.refunded_at)}
                      </span>
                    </CompactField>
                  ) : null}
                  {providerLabel ? (
                    <CompactField label="Способ оплаты">
                      <span data-testid="purchase-detail-provider">{providerLabel}</span>
                    </CompactField>
                  ) : null}
                  {item.product_units != null ? (
                    <CompactField label="Количество">
                      <span data-testid="purchase-detail-units">{item.product_units}</span>
                    </CompactField>
                  ) : null}
                </div>
                {item.price_grid_snapshot &&
                Array.isArray(item.price_grid_snapshot.bands) &&
                (item.price_grid_snapshot.bands as unknown[]).length > 0 ? (
                  <div data-testid="purchase-detail-pricing" style={{ marginTop: 4 }}>
                    {typeof item.price_grid_snapshot.validity_days === 'number' ? (
                      <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-muted)' }}>
                        Срок действия: {String(item.price_grid_snapshot.validity_days)} дней с
                        момента активации
                      </p>
                    ) : null}
                    {item.price_grid_snapshot.average_unit_price ? (
                      <p
                        style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text-muted)' }}
                        data-testid="purchase-detail-avg"
                      >
                        {formatAverageUnitPriceRu(
                          item.price_grid_snapshot.average_unit_price,
                          item.currency
                        )}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      data-testid="purchase-detail-how-pricing"
                      onClick={() => setPricingOpen(v => !v)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--primary)',
                        fontWeight: 600,
                        fontSize: 13,
                        padding: 0,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      Как была рассчитана стоимость
                    </button>
                    {pricingOpen ? (
                      <ul
                        data-testid="purchase-detail-breakdown"
                        style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13 }}
                      >
                        {humanPricingBreakdownLines(
                          item.price_grid_snapshot.bands as PricingBandLike[],
                          item.currency
                        ).map(line => (
                          <li key={line}>{line}</li>
                        ))}
                        <li>итог: {formatMoneyRu(item.amount, item.currency)}</li>
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Card>

            {showCompactFinal ? (
              <div
                data-testid="purchase-detail-payment-final"
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  color: 'var(--text-muted)',
                }}
              >
                Оплата завершена. Дополнительных действий не требуется.
              </div>
            ) : null}

            {showFullPaymentCard ? (
              <Card>
                <h2
                  style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700 }}
                  data-testid="purchase-detail-payment-heading"
                >
                  Статус оплаты
                </h2>
                <PaymentStatusCard
                  intentId={purchaseId!}
                  onStatusChange={handleStatusChange}
                  onCancelled={handleCancelled}
                  onRetryPay={() => {
                    void handleRetryPay();
                  }}
                />
                {retrying ? (
                  <p
                    data-testid="purchase-detail-retrying"
                    style={{ margin: '10px 0 0', color: 'var(--text-muted)', fontSize: 14 }}
                  >
                    Повторяем оплату…
                  </p>
                ) : null}
                {retryError ? (
                  <p
                    data-testid="purchase-detail-retry-error"
                    role="alert"
                    style={{ margin: '10px 0 0', color: '#ef4444', fontSize: 14 }}
                  >
                    {retryError}
                  </p>
                ) : null}
              </Card>
            ) : null}

            {showRefundCta || (refundable && !refundable.can_request_refund) ? (
              <Card>
                <div
                  data-testid={
                    showRefundCta
                      ? 'purchase-detail-refund-cta'
                      : 'purchase-detail-refund-unavailable'
                  }
                >
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Возврат</div>
                  {showRefundCta ? (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                      }}
                    >
                      <div>
                        {refundable?.confirmed_refunded_amount &&
                        Number(refundable.confirmed_refunded_amount) > 0 &&
                        Number(refundable.refundable_available_amount || 0) > 0 ? (
                          <p
                            data-testid="purchase-detail-partial-label"
                            style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 13 }}
                          >
                            Частичный возврат выполнен
                          </p>
                        ) : null}
                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>
                          Можно оформить заявку по этой покупке.
                        </p>
                        {refundable?.confirmed_refunded_amount &&
                        Number(refundable.confirmed_refunded_amount) > 0 ? (
                          <div
                            data-testid="purchase-detail-partial-refund"
                            style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}
                          >
                            {formatPartialRefundProgress({
                              confirmedRefunded: refundable.confirmed_refunded_amount,
                              paidAmount: refundable.amount,
                              currency: refundable.currency,
                            })}
                            {formatRemainingRefundable({
                              remaining: refundable.refundable_available_amount,
                              currency: refundable.currency,
                            })
                              ? ` · ${formatRemainingRefundable({
                                  remaining: refundable.refundable_available_amount,
                                  currency: refundable.currency,
                                })}`
                              : ''}
                          </div>
                        ) : null}
                      </div>
                      <Link
                        to={`/dashboard/finance/refunds?intent=${purchaseId}`}
                        data-testid="purchase-detail-refund-link"
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          color: 'var(--text)',
                          textDecoration: 'none',
                          fontWeight: 600,
                          fontSize: 13,
                          minHeight: 36,
                          display: 'inline-flex',
                          alignItems: 'center',
                        }}
                      >
                        Оформить возврат
                      </Link>
                    </div>
                  ) : (
                    <>
                      <p style={{ margin: '0 0 8px', color: 'var(--text-muted)', fontSize: 13 }}>
                        {refundBlockedReason ||
                          'По этой покупке сейчас нельзя оформить новый возврат.'}
                      </p>
                      {existingRefundId != null ? (
                        <Link
                          to={`/dashboard/finance/refunds/${existingRefundId}`}
                          data-testid="purchase-detail-existing-refund"
                          style={linkStyle}
                        >
                          Открыть заявку
                        </Link>
                      ) : null}
                    </>
                  )}
                </div>
              </Card>
            ) : null}

            <div
              style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}
              data-testid="purchase-detail-nav"
            >
              <Link
                to="/dashboard/finance/purchases"
                data-testid="purchase-detail-back"
                style={linkStyle}
              >
                Назад к моим покупкам
              </Link>
              <Link to="/dashboard/finance" data-testid="purchase-detail-finance" style={linkStyle}>
                Финансы и лимиты
              </Link>
            </div>
          </>
        )}
      </div>
    </DashboardPage>
  );
}
