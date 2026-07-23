import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import {
  cancelMyRefundRequest,
  getMyRefundRequest,
  provideRefundInformation,
  safeRefundErrorMessage,
  type RefundRequest,
} from '../../../api/refunds';
import { ApiError } from '../../../api/client';
import {
  canUserCancelRefund,
  formatAddonRevokedUnits,
  formatPartialRefundProgress,
  formatRecommendedRefundAmount,
  formatRefundDate,
  formatRemainingRefundable,
  reasonCategoryLabel,
  refundPurchaseSubtitle,
  refundPurchaseTitle,
  refundStatusHint,
  refundStatusLabel,
} from '../refunds/refundDisplay';
import { toast } from '../../../utils/toast';

const REPLY_MAX_LENGTH = 2000;

export default function RefundRequestDetailPage() {
  const { refundId } = useParams<{ refundId: string }>();
  const id = Number(refundId);

  const [item, setItem] = useState<RefundRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [submittingReply, setSubmittingReply] = useState(false);

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

  const trimmedReply = replyText.trim();
  const canSubmitReply =
    Boolean(item) &&
    item?.status === 'needs_information' &&
    trimmedReply.length > 0 &&
    trimmedReply.length <= REPLY_MAX_LENGTH &&
    !submittingReply;

  const onSubmitReply = async () => {
    if (!item || item.status !== 'needs_information' || submittingReply) return;
    const message = replyText.trim();
    if (!message) {
      setReplyError('Введите текст ответа.');
      return;
    }
    if (message.length > REPLY_MAX_LENGTH) {
      setReplyError(`Сообщение не должно превышать ${REPLY_MAX_LENGTH} символов.`);
      return;
    }
    setSubmittingReply(true);
    setReplyError(null);
    try {
      const updated = await provideRefundInformation(item.id, {
        message,
        expected_version: item.version,
      });
      setItem(updated);
      setReplyText('');
      toast.success('Ответ отправлен. Заявка возвращена на рассмотрение.');
    } catch (e) {
      const msg = safeRefundErrorMessage(e);
      if (e instanceof ApiError && (e.status === 409 || e.code === 'invalid_status_for_reply')) {
        await load();
        toast.error(msg);
      } else if (e instanceof ApiError && e.status === 422) {
        setReplyError(msg);
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmittingReply(false);
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

  const amountLabel = item
    ? formatRecommendedRefundAmount(item.recommended_refund_amount, {
        proposedAmountUndefined: item.proposed_amount_undefined,
        currency: item.currency,
      })
    : null;
  const statusHint = item
    ? refundStatusHint(item.status, {
        amountLabel: amountLabel ?? undefined,
        confirmedRefunded: item.confirmed_refunded_amount,
        remainingRefundable: item.refundable_available_amount,
      })
    : null;
  const partialProgress = item
    ? formatPartialRefundProgress({
        confirmedRefunded: item.confirmed_refunded_amount,
        paidAmount: item.amount,
        currency: item.currency,
      })
    : null;
  const remainingLabel = item
    ? formatRemainingRefundable({
        remaining: item.refundable_available_amount,
        currency: item.currency,
      })
    : null;
  const revokedUnitsLabel = item ? formatAddonRevokedUnits(item.addon_revoke_units) : null;

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <Link
            to="/dashboard/finance/refunds"
            data-testid="refund-detail-back"
            style={{ color: 'var(--primary)', fontSize: '14px', textDecoration: 'none' }}
          >
            ← Назад к заявкам на возврат
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
              <div
                style={{
                  margin: 0,
                  display: 'grid',
                  gap: 8,
                  fontSize: 14,
                }}
              >
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'rgba(148, 163, 184, 0.12)',
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>
                    Статус
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15 }} data-testid="refund-detail-status">
                    {refundStatusLabel(item.status, {
                      confirmedRefunded: item.confirmed_refunded_amount,
                      remainingRefundable: item.refundable_available_amount,
                    })}
                  </div>
                  {statusHint && (
                    <p
                      data-testid="refund-detail-status-hint"
                      style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: 13 }}
                    >
                      {statusHint}
                    </p>
                  )}
                  {(item.status === 'partially_refunded' ||
                    (item.confirmed_refunded_amount &&
                      item.refundable_available_amount &&
                      Number(item.confirmed_refunded_amount) > 0)) && (
                    <div
                      data-testid="refund-detail-partial-progress"
                      style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}
                    >
                      {partialProgress && <div>{partialProgress}</div>}
                      {remainingLabel && <div>{remainingLabel}</div>}
                      {revokedUnitsLabel && (
                        <div data-testid="refund-detail-revoked-units">{revokedUnitsLabel}</div>
                      )}
                      {item.product_type === 'addon' &&
                        item.addon_revoke_units != null &&
                        item.addon_revoke_units > 0 &&
                        Number(item.refundable_available_amount || 0) > 0 && (
                          <div data-testid="refund-detail-addon-active-note">
                            Пакет остаётся активным
                          </div>
                        )}
                    </div>
                  )}
                  {item.public_decision_message &&
                    (item.status === 'needs_information' || item.status === 'rejected') && (
                      <p
                        data-testid="refund-detail-public-decision"
                        style={{
                          margin: '8px 0 0',
                          padding: '8px 10px',
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          background: 'var(--bf-section-bg-elevated, transparent)',
                          fontSize: 13,
                          lineHeight: 1.45,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {item.public_decision_message}
                      </p>
                    )}
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '8px 12px',
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 2 }}>
                      Покупка
                    </div>
                    <div data-testid="refund-detail-purchase-name" style={{ fontWeight: 600 }}>
                      {refundPurchaseTitle(item)}
                    </div>
                    <div
                      data-testid="refund-detail-purchase-meta"
                      style={{ color: 'var(--text-muted)', fontSize: 13 }}
                    >
                      {refundPurchaseSubtitle({
                        product_type: item.product_type,
                        amount: item.amount,
                        currency: item.currency,
                      })}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 2 }}>
                      Сумма
                    </div>
                    <div data-testid="refund-detail-amount" style={{ fontWeight: 600 }}>
                      {amountLabel}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 2 }}>
                      Причина
                    </div>
                    <div>{reasonCategoryLabel(item.reason_category)}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 2 }}>
                      Создана
                    </div>
                    <div>{formatRefundDate(item.submitted_at || item.created_at)}</div>
                  </div>
                  {item.completed_at ? (
                    <div>
                      <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 2 }}>
                        Завершена
                      </div>
                      <div>{formatRefundDate(item.completed_at)}</div>
                    </div>
                  ) : null}
                </div>

                {item.user_comment ? (
                  <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 2 }}>
                      Комментарий
                    </div>
                    <div
                      style={{ whiteSpace: 'pre-wrap' }}
                      data-testid="refund-detail-user-comment"
                    >
                      {item.user_comment}
                    </div>
                  </div>
                ) : null}
              </div>

              {canUserCancelRefund(item.status) && (
                <div style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    data-testid="refund-detail-cancel"
                    disabled={canceling}
                    onClick={() => void onCancel()}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid rgba(239, 68, 68, 0.5)',
                      background: 'transparent',
                      color: '#ef4444',
                      fontWeight: 600,
                      fontSize: '14px',
                      cursor: canceling ? 'wait' : 'pointer',
                      minHeight: 40,
                    }}
                  >
                    {canceling ? 'Отмена…' : 'Отменить заявку'}
                  </button>
                </div>
              )}
            </Card>
          </div>
        )}

        {item?.status === 'needs_information' && (
          <div data-testid="refund-detail-reply">
            <Card>
              <h3
                style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}
                data-testid="refund-detail-reply-title"
              >
                Ответить администратору
              </h3>
              <p
                data-testid="refund-detail-reply-hint"
                style={{
                  margin: '0 0 14px',
                  color: 'var(--text-muted)',
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                Укажите сведения, которые запросил администратор. После отправки заявка вернётся на
                рассмотрение.
              </p>
              <textarea
                data-testid="refund-detail-reply-textarea"
                value={replyText}
                maxLength={REPLY_MAX_LENGTH}
                rows={5}
                disabled={submittingReply}
                onChange={e => {
                  setReplyText(e.target.value);
                  if (replyError) setReplyError(null);
                }}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '12px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg, transparent)',
                  color: 'var(--text)',
                  fontSize: 14,
                  lineHeight: 1.5,
                  resize: 'vertical',
                  minHeight: 120,
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  marginTop: 8,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  data-testid="refund-detail-reply-counter"
                  style={{ fontSize: 12, color: 'var(--text-muted)' }}
                >
                  {replyText.length} / {REPLY_MAX_LENGTH}
                </span>
                <button
                  type="button"
                  data-testid="refund-detail-reply-submit"
                  disabled={!canSubmitReply}
                  onClick={() => void onSubmitReply()}
                  style={{
                    padding: '12px 18px',
                    borderRadius: 8,
                    border: 'none',
                    background: canSubmitReply ? 'var(--primary)' : 'var(--border)',
                    color: canSubmitReply ? '#fff' : 'var(--text-muted)',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: canSubmitReply ? 'pointer' : 'not-allowed',
                    minHeight: 44,
                  }}
                >
                  {submittingReply ? 'Отправка…' : 'Отправить ответ'}
                </button>
              </div>
              {replyError && (
                <p
                  data-testid="refund-detail-reply-error"
                  style={{ margin: '10px 0 0', color: '#ef4444', fontSize: 14 }}
                >
                  {replyError}
                </p>
              )}
            </Card>
          </div>
        )}

        {item && (
          <div data-testid="refund-detail-history">
            <details
              data-testid="refund-detail-history-details"
              style={{
                background: 'var(--card, transparent)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 14,
              }}
            >
              <summary
                data-testid="refund-detail-history-title"
                style={{
                  cursor: 'pointer',
                  fontSize: 15,
                  fontWeight: 600,
                  listStyle: 'revert',
                }}
              >
                История заявки
              </summary>
              <div style={{ marginTop: 10 }}>
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
                          padding: '10px 0',
                          borderBottom: '1px solid var(--border)',
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{ev.title}</div>
                        <div
                          style={{
                            fontSize: 14,
                            color: 'var(--text)',
                            lineHeight: 1.45,
                            marginBottom: 4,
                            whiteSpace: 'pre-wrap',
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
              </div>
            </details>
          </div>
        )}
      </div>
    </DashboardPage>
  );
}
