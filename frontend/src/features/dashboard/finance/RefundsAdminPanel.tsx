import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react';
import {
  adminApproveRefund,
  adminConfirmRefund,
  adminCreateRefundRevision,
  adminNeedsInformation,
  adminRecalculateRefund,
  adminRejectRefund,
  getAdminRefund,
  isVersionConflictError,
  listAdminRefunds,
  safeAdminRefundErrorMessage,
  type RefundAdminDetail,
  type RefundAdminListItem,
} from '../../../api/refundsAdmin';
import { toast } from '../../../utils/toast';
import { FINANCE_COLORS } from './financeHelpers';
import {
  ADJUSTMENT_REASON_OPTIONS,
  ADMIN_MANUAL_REVIEW_FILTER_OPTIONS,
  ADMIN_NO_MONEY_MOVED,
  ADMIN_REASON_FILTER_OPTIONS,
  ADMIN_STAGE_NO_PAYOUT,
  ADMIN_STATUS_FILTER_OPTIONS,
  APPROVE_REQUEST_LABEL,
  CONFIRM_CALC_LABEL,
  SET_REFUND_AMOUNT_LABEL,
  adminStatusHint,
  calculationStatusLabel,
  canAdminApprove,
  canAdminConfirm,
  canAdminCreateRevision,
  canAdminNeedsInformation,
  canAdminRecalculate,
  canAdminReject,
  checkoutStatusLabel,
  extractInputFingerprint,
  formatAuditDecisionLine,
  formatAuditAllowedDetails,
  formatMoneyAmount,
  formatRecommendedOrManual,
  formatRecommendedRefundAmount,
  formatRefundDate,
  formatSnapshotJson,
  MANUAL_AMOUNT_LABEL,
  MANUAL_REVIEW_GUIDANCE,
  parseRefundCalcDisplay,
  parseUsageDisplay,
  paymentStatusLabel,
  productTypeLabel,
  providerLabel,
  reasonCategoryLabel,
  refundStatusLabel,
  resolveNextAdminStep,
  revisionTypeLabel,
  yesNoRu,
} from './refundAdminDisplay';

type LoadState = 'loading' | 'ready' | 'empty' | 'error' | 'forbidden';
type AdminAction =
  | 'recalculate'
  | 'revision'
  | 'needs_information'
  | 'reject'
  | 'confirm'
  | 'approve'
  | null;

type ListFilters = {
  status: string;
  userId: string;
  reason: string;
  manualReview: 'all' | 'yes' | 'no';
};

const EMPTY_LIST_FILTERS: ListFilters = {
  status: '',
  userId: '',
  reason: '',
  manualReview: 'all',
};

function listFiltersAreActive(f: ListFilters): boolean {
  return (
    Boolean(f.status) || Boolean(f.userId.trim()) || Boolean(f.reason) || f.manualReview !== 'all'
  );
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${FINANCE_COLORS.accentBorder}`,
  background: FINANCE_COLORS.fieldBg,
  color: FINANCE_COLORS.text,
  fontSize: 14,
  boxSizing: 'border-box',
};

const btnBase: React.CSSProperties = {
  padding: '10px 14px',
  minHeight: 40,
  borderRadius: 8,
  border: `1px solid ${FINANCE_COLORS.accentBorder}`,
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
};

function Section({
  title,
  children,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        background: FINANCE_COLORS.panelBgElevated,
        border: `1px solid ${FINANCE_COLORS.accentBorder}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>{title}</h3>
      {children}
    </div>
  );
}

function CollapsibleSection({
  title,
  children,
  testId,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  testId?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details
      data-testid={testId}
      open={defaultOpen || undefined}
      style={{
        background: FINANCE_COLORS.panelBgElevated,
        border: `1px solid ${FINANCE_COLORS.accentBorder}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          fontSize: 16,
          fontWeight: 700,
          color: FINANCE_COLORS.text,
          listStyle: 'revert',
        }}
      >
        {title}
      </summary>
      <div style={{ marginTop: 12 }}>{children}</div>
    </details>
  );
}

function Kv({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 8, fontSize: 14 }}>
      <div style={{ color: FINANCE_COLORS.textSecondary, marginBottom: 2 }}>{label}</div>
      <div style={{ color: FINANCE_COLORS.text, wordBreak: 'break-word' }}>{value}</div>
    </div>
  );
}

function TechAccordion({ children }: { children: React.ReactNode }) {
  return (
    <details
      data-testid="refund-admin-tech-details"
      style={{
        background: FINANCE_COLORS.panelBgElevated,
        border: `1px solid ${FINANCE_COLORS.accentBorder}`,
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          fontSize: 16,
          fontWeight: 700,
          color: FINANCE_COLORS.text,
          listStyle: 'revert',
        }}
      >
        Технические детали
      </summary>
      <div style={{ marginTop: 14 }}>{children}</div>
    </details>
  );
}

export default function RefundsAdminPanel() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<RefundAdminListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);
  const [offset, setOffset] = useState(0);

  const [statusFilter, setStatusFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [reasonFilter, setReasonFilter] = useState('');
  const [manualReviewFilter, setManualReviewFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [appliedFilters, setAppliedFilters] = useState<ListFilters>(EMPTY_LIST_FILTERS);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RefundAdminDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [versionConflict, setVersionConflict] = useState(false);

  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<AdminAction>(null);
  const [reasonText, setReasonText] = useState('');
  const [revisionAmount, setRevisionAmount] = useState('');
  const [adjustmentCategory, setAdjustmentCategory] = useState('policy');
  const [adjustmentComment, setAdjustmentComment] = useState('');
  const [confirmDanger, setConfirmDanger] = useState<AdminAction>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const loadList = useCallback(
    async (opts?: { silent?: boolean; nextOffset?: number; filters?: ListFilters }) => {
      const off = opts?.nextOffset ?? offset;
      const filters = opts?.filters ?? appliedFilters;
      if (!opts?.silent) {
        setLoadState('loading');
        setErrorMessage(null);
      }
      try {
        const userIdNum = filters.userId.trim() ? Number(filters.userId.trim()) : undefined;
        const data = await listAdminRefunds({
          status: filters.status || undefined,
          user_id: userIdNum && Number.isFinite(userIdNum) && userIdNum > 0 ? userIdNum : undefined,
          reason_category: filters.reason || undefined,
          manual_review:
            filters.manualReview === 'yes'
              ? true
              : filters.manualReview === 'no'
                ? false
                : undefined,
          limit,
          offset: off,
        });
        setItems(data.items);
        setTotal(data.total);
        setOffset(data.offset);
        setLoadState(data.items.length === 0 ? 'empty' : 'ready');
      } catch (err) {
        const msg = safeAdminRefundErrorMessage(err);
        setErrorMessage(msg);
        setItems([]);
        setTotal(0);
        const status = (err as { status?: number })?.status;
        setLoadState(status === 401 || status === 403 ? 'forbidden' : 'error');
      }
    },
    [offset, appliedFilters, limit]
  );

  const loadDetail = useCallback(async (id: number, opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setDetailLoading(true);
      setDetailError(null);
      setVersionConflict(false);
    }
    try {
      const data = await getAdminRefund(id);
      setDetail(data);
      setDetailError(null);
      setVersionConflict(false);
      if (data.current_revision?.proposed_refund_amount) {
        setRevisionAmount(data.current_revision.proposed_refund_amount);
      } else {
        setRevisionAmount('');
      }
    } catch (err) {
      setDetail(null);
      setDetailError(safeAdminRefundErrorMessage(err));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    if (selectedId != null) {
      loadDetail(selectedId);
    } else {
      setDetail(null);
      setDetailError(null);
    }
  }, [selectedId, loadDetail]);

  const applyFilters = () => {
    const next: ListFilters = {
      status: statusFilter,
      userId: userIdFilter,
      reason: reasonFilter,
      manualReview: manualReviewFilter,
    };
    setAppliedFilters(next);
    setOffset(0);
    loadList({ nextOffset: 0, filters: next });
  };

  const openDetail = (id: number) => {
    setSelectedId(id);
    setAction(null);
    setConfirmDanger(null);
    setFormError(null);
    setReasonText('');
    setAdjustmentComment('');
  };

  const backToList = () => {
    setSelectedId(null);
    setDetail(null);
    setAction(null);
    setConfirmDanger(null);
    loadList({ silent: true });
  };

  const runAction = async (kind: AdminAction) => {
    if (!detail || !kind) return;
    const version = detail.request.version;
    const id = detail.request.id;
    setFormError(null);

    if ((kind === 'needs_information' || kind === 'reject') && !reasonText.trim()) {
      setFormError('Укажите причину — поле обязательно.');
      return;
    }
    if (kind === 'revision') {
      if (!revisionAmount.trim()) {
        setFormError('Укажите сумму возврата.');
        return;
      }
      if (!adjustmentCategory.trim()) {
        setFormError('Укажите категорию корректировки.');
        return;
      }
      if (!adjustmentComment.trim()) {
        setFormError('Комментарий к корректировке обязателен.');
        return;
      }
      if (!detail.current_revision) {
        setFormError('Нет текущей ревизии для правки.');
        return;
      }
    }
    if (kind === 'approve' && !detail.current_revision) {
      setFormError('Нет текущей ревизии для одобрения.');
      return;
    }

    if ((kind === 'reject' || kind === 'approve') && confirmDanger !== kind) {
      setConfirmDanger(kind);
      return;
    }

    setBusy(true);
    try {
      let next: RefundAdminDetail;
      if (kind === 'recalculate') {
        next = await adminRecalculateRefund(id, version);
      } else if (kind === 'revision') {
        next = await adminCreateRefundRevision(id, {
          expected_version: version,
          based_on_revision_id: detail.current_revision!.id,
          proposed_refund_amount: revisionAmount.trim(),
          adjustment_reason_category: adjustmentCategory.trim(),
          adjustment_comment: adjustmentComment.trim(),
        });
      } else if (kind === 'needs_information') {
        next = await adminNeedsInformation(id, version, reasonText.trim());
      } else if (kind === 'reject') {
        next = await adminRejectRefund(id, version, reasonText.trim());
      } else if (kind === 'confirm') {
        next = await adminConfirmRefund(id, version);
      } else {
        next = await adminApproveRefund(id, version, detail.current_revision!.id);
      }
      setDetail(next);
      setAction(null);
      setConfirmDanger(null);
      setReasonText('');
      setAdjustmentComment('');
      setVersionConflict(false);
      toast.success('Действие выполнено');
      await loadList({ silent: true });
    } catch (err) {
      if (isVersionConflictError(err)) {
        setVersionConflict(true);
        setFormError(safeAdminRefundErrorMessage(err));
      } else {
        setFormError(safeAdminRefundErrorMessage(err));
        toast.error(safeAdminRefundErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const page = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  if (selectedId != null) {
    return (
      <div data-testid="refund-admin-detail">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            type="button"
            data-testid="refund-admin-back"
            onClick={backToList}
            style={{
              ...btnBase,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'transparent',
              color: FINANCE_COLORS.text,
            }}
          >
            <ArrowLeft size={16} />К очереди
          </button>
          <button
            type="button"
            data-testid="refund-admin-detail-refresh"
            disabled={detailLoading || busy}
            onClick={() => selectedId && loadDetail(selectedId)}
            style={{
              ...btnBase,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'transparent',
              color: FINANCE_COLORS.text,
            }}
          >
            <RefreshCw size={16} />
            Обновить карточку
          </button>
        </div>

        <p
          data-testid="refund-admin-money-disclaimer"
          style={{
            margin: '0 0 16px',
            padding: 12,
            borderRadius: 8,
            background: 'rgba(59, 130, 246, 0.12)',
            border: '1px solid rgba(59, 130, 246, 0.35)',
            color: FINANCE_COLORS.text,
            fontSize: 14,
          }}
        >
          {ADMIN_NO_MONEY_MOVED}
        </p>

        {detailLoading && !detail && (
          <div data-testid="refund-admin-detail-loading">Загрузка карточки…</div>
        )}
        {detailError && (
          <div data-testid="refund-admin-detail-error" style={{ color: FINANCE_COLORS.danger }}>
            {detailError}
          </div>
        )}

        {versionConflict && (
          <div
            data-testid="refund-admin-version-conflict"
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 8,
              border: `1px solid ${FINANCE_COLORS.danger}`,
              color: FINANCE_COLORS.text,
            }}
          >
            Данные устарели. Обновите карточку, затем повторите действие.
            <button
              type="button"
              data-testid="refund-admin-conflict-refresh"
              onClick={() => selectedId && loadDetail(selectedId)}
              style={{
                ...btnBase,
                marginLeft: 12,
                background: FINANCE_COLORS.accent,
                color: '#111',
              }}
            >
              Обновить сейчас
            </button>
          </div>
        )}

        {detail && (
          <>
            {(() => {
              const usage = parseUsageDisplay(detail.usage_snapshot);
              const calc = parseRefundCalcDisplay(
                detail.financial_snapshot,
                detail.current_revision
              );
              const currency =
                calc.currency ||
                detail.product?.currency ||
                detail.current_revision?.currency ||
                'RUB';
              const fingerprint = extractInputFingerprint(
                detail.financial_snapshot,
                detail.current_revision?.calculation_snapshot
              );
              const recommendedLabel = formatRecommendedOrManual(
                detail.request.recommended_refund_amount ?? calc.recommended,
                {
                  proposedAmountUndefined: detail.request.proposed_amount_undefined,
                  manualReviewRequired: detail.request.manual_review_required,
                  currency,
                }
              );
              const nextStep = resolveNextAdminStep(detail.request.status, {
                manualReviewRequired: detail.request.manual_review_required,
              });
              const statusHint = nextStep.statusNote || adminStatusHint(detail.request.status);
              const purchaseLabel = detail.product
                ? `${detail.product.product_name} · ${productTypeLabel(detail.product.product_type)}`
                : '—';
              const paidLabel = formatMoneyAmount(
                calc.paid ?? detail.product?.amount ?? detail.payment_attempt?.amount,
                currency
              );
              const usedLabel = usage.hasData
                ? `${usage.messagesUsed} сообщ. · ${usage.activeBots} бот. · ${usage.teamMembers} уч.`
                : formatMoneyAmount(calc.alreadyRefunded ?? '0.00', currency);
              const showApprove =
                nextStep.primaryAction === 'approve' && canAdminApprove(detail.request.status);
              const showConfirm =
                nextStep.primaryAction === 'confirm' && canAdminConfirm(detail.request.status);
              const showRevisionPrimary =
                nextStep.primaryAction === 'revision' &&
                canAdminCreateRevision(detail.request.status);
              const showRevisionSecondary =
                !showRevisionPrimary && canAdminCreateRevision(detail.request.status);
              const openAction = (next: AdminAction) => {
                setAction(next);
                setConfirmDanger(null);
                setFormError(null);
              };

              return (
                <>
                  <Section title="Сводка решения" testId="refund-admin-detail-card">
                    <p
                      style={{
                        margin: '0 0 10px',
                        fontSize: 13,
                        color: FINANCE_COLORS.textSecondary,
                      }}
                    >
                      Заявка №{detail.request.id}
                    </p>
                    <Kv
                      label="Статус"
                      value={
                        <span data-testid="refund-admin-detail-status">
                          {refundStatusLabel(detail.request.status)}
                        </span>
                      }
                    />
                    {statusHint && (
                      <p
                        data-testid="refund-admin-detail-status-hint"
                        style={{ color: FINANCE_COLORS.textSecondary, fontSize: 14 }}
                      >
                        {statusHint}
                      </p>
                    )}
                    {nextStep.blockedNotes.length > 0 && (
                      <ul
                        data-testid="refund-admin-blocked-notes"
                        style={{
                          margin: '0 0 10px',
                          paddingLeft: 18,
                          color: FINANCE_COLORS.textSecondary,
                          fontSize: 13,
                        }}
                      >
                        {nextStep.blockedNotes.map(note => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    )}
                    <Kv label="Покупка" value={purchaseLabel} />
                    <Kv label="Оплачено" value={paidLabel} />
                    <Kv label="Использовано" value={usedLabel} />
                    <Kv
                      label="Доступно к возврату"
                      value={formatMoneyAmount(calc.available, currency)}
                    />
                    <Kv
                      label="Рекомендуемая сумма"
                      value={
                        <span data-testid="refund-admin-detail-amount">{recommendedLabel}</span>
                      }
                    />
                    <Kv
                      label="Причина"
                      value={
                        <span data-testid="refund-admin-reason">
                          {reasonCategoryLabel(detail.request.reason_category)}
                        </span>
                      }
                    />
                    <Kv
                      label="Требуется ручная проверка"
                      value={yesNoRu(detail.request.manual_review_required)}
                    />
                    <Kv
                      label="Следующее необходимое действие"
                      value={
                        <span data-testid="refund-admin-next-action">
                          {nextStep.nextActionText}
                        </span>
                      }
                    />
                    {detail.request.manual_review_required && (
                      <p
                        data-testid="refund-admin-manual-review"
                        style={{ color: '#f59e0b', fontSize: 14, margin: '8px 0 0' }}
                      >
                        {MANUAL_REVIEW_GUIDANCE}
                      </p>
                    )}
                    <p
                      data-testid="refund-admin-stage-no-payout"
                      style={{
                        margin: '12px 0 0',
                        fontSize: 13,
                        color: FINANCE_COLORS.textSecondary,
                      }}
                    >
                      {ADMIN_STAGE_NO_PAYOUT}
                    </p>
                  </Section>

                  <div
                    data-testid="refund-admin-actions"
                    style={{
                      position: 'sticky',
                      top: 0,
                      zIndex: 5,
                      background: FINANCE_COLORS.panelBgElevated,
                      border: `1px solid ${FINANCE_COLORS.accentBorder}`,
                      borderRadius: 12,
                      padding: 16,
                      marginBottom: 12,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                    }}
                  >
                    <h3 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>
                      Действия администратора
                    </h3>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginBottom: action ? 12 : 0,
                      }}
                    >
                      {showRevisionPrimary && (
                        <button
                          type="button"
                          data-testid="refund-admin-action-revision"
                          disabled={busy}
                          onClick={() => openAction('revision')}
                          style={{
                            ...btnBase,
                            background: FINANCE_COLORS.accent,
                            color: '#111',
                            borderColor: FINANCE_COLORS.accent,
                          }}
                        >
                          {SET_REFUND_AMOUNT_LABEL}
                        </button>
                      )}
                      {showConfirm && (
                        <button
                          type="button"
                          data-testid="refund-admin-action-confirm"
                          disabled={busy}
                          onClick={() => openAction('confirm')}
                          style={{
                            ...btnBase,
                            background: FINANCE_COLORS.accent,
                            color: '#111',
                            borderColor: FINANCE_COLORS.accent,
                          }}
                        >
                          {CONFIRM_CALC_LABEL}
                        </button>
                      )}
                      {showApprove && (
                        <button
                          type="button"
                          data-testid="refund-admin-action-approve"
                          disabled={busy}
                          onClick={() => openAction('approve')}
                          style={{
                            ...btnBase,
                            background: FINANCE_COLORS.accent,
                            color: '#111',
                            borderColor: FINANCE_COLORS.accent,
                          }}
                        >
                          {APPROVE_REQUEST_LABEL}
                        </button>
                      )}
                      {canAdminRecalculate(detail.request.status) && (
                        <button
                          type="button"
                          data-testid="refund-admin-action-recalculate"
                          disabled={busy}
                          onClick={() => openAction('recalculate')}
                          style={{
                            ...btnBase,
                            background: 'transparent',
                            color: FINANCE_COLORS.text,
                          }}
                        >
                          Пересчитать
                        </button>
                      )}
                      {showRevisionSecondary && (
                        <button
                          type="button"
                          data-testid="refund-admin-action-revision"
                          disabled={busy}
                          onClick={() => openAction('revision')}
                          style={{
                            ...btnBase,
                            background: 'transparent',
                            color: FINANCE_COLORS.text,
                          }}
                        >
                          Корректировка администратора
                        </button>
                      )}
                      {canAdminNeedsInformation(detail.request.status) && (
                        <button
                          type="button"
                          data-testid="refund-admin-action-needs-info"
                          disabled={busy}
                          onClick={() => openAction('needs_information')}
                          style={{
                            ...btnBase,
                            background: 'transparent',
                            color: FINANCE_COLORS.text,
                          }}
                        >
                          Запросить сведения
                        </button>
                      )}
                      {canAdminReject(detail.request.status) && (
                        <button
                          type="button"
                          data-testid="refund-admin-action-reject"
                          disabled={busy}
                          onClick={() => openAction('reject')}
                          style={{
                            ...btnBase,
                            background: 'transparent',
                            color: FINANCE_COLORS.danger,
                          }}
                        >
                          Отклонить
                        </button>
                      )}
                    </div>

                    {action && (
                      <div
                        data-testid="refund-admin-action-form"
                        style={{
                          padding: 12,
                          borderRadius: 8,
                          border: `1px solid ${FINANCE_COLORS.accentBorder}`,
                        }}
                      >
                        {action === 'recalculate' && (
                          <p style={{ marginTop: 0 }}>Создать новый автоматический расчёт?</p>
                        )}
                        {action === 'confirm' && (
                          <p style={{ marginTop: 0 }}>
                            Перевести заявку в ожидание финального подтверждения?
                          </p>
                        )}
                        {(action === 'needs_information' || action === 'reject') && (
                          <div style={{ marginBottom: 10 }}>
                            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                              Причина *
                            </label>
                            <textarea
                              data-testid="refund-admin-action-reason"
                              value={reasonText}
                              onChange={e => setReasonText(e.target.value)}
                              rows={3}
                              style={fieldStyle}
                              required
                            />
                          </div>
                        )}
                        {action === 'revision' && (
                          <>
                            <div style={{ marginBottom: 10 }}>
                              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                                Сумма возврата *
                              </label>
                              <input
                                data-testid="refund-admin-revision-amount"
                                value={revisionAmount}
                                onChange={e => setRevisionAmount(e.target.value)}
                                style={fieldStyle}
                              />
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                                Категория корректировки *
                              </label>
                              <select
                                data-testid="refund-admin-revision-category"
                                value={adjustmentCategory}
                                onChange={e => setAdjustmentCategory(e.target.value)}
                                style={fieldStyle}
                              >
                                {ADJUSTMENT_REASON_OPTIONS.map(o => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div style={{ marginBottom: 10 }}>
                              <label style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
                                Комментарий *
                              </label>
                              <textarea
                                data-testid="refund-admin-revision-comment"
                                value={adjustmentComment}
                                onChange={e => setAdjustmentComment(e.target.value)}
                                rows={3}
                                style={fieldStyle}
                              />
                            </div>
                          </>
                        )}
                        {action === 'approve' && (
                          <p style={{ marginTop: 0 }} data-testid="refund-admin-approve-notice">
                            {ADMIN_STAGE_NO_PAYOUT}
                          </p>
                        )}
                        {confirmDanger && (
                          <p
                            data-testid="refund-admin-danger-confirm"
                            style={{ color: FINANCE_COLORS.danger, fontWeight: 600 }}
                          >
                            Подтвердите опасное действие ещё раз кнопкой ниже.
                          </p>
                        )}
                        {formError && (
                          <p
                            data-testid="refund-admin-action-error"
                            style={{ color: FINANCE_COLORS.danger }}
                          >
                            {formError}
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            data-testid="refund-admin-action-submit"
                            disabled={busy}
                            onClick={() => runAction(action)}
                            style={{
                              ...btnBase,
                              background: FINANCE_COLORS.accent,
                              color: '#111',
                              borderColor: FINANCE_COLORS.accent,
                            }}
                          >
                            {confirmDanger === action
                              ? 'Подтверждаю'
                              : busy
                                ? 'Выполнение…'
                                : 'Выполнить'}
                          </button>
                          <button
                            type="button"
                            data-testid="refund-admin-action-cancel"
                            disabled={busy}
                            onClick={() => {
                              setAction(null);
                              setConfirmDanger(null);
                              setFormError(null);
                            }}
                            style={{
                              ...btnBase,
                              background: 'transparent',
                              color: FINANCE_COLORS.text,
                            }}
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <Section title="Расчёт возврата" testId="refund-admin-calc">
                    <Kv label="Оплачено" value={formatMoneyAmount(calc.paid, currency)} />
                    <Kv
                      label="Уже возвращено"
                      value={formatMoneyAmount(calc.alreadyRefunded ?? '0.00', currency)}
                    />
                    <Kv
                      label="Зарезервировано"
                      value={formatMoneyAmount(calc.reserved ?? '0.00', currency)}
                    />
                    <Kv
                      label="Доступно к возврату"
                      value={formatMoneyAmount(calc.available, currency)}
                    />
                    <Kv
                      label="Рекомендуемая сумма"
                      value={
                        <span data-testid="refund-admin-calc-recommended">{recommendedLabel}</span>
                      }
                    />
                    {detail.current_revision && (
                      <>
                        <Kv
                          label="Текущий расчёт"
                          value={`№${detail.current_revision.revision_number} · ${revisionTypeLabel(
                            detail.current_revision.revision_type
                          )}`}
                        />
                        <Kv
                          label="Статус расчёта"
                          value={calculationStatusLabel(detail.current_revision.calculation_status)}
                        />
                      </>
                    )}
                    {detail.approved_revision && (
                      <Kv
                        label="Одобренная сумма"
                        value={formatMoneyAmount(
                          detail.approved_revision.final_refund_amount ??
                            detail.approved_revision.proposed_refund_amount,
                          detail.approved_revision.currency
                        )}
                      />
                    )}
                  </Section>

                  <CollapsibleSection
                    title="Пользователь и покупка"
                    testId="refund-admin-user-purchase"
                  >
                    <div data-testid="refund-admin-user">
                      {detail.user ? (
                        <>
                          <Kv label="Email" value={detail.user.email} />
                          <Kv label="Имя" value={detail.user.name || '—'} />
                          <Kv label="ID" value={detail.user.id} />
                          <Kv label="Тариф" value={detail.user.plan_code || '—'} />
                        </>
                      ) : (
                        <p style={{ color: FINANCE_COLORS.textSecondary }}>
                          Нет данных о пользователе
                        </p>
                      )}
                    </div>
                    <div data-testid="refund-admin-purchase" style={{ marginTop: 8 }}>
                      {detail.product ? (
                        <>
                          <Kv label="Название" value={detail.product.product_name} />
                          <Kv label="Тип" value={productTypeLabel(detail.product.product_type)} />
                          <Kv
                            label="Сумма покупки"
                            value={formatMoneyAmount(
                              detail.product.amount,
                              detail.product.currency
                            )}
                          />
                        </>
                      ) : (
                        <p style={{ color: FINANCE_COLORS.textSecondary }}>Нет данных о покупке</p>
                      )}
                    </div>
                    <div data-testid="refund-admin-user-comment" style={{ marginTop: 8 }}>
                      <Kv
                        label="Комментарий пользователя"
                        value={detail.request.user_comment?.trim() || '—'}
                      />
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="Платёж" testId="refund-admin-payment">
                    {detail.payment_attempt || detail.checkout_intent ? (
                      <>
                        {detail.payment_attempt && (
                          <>
                            <Kv
                              label="Сумма"
                              value={formatMoneyAmount(
                                detail.payment_attempt.amount,
                                detail.payment_attempt.currency
                              )}
                            />
                            <Kv
                              label="Провайдер"
                              value={providerLabel(detail.payment_attempt.provider)}
                            />
                            <Kv
                              label="Статус платежа"
                              value={paymentStatusLabel(detail.payment_attempt.status)}
                            />
                          </>
                        )}
                        {detail.checkout_intent && (
                          <>
                            <Kv
                              label="Статус покупки"
                              value={checkoutStatusLabel(detail.checkout_intent.status)}
                            />
                            <Kv
                              label="Оплачено"
                              value={formatRefundDate(detail.checkout_intent.paid_at)}
                            />
                          </>
                        )}
                      </>
                    ) : (
                      <p style={{ color: FINANCE_COLORS.textSecondary }}>Нет данных</p>
                    )}
                  </CollapsibleSection>

                  <CollapsibleSection title="Использование" testId="refund-admin-usage">
                    {usage.hasData ? (
                      <>
                        <Kv label="Сообщений использовано" value={usage.messagesUsed} />
                        <Kv label="Активных ботов" value={usage.activeBots} />
                        <Kv label="Участников команды" value={usage.teamMembers} />
                        <Kv
                          label="Была ли активность после покупки"
                          value={
                            usage.activityAfterPurchase == null
                              ? 'Нет данных'
                              : yesNoRu(usage.activityAfterPurchase)
                          }
                        />
                      </>
                    ) : (
                      <p style={{ color: FINANCE_COLORS.textSecondary }}>
                        Нет данных об использовании
                      </p>
                    )}
                  </CollapsibleSection>

                  <CollapsibleSection
                    title="История ревизий"
                    testId="refund-admin-current-revision"
                  >
                    {detail.current_revision ? (
                      <>
                        <Kv label="Текущая №" value={detail.current_revision.revision_number} />
                        <Kv
                          label="Тип"
                          value={revisionTypeLabel(detail.current_revision.revision_type)}
                        />
                        <Kv
                          label="Предложенная сумма"
                          value={
                            detail.current_revision.proposed_amount_undefined ||
                            detail.request.manual_review_required
                              ? MANUAL_AMOUNT_LABEL
                              : formatRecommendedOrManual(
                                  detail.current_revision.proposed_refund_amount,
                                  {
                                    proposedAmountUndefined:
                                      detail.current_revision.proposed_amount_undefined,
                                    currency: detail.current_revision.currency,
                                  }
                                )
                          }
                        />
                        <Kv
                          label="Статус расчёта"
                          value={calculationStatusLabel(detail.current_revision.calculation_status)}
                        />
                      </>
                    ) : (
                      <p>Нет текущей ревизии</p>
                    )}
                    <div data-testid="refund-admin-approved-revision" style={{ marginTop: 8 }}>
                      {detail.approved_revision ? (
                        <>
                          <Kv
                            label="Одобренная №"
                            value={detail.approved_revision.revision_number}
                          />
                          <Kv
                            label="Сумма"
                            value={formatMoneyAmount(
                              detail.approved_revision.final_refund_amount ??
                                detail.approved_revision.proposed_refund_amount,
                              detail.approved_revision.currency
                            )}
                          />
                        </>
                      ) : (
                        <p style={{ color: FINANCE_COLORS.textSecondary }}>Ещё не одобрена</p>
                      )}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="История решений" testId="refund-admin-audit">
                    {detail.audit_timeline.length === 0 ? (
                      <p>Событий нет</p>
                    ) : (
                      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {detail.audit_timeline.map(e => {
                          const detailsLine = formatAuditAllowedDetails(
                            e.details ??
                              (e.event_metadata &&
                              typeof e.event_metadata === 'object' &&
                              !Array.isArray(e.event_metadata)
                                ? (e.event_metadata as Record<string, unknown>)
                                : null)
                          );
                          return (
                            <li
                              key={e.id}
                              data-testid={`refund-admin-audit-${e.id}`}
                              style={{
                                padding: '8px 0',
                                borderBottom: `1px solid ${FINANCE_COLORS.accentBorder}`,
                                fontSize: 13,
                              }}
                            >
                              <div>{formatAuditDecisionLine(e)}</div>
                              {e.action ? (
                                <div
                                  style={{
                                    marginTop: 4,
                                    fontSize: 11,
                                    color: FINANCE_COLORS.textSecondary,
                                  }}
                                >
                                  tech: {e.action}
                                </div>
                              ) : null}
                              {detailsLine ? (
                                <div
                                  data-testid={`refund-admin-audit-details-${e.id}`}
                                  style={{
                                    marginTop: 4,
                                    fontSize: 12,
                                    color: FINANCE_COLORS.textSecondary,
                                  }}
                                >
                                  {detailsLine}
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CollapsibleSection>

                  <TechAccordion>
                    <Kv label="Версия записи" value={detail.request.version} />
                    <Kv label="ID заявки" value={detail.request.id} />
                    {detail.product && (
                      <Kv
                        label="Код продукта"
                        value={`${detail.product.product_type} · ${detail.product.product_code}`}
                      />
                    )}
                    {detail.checkout_intent && (
                      <Kv
                        label="Checkout intent"
                        value={`#${detail.checkout_intent.id} · ${detail.checkout_intent.status}`}
                      />
                    )}
                    {detail.payment_attempt && (
                      <Kv
                        label="Payment attempt"
                        value={`#${detail.payment_attempt.id} · ${detail.payment_attempt.provider} · ${detail.payment_attempt.status}`}
                      />
                    )}
                    <Kv label="input_fingerprint" value={fingerprint || '—'} />
                    {detail.current_revision && (
                      <>
                        <Kv
                          label="calculation_status (raw)"
                          value={detail.current_revision.calculation_status}
                        />
                        <Kv label="refund_type (raw)" value={detail.current_revision.refund_type} />
                        <Kv
                          label="entitlement_action (raw)"
                          value={detail.current_revision.entitlement_action}
                        />
                      </>
                    )}

                    <div style={{ marginTop: 12, marginBottom: 8, fontWeight: 600 }}>
                      Usage snapshot
                    </div>
                    <pre
                      data-testid="refund-admin-usage-snapshot"
                      style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        fontSize: 12,
                        color: FINANCE_COLORS.textSecondary,
                      }}
                    >
                      {formatSnapshotJson(detail.usage_snapshot)}
                    </pre>

                    <div style={{ marginTop: 12, marginBottom: 8, fontWeight: 600 }}>
                      Financial snapshot
                    </div>
                    <pre
                      data-testid="refund-admin-financial-snapshot"
                      style={{
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        fontSize: 12,
                        color: FINANCE_COLORS.textSecondary,
                      }}
                    >
                      {formatSnapshotJson(detail.financial_snapshot)}
                    </pre>

                    {detail.current_revision?.calculation_snapshot && (
                      <>
                        <div style={{ marginTop: 12, marginBottom: 8, fontWeight: 600 }}>
                          Calculation snapshot
                        </div>
                        <pre
                          style={{
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            fontSize: 12,
                            color: FINANCE_COLORS.textSecondary,
                          }}
                        >
                          {formatSnapshotJson(detail.current_revision.calculation_snapshot)}
                        </pre>
                      </>
                    )}

                    <div data-testid="refund-admin-revisions" style={{ marginTop: 16 }}>
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>Все ревизии</div>
                      {detail.revisions.length === 0 ? (
                        <p style={{ color: FINANCE_COLORS.textSecondary }}>Ревизий нет</p>
                      ) : (
                        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                          {detail.revisions.map(r => (
                            <li
                              key={r.id}
                              data-testid={`refund-admin-revision-${r.id}`}
                              style={{
                                padding: '8px 0',
                                borderBottom: `1px solid ${FINANCE_COLORS.accentBorder}`,
                                fontSize: 13,
                              }}
                            >
                              #{r.revision_number} · {revisionTypeLabel(r.revision_type)} ·{' '}
                              {r.proposed_amount_undefined
                                ? MANUAL_AMOUNT_LABEL
                                : formatMoneyAmount(r.proposed_refund_amount, r.currency)}{' '}
                              · {calculationStatusLabel(r.calculation_status)} ·{' '}
                              {formatRefundDate(r.created_at)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </TechAccordion>
                </>
              );
            })()}
          </>
        )}
      </div>
    );
  }

  return (
    <div data-testid="refund-admin-queue">
      <p
        data-testid="refund-admin-queue-disclaimer"
        style={{ margin: '0 0 16px', color: FINANCE_COLORS.textSecondary, fontSize: 14 }}
      >
        {ADMIN_NO_MONEY_MOVED}
      </p>

      <div
        data-testid="refund-admin-filters"
        style={{
          background: FINANCE_COLORS.panelBgElevated,
          border: `1px solid ${FINANCE_COLORS.accentBorder}`,
          borderRadius: 12,
          padding: 14,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: FINANCE_COLORS.textSecondary,
            marginBottom: 10,
          }}
        >
          Фильтры
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <span style={{ color: FINANCE_COLORS.textSecondary }}>Статус</span>
            <select
              data-testid="refund-admin-filter-status"
              aria-label="Статус"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              style={fieldStyle}
            >
              {ADMIN_STATUS_FILTER_OPTIONS.map(o => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <span style={{ color: FINANCE_COLORS.textSecondary }}>Пользователь</span>
            <input
              data-testid="refund-admin-filter-user"
              aria-label="Пользователь"
              placeholder="ID пользователя"
              value={userIdFilter}
              onChange={e => setUserIdFilter(e.target.value)}
              style={fieldStyle}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <span style={{ color: FINANCE_COLORS.textSecondary }}>Причина</span>
            <select
              data-testid="refund-admin-filter-reason"
              aria-label="Причина"
              value={reasonFilter}
              onChange={e => setReasonFilter(e.target.value)}
              style={fieldStyle}
            >
              {ADMIN_REASON_FILTER_OPTIONS.map(o => (
                <option key={o.value || 'all-reason'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
            <span style={{ color: FINANCE_COLORS.textSecondary }}>Ручная проверка</span>
            <select
              data-testid="refund-admin-filter-manual"
              aria-label="Ручная проверка"
              value={manualReviewFilter}
              onChange={e => setManualReviewFilter(e.target.value as 'all' | 'yes' | 'no')}
              style={fieldStyle}
            >
              {ADMIN_MANUAL_REVIEW_FILTER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            data-testid="refund-admin-filter-apply"
            onClick={applyFilters}
            style={{ ...btnBase, background: FINANCE_COLORS.accent, color: '#111' }}
          >
            Применить
          </button>
          <button
            type="button"
            data-testid="refund-admin-list-refresh"
            onClick={() => loadList()}
            style={{
              ...btnBase,
              background: 'transparent',
              color: FINANCE_COLORS.text,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <RefreshCw size={16} />
            Обновить
          </button>
        </div>
      </div>

      {loadState === 'loading' && <div data-testid="refund-admin-loading">Загрузка очереди…</div>}
      {loadState === 'forbidden' && <div data-testid="refund-admin-forbidden">{errorMessage}</div>}
      {loadState === 'error' && (
        <div data-testid="refund-admin-error" style={{ display: 'flex', gap: 8 }}>
          <AlertTriangle color={FINANCE_COLORS.danger} />
          <span>{errorMessage}</span>
        </div>
      )}
      {loadState === 'empty' && (
        <div data-testid="refund-admin-empty">
          {listFiltersAreActive(appliedFilters)
            ? 'По выбранным фильтрам заявки не найдены'
            : 'Заявок на возврат пока нет'}
        </div>
      )}

      {loadState === 'ready' && (
        <div
          data-testid="refund-admin-list"
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {items.map(row => (
            <div
              key={row.id}
              data-testid={`refund-admin-row-${row.id}`}
              style={{
                background: FINANCE_COLORS.panelBgElevated,
                border: `1px solid ${FINANCE_COLORS.accentBorder}`,
                borderRadius: 12,
                padding: 14,
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Заявка №{row.id}</div>
                <div style={{ fontSize: 13, color: FINANCE_COLORS.textSecondary }}>
                  {row.user_email || `user #${row.user_id}`} · {refundStatusLabel(row.status)}
                  {row.manual_review_required ? ' · ручная проверка' : ''}
                </div>
                <div style={{ fontSize: 13, marginTop: 4 }}>
                  {row.product_name || 'Покупка'} ·{' '}
                  {formatRecommendedRefundAmount(row.recommended_refund_amount, {
                    proposedAmountUndefined: row.proposed_amount_undefined,
                    currency: row.currency,
                  })}
                </div>
                <div style={{ fontSize: 12, color: FINANCE_COLORS.textSecondary, marginTop: 4 }}>
                  {reasonCategoryLabel(row.reason_category)} · {formatRefundDate(row.submitted_at)}
                </div>
              </div>
              <button
                type="button"
                data-testid={`refund-admin-open-${row.id}`}
                onClick={() => openDetail(row.id)}
                style={{ ...btnBase, background: 'transparent', color: FINANCE_COLORS.text }}
              >
                Открыть
              </button>
            </div>
          ))}
        </div>
      )}

      {(loadState === 'ready' || loadState === 'empty') && total > 0 && (
        <div
          data-testid="refund-admin-pagination"
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            marginTop: 16,
            marginBottom: 24,
            paddingBottom: 8,
          }}
        >
          <button
            type="button"
            data-testid="refund-admin-page-prev"
            disabled={offset <= 0}
            onClick={() => loadList({ nextOffset: Math.max(0, offset - limit) })}
            style={{ ...btnBase, background: 'transparent', color: FINANCE_COLORS.text }}
          >
            Назад
          </button>
          <span style={{ fontSize: 13, color: FINANCE_COLORS.textSecondary }}>
            Стр. {page} / {pageCount} · всего {total}
          </span>
          <button
            type="button"
            data-testid="refund-admin-page-next"
            disabled={offset + limit >= total}
            onClick={() => loadList({ nextOffset: offset + limit })}
            style={{ ...btnBase, background: 'transparent', color: FINANCE_COLORS.text }}
          >
            Вперёд
          </button>
        </div>
      )}
    </div>
  );
}
