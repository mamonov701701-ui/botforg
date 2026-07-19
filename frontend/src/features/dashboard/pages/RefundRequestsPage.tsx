import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
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
  refundStatusLabel,
  unavailableReasonLabel,
} from '../refunds/refundDisplay';
import { toast } from '../../../utils/toast';

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `refund-${crypto.randomUUID()}`;
  }
  return `refund-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function purchaseOptionLabel(p: RefundablePurchase): string {
  const currency = (p.currency || 'RUB').toUpperCase() === 'RUB' ? '₽' : p.currency;
  const paid = p.paid_at ? formatRefundDate(p.paid_at) : '—';
  const base = `${p.product_name} · ${p.amount} ${currency} · ${paid}`;
  if (!p.can_request_refund) {
    const why = unavailableReasonLabel(p.unavailable_reason);
    return why ? `${base} (${why})` : `${base} (недоступно)`;
  }
  return base;
}

function listLoadErrorMessage(err: unknown): string {
  if (err instanceof Error && /failed to fetch|network|abort/i.test(err.message)) {
    return 'Нет связи с сервером. Проверьте интернет и попробуйте снова.';
  }
  const msg = safeRefundErrorMessage(err);
  // List page must never show detail-only «заявка не найдена».
  if (/заявка на возврат не найдена/i.test(msg)) {
    return 'Не удалось загрузить список возвратов. Обновите страницу или попробуйте позже.';
  }
  return msg;
}

export default function RefundRequestsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<RefundRequest[]>([]);
  const [purchases, setPurchases] = useState<RefundablePurchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [checkoutIntentId, setCheckoutIntentId] = useState('');
  const [reasonCategory, setReasonCategory] = useState('');
  const [userComment, setUserComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, purchaseList] = await Promise.all([
        listMyRefundRequests(),
        listMyRefundablePurchases({ limit: 50, offset: 0 }),
      ]);
      setItems(rows);
      setPurchases(purchaseList.items);
    } catch (e) {
      setError(listLoadErrorMessage(e));
      setItems([]);
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedPurchase = useMemo(() => {
    const id = Number(checkoutIntentId);
    if (!Number.isFinite(id) || id < 1) return null;
    return purchases.find(p => p.checkout_intent_id === id) ?? null;
  }, [checkoutIntentId, purchases]);

  const selectablePurchases = purchases.filter(p => p.can_request_refund);
  const hasSelectable = selectablePurchases.length > 0;
  const canSubmit =
    hasSelectable &&
    !submitting &&
    !loading &&
    !!selectedPurchase?.can_request_refund &&
    !!reasonCategory.trim();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!selectedPurchase || !selectedPurchase.can_request_refund) {
      setFormError('Выберите покупку из списка.');
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
      setCheckoutIntentId('');
      setReasonCategory('');
      setUserComment('');
      await load();
      navigate(`/dashboard/finance/refunds/${created.id}`);
    } catch (err) {
      setFormError(safeRefundErrorMessage(err));
      toast.error(safeRefundErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const refreshButton = (
    <button
      type="button"
      onClick={() => load()}
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
        {!loading && !error && !hasSelectable && (
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
            </Card>
          </div>
        )}

        {!loading && !error && hasSelectable && (
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
                  <label htmlFor="refund-purchase" style={labelStyle}>
                    Покупка <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <select
                    id="refund-purchase"
                    data-testid="refund-create-purchase"
                    value={checkoutIntentId}
                    onChange={ev => setCheckoutIntentId(ev.target.value)}
                    disabled={submitting}
                    required
                    style={fieldStyle}
                  >
                    <option value="">Выберите покупку</option>
                    {selectablePurchases.map(p => (
                      <option key={p.checkout_intent_id} value={String(p.checkout_intent_id)}>
                        {purchaseOptionLabel(p)}
                      </option>
                    ))}
                  </select>
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
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            {items.map(row => (
              <Card key={row.id}>
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    gap: '12px',
                    alignItems: 'flex-start',
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '6px' }}>
                      Заявка №{row.id}
                    </div>
                    <div
                      style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}
                    >
                      Статус: {refundStatusLabel(row.status)}
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                      Причина: {reasonCategoryLabel(row.reason_category)}
                    </div>
                    <div style={{ fontSize: '14px', marginTop: '8px' }}>
                      {formatRecommendedRefundAmount(row.recommended_refund_amount, {
                        proposedAmountUndefined: row.proposed_amount_undefined,
                        currency: row.currency,
                      })}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      Создана: {formatRefundDate(row.submitted_at || row.created_at)}
                    </div>
                  </div>
                  <Link
                    to={`/dashboard/finance/refunds/${row.id}`}
                    data-testid={`refund-open-${row.id}`}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      textDecoration: 'none',
                      fontWeight: 600,
                      fontSize: '14px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Открыть
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardPage>
  );
}
