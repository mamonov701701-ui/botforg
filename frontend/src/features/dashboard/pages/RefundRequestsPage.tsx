/**
 * Заявки на возврат (Этап 6.14.4 + 8.3.4 intent preselect / picker).
 * Основной путь: Мои покупки → detail → ?intent=…
 * Dropdown заменён компактным выбором + paginated picker.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import {
  createMyRefundRequest,
  listMyRefundablePurchases,
  listMyRefundRequests,
  safeRefundErrorMessage,
  type RefundablePurchase,
  type RefundRequest,
} from '../../../api/refunds';
import {
  formatRecommendedRefundAmount,
  formatRefundDate,
  reasonCategoryLabel,
  REFUND_REASON_OPTIONS,
  refundPurchaseSubtitle,
  refundPurchaseTitle,
  refundStatusLabel,
  unavailableReasonLabel,
} from '../refunds/refundDisplay';
import {
  findRefundablePurchaseByIntent,
  parseRefundIntentParam,
  REFUNDABLE_PICKER_PAGE_SIZE,
} from '../refunds/findRefundablePurchase';
import { purchaseProductTypeLabel } from '../purchases/purchaseDisplay';
import { toast } from '../../../utils/toast';

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `refund-${crypto.randomUUID()}`;
  }
  return `refund-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function listLoadErrorMessage(err: unknown): string {
  if (err instanceof Error && /failed to fetch|network|abort/i.test(err.message)) {
    return 'Нет связи с сервером. Проверьте интернет и попробуйте снова.';
  }
  const msg = safeRefundErrorMessage(err);
  if (/заявка на возврат не найдена/i.test(msg)) {
    return 'Не удалось загрузить список возвратов. Обновите страницу или попробуйте позже.';
  }
  return msg;
}

function formatPurchaseMoney(p: RefundablePurchase): string {
  const currency = (p.currency || 'RUB').toUpperCase() === 'RUB' ? '₽' : p.currency;
  return `${p.amount} ${currency}`;
}

export default function RefundRequestsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const intentFromQuery = parseRefundIntentParam(searchParams.get('intent'));

  const [items, setItems] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPurchase, setSelectedPurchase] = useState<RefundablePurchase | null>(null);
  const [intentResolveError, setIntentResolveError] = useState<string | null>(null);
  const [intentResolving, setIntentResolving] = useState(false);
  const [hasSelectableHint, setHasSelectableHint] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerItems, setPickerItems] = useState<RefundablePurchase[]>([]);
  const [pickerTotal, setPickerTotal] = useState(0);
  const [pickerOffset, setPickerOffset] = useState(0);

  const [reasonCategory, setReasonCategory] = useState('');
  const [userComment, setUserComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const applySelectedPurchase = useCallback(
    (purchase: RefundablePurchase | null, opts?: { syncQuery?: boolean }) => {
      setSelectedPurchase(purchase);
      setFormError(null);
      if (opts?.syncQuery === false) return;
      setSearchParams(
        prev => {
          const next = new URLSearchParams(prev);
          if (purchase && purchase.can_request_refund) {
            next.set('intent', String(purchase.checkout_intent_id));
          } else {
            next.delete('intent');
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const loadRequestsAndHint = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, purchasePage] = await Promise.all([
        listMyRefundRequests(),
        listMyRefundablePurchases({ limit: REFUNDABLE_PICKER_PAGE_SIZE, offset: 0 }),
      ]);
      setItems(rows);
      const anySelectable = purchasePage.items.some(p => p.can_request_refund);
      setHasSelectableHint(anySelectable || purchasePage.total > purchasePage.items.length);
    } catch (e) {
      setError(listLoadErrorMessage(e));
      setItems([]);
      setHasSelectableHint(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequestsAndHint();
  }, [loadRequestsAndHint]);

  useEffect(() => {
    let cancelled = false;

    async function resolveIntent() {
      if (intentFromQuery == null) {
        setIntentResolveError(null);
        setIntentResolving(false);
        return;
      }

      setIntentResolving(true);
      setIntentResolveError(null);
      try {
        const found = await findRefundablePurchaseByIntent(intentFromQuery);
        if (cancelled) return;
        if (!found) {
          setSelectedPurchase(null);
          setIntentResolveError(
            'Эта покупка не найдена или недоступна для возврата. Выберите другую покупку из списка.'
          );
          return;
        }
        if (!found.can_request_refund) {
          setSelectedPurchase(null);
          const why = unavailableReasonLabel(found.unavailable_reason);
          setIntentResolveError(
            why
              ? `По этой покупке нельзя оформить возврат: ${why}.`
              : 'По этой покупке сейчас нельзя оформить возврат.'
          );
          return;
        }
        setSelectedPurchase(found);
        setIntentResolveError(null);
      } catch {
        if (cancelled) return;
        setSelectedPurchase(null);
        setIntentResolveError(
          'Не удалось проверить покупку для возврата. Попробуйте обновить страницу.'
        );
      } finally {
        if (!cancelled) setIntentResolving(false);
      }
    }

    void resolveIntent();
    return () => {
      cancelled = true;
    };
  }, [intentFromQuery]);

  const loadPickerPage = useCallback(async (offset: number) => {
    setPickerLoading(true);
    setPickerError(null);
    try {
      const data = await listMyRefundablePurchases({
        limit: REFUNDABLE_PICKER_PAGE_SIZE,
        offset,
      });
      setPickerItems(data.items);
      setPickerTotal(data.total);
      setPickerOffset(data.offset);
      if (data.items.some(p => p.can_request_refund)) {
        setHasSelectableHint(true);
      }
    } catch (e) {
      setPickerError(listLoadErrorMessage(e));
      setPickerItems([]);
    } finally {
      setPickerLoading(false);
    }
  }, []);

  const openPicker = useCallback(() => {
    setPickerOpen(true);
    void loadPickerPage(0);
  }, [loadPickerPage]);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
    setPickerError(null);
  }, []);

  const onPickPurchase = useCallback(
    (purchase: RefundablePurchase) => {
      if (!purchase.can_request_refund) return;
      setIntentResolveError(null);
      applySelectedPurchase(purchase);
      closePicker();
    },
    [applySelectedPurchase, closePicker]
  );

  const canSubmit =
    !submitting &&
    !loading &&
    !intentResolving &&
    !!selectedPurchase?.can_request_refund &&
    !!reasonCategory.trim();

  const showCreateForm =
    !loading && !error && (hasSelectableHint || !!selectedPurchase?.can_request_refund);
  const showCreateEmpty =
    !loading && !error && !hasSelectableHint && !selectedPurchase?.can_request_refund;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!selectedPurchase || !selectedPurchase.can_request_refund) {
      setFormError('Выберите покупку для возврата.');
      return;
    }
    if (!reasonCategory.trim()) {
      setFormError('Укажите категорию причины.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createMyRefundRequest({
        checkout_intent_id: selectedPurchase.checkout_intent_id,
        payment_attempt_id: selectedPurchase.payment_attempt_id,
        reason_category: reasonCategory.trim(),
        idempotency_key: newIdempotencyKey(),
        user_comment: userComment.trim() || null,
      });
      toast.success('Заявка на возврат отправлена');
      setReasonCategory('');
      setUserComment('');
      applySelectedPurchase(null);
      await loadRequestsAndHint();
      navigate(`/dashboard/finance/refunds/${created.id}`);
    } catch (err) {
      setFormError(safeRefundErrorMessage(err));
      toast.error(safeRefundErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const pickerCanPrev = pickerOffset > 0 && !pickerLoading;
  const pickerCanNext =
    pickerOffset + pickerItems.length < pickerTotal && !pickerLoading && pickerItems.length > 0;

  const pickerRange = useMemo(() => {
    if (pickerTotal <= 0 || pickerItems.length === 0) return `0 из ${pickerTotal}`;
    const from = pickerOffset + 1;
    const to = pickerOffset + pickerItems.length;
    return `${from}–${to} из ${pickerTotal}`;
  }, [pickerOffset, pickerItems.length, pickerTotal]);

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: '14px',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    marginBottom: '6px',
  };

  const submitStyle: React.CSSProperties = canSubmit
    ? {
        alignSelf: 'flex-start',
        padding: '10px 16px',
        borderRadius: '8px',
        border: '1px solid var(--primary)',
        background: 'var(--primary)',
        color: 'var(--text-on-primary, #111)',
        fontWeight: 700,
        fontSize: '14px',
        cursor: 'pointer',
      }
    : {
        alignSelf: 'flex-start',
        padding: '10px 16px',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text-muted)',
        fontWeight: 600,
        fontSize: '14px',
        cursor: 'not-allowed',
      };

  const ghostBtn: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontWeight: 600,
    fontSize: 14,
    cursor: 'pointer',
    minHeight: 40,
  };

  const refreshButton = (
    <button
      type="button"
      onClick={() => void loadRequestsAndHint()}
      disabled={loading}
      data-testid="refund-list-refresh"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 16px',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        color: 'var(--text)',
        fontSize: '14px',
        fontWeight: 600,
        cursor: loading ? 'wait' : 'pointer',
      }}
    >
      <RefreshCw size={16} />
      Обновить
    </button>
  );

  return (
    <DashboardPage
      title="Заявки на возврат"
      subtitle="Статус ваших заявок. Сумму возврата рассчитывает система; при ручной проверке сумму определяет администратор."
      breadcrumbs={[
        { label: 'Финансы и лимиты', path: '/dashboard/finance' },
        { label: 'Возвраты' },
      ]}
      actions={refreshButton}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {intentResolving && (
          <Card>
            <p
              data-testid="refund-intent-resolving"
              style={{ margin: 0, color: 'var(--text-muted)' }}
            >
              Проверяем выбранную покупку…
            </p>
          </Card>
        )}

        {!intentResolving && intentResolveError && (
          <Card style={{ borderColor: 'rgba(239, 68, 68, 0.35)' }}>
            <div
              data-testid="refund-intent-error"
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}
            >
              <AlertTriangle size={18} style={{ color: '#ef4444', marginTop: 2 }} />
              <div>
                <p style={{ margin: '0 0 10px', color: '#ef4444' }}>{intentResolveError}</p>
                {hasSelectableHint ? (
                  <button
                    type="button"
                    data-testid="refund-intent-error-pick"
                    style={ghostBtn}
                    onClick={openPicker}
                  >
                    Выбрать другую покупку
                  </button>
                ) : (
                  <Link
                    to="/dashboard/finance/purchases"
                    data-testid="refund-intent-error-purchases"
                    style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}
                  >
                    Перейти к моим покупкам
                  </Link>
                )}
              </div>
            </div>
          </Card>
        )}

        {showCreateEmpty && !intentResolveError && (
          <div data-testid="refund-create-empty">
            <Card>
              <h2 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700 }}>Новая заявка</h2>
              <p
                data-testid="refund-create-empty-purchases"
                style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5 }}
              >
                Нет оплаченных покупок, по которым сейчас можно подать заявку на возврат. Когда
                появится подходящая покупка, форма создания станет доступна здесь.
              </p>
              <p style={{ margin: '12px 0 0' }}>
                <Link
                  to="/dashboard/finance/purchases"
                  style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}
                >
                  Мои покупки
                </Link>
              </p>
            </Card>
          </div>
        )}

        {showCreateForm && (
          <div data-testid="refund-create-form">
            <Card>
              <h2 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 700 }}>
                Новая заявка
              </h2>
              <form
                onSubmit={onSubmit}
                style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
              >
                <div>
                  <div style={labelStyle}>
                    Покупка <span style={{ color: '#ef4444' }}>*</span>
                  </div>

                  {selectedPurchase?.can_request_refund ? (
                    <div
                      data-testid="refund-selected-purchase"
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        background: 'var(--bg)',
                      }}
                    >
                      <div style={{ fontWeight: 700 }} data-testid="refund-selected-name">
                        {selectedPurchase.product_name}
                      </div>
                      <div
                        style={{ fontSize: 14, color: 'var(--text-muted)' }}
                        data-testid="refund-selected-meta"
                      >
                        {purchaseProductTypeLabel(selectedPurchase.product_type)} ·{' '}
                        {formatPurchaseMoney(selectedPurchase)} ·{' '}
                        {selectedPurchase.paid_at
                          ? formatRefundDate(selectedPurchase.paid_at)
                          : '—'}
                      </div>
                      <button
                        type="button"
                        data-testid="refund-change-purchase"
                        style={{ ...ghostBtn, alignSelf: 'flex-start' }}
                        onClick={openPicker}
                        disabled={submitting}
                      >
                        Выбрать другую покупку
                      </button>
                    </div>
                  ) : (
                    <div data-testid="refund-purchase-unselected">
                      <p style={{ margin: '0 0 10px', color: 'var(--text-muted)', fontSize: 14 }}>
                        Выберите покупку из оплаченных, по которым доступен возврат.
                      </p>
                      <button
                        type="button"
                        data-testid="refund-create-purchase"
                        style={ghostBtn}
                        onClick={openPicker}
                        disabled={submitting}
                      >
                        Выбрать покупку
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label htmlFor="refund-reason" style={labelStyle}>
                    Причина <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    id="refund-reason"
                    data-testid="refund-create-reason"
                    value={reasonCategory}
                    onChange={ev => setReasonCategory(ev.target.value)}
                    disabled={submitting}
                    required
                    style={fieldStyle}
                  >
                    <option value="">Выберите причину</option>
                    {REFUND_REASON_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="refund-comment" style={labelStyle}>
                    Комментарий (необязательно)
                  </label>
                  <textarea
                    id="refund-comment"
                    data-testid="refund-create-comment"
                    value={userComment}
                    onChange={ev => setUserComment(ev.target.value)}
                    disabled={submitting}
                    rows={3}
                    maxLength={4000}
                    placeholder="Кратко опишите ситуацию"
                    style={{ ...fieldStyle, resize: 'vertical', minHeight: 72 }}
                  />
                </div>

                {formError && (
                  <p
                    data-testid="refund-create-error"
                    style={{ margin: 0, color: '#ef4444', fontSize: '14px' }}
                  >
                    {formError}
                  </p>
                )}

                <button
                  type="submit"
                  data-testid="refund-create-submit"
                  data-state={canSubmit ? 'active' : 'disabled'}
                  disabled={!canSubmit}
                  style={submitStyle}
                >
                  {submitting ? 'Отправка…' : 'Подать заявку'}
                </button>
              </form>
            </Card>
          </div>
        )}

        {loading && items.length === 0 && !error && (
          <div data-testid="refund-list-loading">
            <Card>
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>Загрузка заявок…</p>
            </Card>
          </div>
        )}

        {error && (
          <div data-testid="refund-list-error">
            <Card style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <AlertTriangle size={22} style={{ color: '#ef4444', flexShrink: 0 }} />
                <div>
                  <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Ошибка загрузки</p>
                  <p style={{ margin: 0, color: 'var(--text-muted)' }}>{error}</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div data-testid="refund-list-empty">
            <Card>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>Заявок на возврат пока нет.</p>
            </Card>
          </div>
        )}

        {items.length > 0 && (
          <div
            data-testid="refund-list"
            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
          >
            <style>{`
              .refund-list-head { display: grid; }
              @media (max-width: 720px) {
                .refund-list-head { display: none !important; }
                .refund-list-row {
                  grid-template-columns: 1fr !important;
                  gap: 4px !important;
                  border: 1px solid var(--border);
                  border-radius: 10px;
                  margin-bottom: 8px;
                  padding: 10px 12px !important;
                }
                .refund-list-row .refund-list-action {
                  margin-top: 4px;
                }
              }
            `}</style>
            <div
              className="refund-list-head"
              style={{
                display: 'grid',
                gridTemplateColumns: '72px minmax(0, 1.4fr) 120px 150px 120px 100px',
                gap: 8,
                padding: '8px 12px',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--text-muted)',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div>№</div>
              <div>Покупка</div>
              <div>Сумма</div>
              <div>Статус</div>
              <div>Дата</div>
              <div />
            </div>
            {items.map(row => (
              <div
                key={row.id}
                className="refund-list-row"
                data-testid={`refund-list-row-${row.id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '72px minmax(0, 1.4fr) 120px 150px 120px 100px',
                  gap: 8,
                  padding: '10px 12px',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--border)',
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 700 }}>№{row.id}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{refundPurchaseTitle(row)}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {refundPurchaseSubtitle(row)}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {reasonCategoryLabel(row.reason_category)}
                  </div>
                </div>
                <div>
                  {formatRecommendedRefundAmount(row.recommended_refund_amount, {
                    proposedAmountUndefined: row.proposed_amount_undefined,
                    currency: row.currency,
                  })}
                </div>
                <div>{refundStatusLabel(row.status)}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {formatRefundDate(row.submitted_at || row.created_at)}
                </div>
                <div className="refund-list-action">
                  <Link
                    to={`/dashboard/finance/refunds/${row.id}`}
                    data-testid={`refund-open-${row.id}`}
                    style={{
                      color: 'var(--primary)',
                      fontWeight: 600,
                      textDecoration: 'none',
                      fontSize: 13,
                    }}
                  >
                    Подробнее
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {pickerOpen && (
        <div
          data-testid="refund-purchase-picker"
          role="dialog"
          aria-modal="true"
          aria-label="Выбор покупки для возврата"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={closePicker}
        >
          <div
            style={{
              width: 'min(520px, 100%)',
              maxHeight: 'min(80vh, 640px)',
              overflow: 'auto',
              background: 'var(--card, #fff)',
              borderRadius: 12,
              border: '1px solid var(--border)',
              padding: 16,
              boxShadow: '0 16px 40px rgba(0,0,0,0.18)',
            }}
            onClick={ev => ev.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                marginBottom: 12,
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Выберите покупку</h3>
              <button
                type="button"
                data-testid="refund-picker-close"
                onClick={closePicker}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 4,
                  color: 'var(--text)',
                }}
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            {pickerLoading && (
              <p data-testid="refund-picker-loading" style={{ color: 'var(--text-muted)' }}>
                Загрузка покупок…
              </p>
            )}
            {pickerError && (
              <p data-testid="refund-picker-error" style={{ color: '#ef4444' }}>
                {pickerError}
              </p>
            )}

            {!pickerLoading && !pickerError && pickerItems.length === 0 && (
              <p data-testid="refund-picker-empty" style={{ color: 'var(--text-muted)' }}>
                Нет покупок для выбора.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pickerItems.map(p => (
                <div
                  key={p.checkout_intent_id}
                  data-testid={`refund-picker-item-${p.checkout_intent_id}`}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '10px 12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 10,
                    alignItems: 'center',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{p.product_name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {purchaseProductTypeLabel(p.product_type)} · {formatPurchaseMoney(p)} ·{' '}
                      {p.paid_at ? formatRefundDate(p.paid_at) : '—'}
                    </div>
                    {!p.can_request_refund && (
                      <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>
                        {unavailableReasonLabel(p.unavailable_reason) || 'Недоступно для возврата'}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    data-testid={`refund-picker-select-${p.checkout_intent_id}`}
                    disabled={!p.can_request_refund || submitting}
                    style={{
                      ...ghostBtn,
                      opacity: p.can_request_refund ? 1 : 0.45,
                      cursor: p.can_request_refund ? 'pointer' : 'not-allowed',
                    }}
                    onClick={() => onPickPurchase(p)}
                  >
                    Выбрать
                  </button>
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                marginTop: 14,
              }}
            >
              <span
                data-testid="refund-picker-range"
                style={{ fontSize: 13, color: 'var(--text-muted)' }}
              >
                {pickerRange}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  data-testid="refund-picker-prev"
                  style={ghostBtn}
                  disabled={!pickerCanPrev}
                  onClick={() =>
                    void loadPickerPage(Math.max(0, pickerOffset - REFUNDABLE_PICKER_PAGE_SIZE))
                  }
                >
                  Назад
                </button>
                <button
                  type="button"
                  data-testid="refund-picker-next"
                  style={ghostBtn}
                  disabled={!pickerCanNext}
                  onClick={() => void loadPickerPage(pickerOffset + REFUNDABLE_PICKER_PAGE_SIZE)}
                >
                  Вперёд
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardPage>
  );
}
