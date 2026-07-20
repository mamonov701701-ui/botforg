import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import {
  cancelMyRefundRequest,
  getMyRefundRequest,
  safeRefundErrorMessage,
  type RefundRequest,
} from '../../../api/refunds';
import {
  canUserCancelRefund,
  formatRecommendedRefundAmount,
  formatRefundDate,
  reasonCategoryLabel,
  refundStatusHint,
  refundStatusLabel,
} from '../refunds/refundDisplay';
import { toast } from '../../../utils/toast';

export default function RefundRequestDetailPage() {
  const { refundId } = useParams<{ refundId: string }>();
  const id = Number(refundId);

  const [item, setItem] = useState<RefundRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(id) || id < 1) {
      setError('Некорректный номер заявки.');
      setItem(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const row = await getMyRefundRequest(id);
      setItem(row);
    } catch (e) {
      setError(safeRefundErrorMessage(e));
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const onCancel = async () => {
    if (!item || !canUserCancelRefund(item.status)) return;
    setCanceling(true);
    try {
      const updated = await cancelMyRefundRequest(item.id, {
        expected_version: item.version,
      });
      setItem(updated);
      toast.success('Заявка отменена');
    } catch (e) {
      toast.error(safeRefundErrorMessage(e));
      await load();
    } finally {
      setCanceling(false);
    }
  };

  const refreshButton = (
    <button
      type="button"
      onClick={() => load()}
      disabled={loading}
      data-testid="refund-detail-refresh"
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

  const statusHint = item ? refundStatusHint(item.status) : null;
  const amountLabel = item
    ? formatRecommendedRefundAmount(item.recommended_refund_amount, {
        proposedAmountUndefined: item.proposed_amount_undefined,
        currency: item.currency,
      })
    : null;

  return (
    <DashboardPage
      title={item ? `Заявка №${item.id}` : 'Заявка на возврат'}
      subtitle="Подробности заявки. Одобрение не означает, что деньги уже возвращены."
      breadcrumbs={[
        { label: 'Финансы и лимиты', path: '/dashboard/finance' },
        { label: 'Возвраты', path: '/dashboard/finance/refunds' },
        { label: item ? `№${item.id}` : 'Карточка' },
      ]}
      actions={refreshButton}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <Link
            to="/dashboard/finance/refunds"
            style={{ color: 'var(--primary)', fontSize: '14px', textDecoration: 'none' }}
          >
            ← К списку заявок
          </Link>
        </div>

        {loading && !item && !error && (
          <div data-testid="refund-detail-loading">
            <Card>
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>Загрузка заявки…</p>
            </Card>
          </div>
        )}

        {error && (
          <div data-testid="refund-detail-error">
            <Card style={{ borderColor: 'rgba(239, 68, 68, 0.4)' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <AlertTriangle size={22} style={{ color: '#ef4444', flexShrink: 0 }} />
                <div>
                  <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Ошибка</p>
                  <p style={{ margin: 0, color: 'var(--text-muted)' }}>{error}</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {item && (
          <div data-testid="refund-detail-card">
            <Card>
              <dl
                style={{
                  margin: 0,
                  display: 'grid',
                  gap: '14px',
                  fontSize: '15px',
                }}
              >
                <div>
                  <dt style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: 4 }}>
                    Статус
                  </dt>
                  <dd style={{ margin: 0, fontWeight: 600 }} data-testid="refund-detail-status">
                    {refundStatusLabel(item.status)}
                  </dd>
                  {statusHint && (
                    <p
                      data-testid="refund-detail-status-hint"
                      style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '14px' }}
                    >
                      {statusHint}
                    </p>
                  )}
                  {item.public_decision_message &&
                    (item.status === 'needs_information' || item.status === 'rejected') && (
                      <p
                        data-testid="refund-detail-public-decision"
                        style={{
                          margin: '10px 0 0',
                          padding: '10px 12px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--bf-section-bg-elevated, transparent)',
                          fontSize: '14px',
                          lineHeight: 1.5,
                        }}
                      >
                        {item.public_decision_message}
                      </p>
                    )}
                </div>

                <div>
                  <dt style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: 4 }}>
                    Рекомендуемая сумма возврата
                  </dt>
                  <dd style={{ margin: 0, fontWeight: 600 }} data-testid="refund-detail-amount">
                    {amountLabel}
                  </dd>
                </div>

                <div>
                  <dt style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: 4 }}>
                    Причина
                  </dt>
                  <dd style={{ margin: 0 }}>{reasonCategoryLabel(item.reason_category)}</dd>
                </div>

                {item.user_comment && (
                  <div>
                    <dt style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: 4 }}>
                      Комментарий
                    </dt>
                    <dd style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{item.user_comment}</dd>
                  </div>
                )}

                <div>
                  <dt style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: 4 }}>
                    Покупка (CheckoutIntent)
                  </dt>
                  <dd style={{ margin: 0 }}>№{item.checkout_intent_id}</dd>
                </div>

                <div>
                  <dt style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: 4 }}>
                    Создана
                  </dt>
                  <dd style={{ margin: 0 }}>
                    {formatRefundDate(item.submitted_at || item.created_at)}
                  </dd>
                </div>

                {item.completed_at && (
                  <div>
                    <dt style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: 4 }}>
                      Завершена
                    </dt>
                    <dd style={{ margin: 0 }}>{formatRefundDate(item.completed_at)}</dd>
                  </div>
                )}
              </dl>

              {canUserCancelRefund(item.status) && (
                <div style={{ marginTop: '24px' }}>
                  <button
                    type="button"
                    data-testid="refund-detail-cancel"
                    disabled={canceling}
                    onClick={() => void onCancel()}
                    style={{
                      padding: '12px 18px',
                      borderRadius: '8px',
                      border: '1px solid rgba(239, 68, 68, 0.5)',
                      background: 'transparent',
                      color: '#ef4444',
                      fontWeight: 600,
                      fontSize: '14px',
                      cursor: canceling ? 'wait' : 'pointer',
                      minHeight: 44,
                    }}
                  >
                    {canceling ? 'Отмена…' : 'Отменить заявку'}
                  </button>
                </div>
              )}
            </Card>
          </div>
        )}

        {item && (
          <div data-testid="refund-detail-history">
            <Card>
              <h3
                style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}
                data-testid="refund-detail-history-title"
              >
                История заявки
              </h3>
              {!item.status_history.length ? (
                <p
                  data-testid="refund-detail-history-empty"
                  style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}
                >
                  История заявки пока недоступна.
                </p>
              ) : (
                <ul
                  data-testid="refund-detail-history-list"
                  style={{ margin: 0, padding: 0, listStyle: 'none' }}
                >
                  {item.status_history.map(ev => (
                    <li
                      key={ev.id}
                      data-testid={`refund-history-item-${ev.id}`}
                      style={{
                        padding: '12px 0',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{ev.title}</div>
                      <div
                        style={{
                          fontSize: 14,
                          color: 'var(--text)',
                          lineHeight: 1.5,
                          marginBottom: 6,
                        }}
                      >
                        {ev.description}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {formatRefundDate(ev.occurred_at)}
                        {ev.status ? ` · ${refundStatusLabel(ev.status)}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
    </DashboardPage>
  );
}
