/**
 * Admin refund API (Этап 6.14.4) — /api/admin/refunds
 */
import { get, post, ApiError } from './client';

export const ADMIN_REFUNDS_API_PATH = '/api/admin/refunds';

export interface RefundAdminListItem {
  id: number;
  user_id: number;
  user_email: string | null;
  checkout_intent_id: number;
  payment_attempt_id: number;
  status: string;
  reason_category: string;
  user_comment: string | null;
  current_revision_number: number;
  approved_revision_id: number | null;
  version: number;
  recommended_refund_amount: string | null;
  proposed_amount_undefined: boolean;
  manual_review_required: boolean;
  product_type: string | null;
  product_code: string | null;
  product_name: string | null;
  amount: string | null;
  currency: string | null;
  refund_type: string | null;
  calculation_status: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  completed_at: string | null;
}

export interface RefundAdminList {
  items: RefundAdminListItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface RefundAdminUser {
  id: number;
  public_id: number | null;
  email: string;
  name: string | null;
  role: string | null;
  plan_code: string | null;
  is_suspended: boolean;
  created_at: string | null;
}

export interface RefundAdminCheckoutIntent {
  id: number;
  user_id: number;
  product_type: string;
  product_code: string;
  product_name: string;
  description: string | null;
  amount: string;
  currency: string;
  status: string;
  idempotency_key: string;
  payment_provider: string | null;
  provider_payment_id: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface RefundAdminPaymentAttempt {
  id: number;
  checkout_intent_id: number;
  user_id: number;
  provider: string;
  connection_id: number | null;
  provider_payment_id: string | null;
  amount: string;
  currency: string;
  status: string;
  idempotency_key: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface RefundAdminProduct {
  product_type: string;
  product_code: string;
  product_name: string;
  amount: string;
  currency: string;
}

export interface RefundAdminRequestCore {
  id: number;
  user_id: number;
  checkout_intent_id: number;
  payment_attempt_id: number;
  status: string;
  reason_category: string;
  user_comment: string | null;
  current_revision_number: number;
  approved_revision_id: number | null;
  version: number;
  recommended_refund_amount: string | null;
  proposed_amount_undefined: boolean;
  manual_review_required: boolean;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  completed_at: string | null;
}

export interface RefundAdminRevision {
  id: number;
  refund_request_id: number;
  revision_number: number;
  revision_type: string;
  created_by_user_id: number | null;
  based_on_revision_id: number | null;
  calculation_status: string;
  refund_type: string;
  currency: string;
  paid_amount: string;
  prior_refunded_amount: string;
  proposed_refund_amount: string | null;
  final_refund_amount: string | null;
  proposed_amount_undefined: boolean;
  calculation_at: string;
  entitlement_action: string;
  entitlement_effective_at: string | null;
  adjustment_reason_category: string | null;
  adjustment_comment: string | null;
  usage_snapshot: Record<string, unknown> | null;
  calculation_snapshot: Record<string, unknown> | null;
  entitlement_snapshot: Record<string, unknown> | null;
  created_at: string;
}

export interface RefundAdminAuditEvent {
  id: number;
  refund_request_id: number;
  refund_revision_id: number | null;
  actor_user_id: number | null;
  actor_type: string;
  action: string;
  title: string | null;
  previous_status: string | null;
  new_status: string | null;
  changed_fields: unknown;
  reason: string | null;
  event_metadata: unknown;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface RefundAdminDetail {
  request: RefundAdminRequestCore;
  user: RefundAdminUser | null;
  checkout_intent: RefundAdminCheckoutIntent | null;
  payment_attempt: RefundAdminPaymentAttempt | null;
  product: RefundAdminProduct | null;
  usage_snapshot: Record<string, unknown> | null;
  financial_snapshot: Record<string, unknown> | null;
  current_revision: RefundAdminRevision | null;
  approved_revision: RefundAdminRevision | null;
  revisions: RefundAdminRevision[];
  audit_timeline: RefundAdminAuditEvent[];
}

export interface AdminRefundListParams {
  status?: string;
  user_id?: number;
  reason_category?: string;
  manual_review?: boolean;
  limit?: number;
  offset?: number;
}

export interface AdminRevisionInput {
  expected_version: number;
  based_on_revision_id: number;
  proposed_refund_amount: string;
  adjustment_reason_category: string;
  adjustment_comment: string;
  refund_type?: string | null;
  entitlement_action?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : null;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function moneyStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(2);
  return null;
}

export function normalizeAdminListItem(raw: unknown): RefundAdminListItem {
  const o = asRecord(raw) ?? {};
  return {
    id: asNumber(o.id),
    user_id: asNumber(o.user_id),
    user_email: asNullableString(o.user_email),
    checkout_intent_id: asNumber(o.checkout_intent_id),
    payment_attempt_id: asNumber(o.payment_attempt_id),
    status: asString(o.status),
    reason_category: asString(o.reason_category),
    user_comment: asNullableString(o.user_comment),
    current_revision_number: asNumber(o.current_revision_number),
    approved_revision_id: asNullableNumber(o.approved_revision_id),
    version: asNumber(o.version, 1),
    recommended_refund_amount: moneyStr(o.recommended_refund_amount),
    proposed_amount_undefined: asBool(o.proposed_amount_undefined, false),
    manual_review_required: asBool(o.manual_review_required, false),
    product_type: asNullableString(o.product_type),
    product_code: asNullableString(o.product_code),
    product_name: asNullableString(o.product_name),
    amount: moneyStr(o.amount),
    currency: asNullableString(o.currency),
    refund_type: asNullableString(o.refund_type),
    calculation_status: asNullableString(o.calculation_status),
    created_at: asString(o.created_at),
    updated_at: asString(o.updated_at),
    submitted_at: asString(o.submitted_at),
    completed_at: asNullableString(o.completed_at),
  };
}

function normalizeRevision(raw: unknown): RefundAdminRevision {
  const o = asRecord(raw) ?? {};
  return {
    id: asNumber(o.id),
    refund_request_id: asNumber(o.refund_request_id),
    revision_number: asNumber(o.revision_number),
    revision_type: asString(o.revision_type),
    created_by_user_id: asNullableNumber(o.created_by_user_id),
    based_on_revision_id: asNullableNumber(o.based_on_revision_id),
    calculation_status: asString(o.calculation_status),
    refund_type: asString(o.refund_type),
    currency: asString(o.currency, 'RUB'),
    paid_amount: moneyStr(o.paid_amount) ?? '0.00',
    prior_refunded_amount: moneyStr(o.prior_refunded_amount) ?? '0.00',
    proposed_refund_amount: moneyStr(o.proposed_refund_amount),
    final_refund_amount: moneyStr(o.final_refund_amount),
    proposed_amount_undefined: asBool(o.proposed_amount_undefined, false),
    calculation_at: asString(o.calculation_at),
    entitlement_action: asString(o.entitlement_action, 'none'),
    entitlement_effective_at: asNullableString(o.entitlement_effective_at),
    adjustment_reason_category: asNullableString(o.adjustment_reason_category),
    adjustment_comment: asNullableString(o.adjustment_comment),
    usage_snapshot: asRecord(o.usage_snapshot),
    calculation_snapshot: asRecord(o.calculation_snapshot),
    entitlement_snapshot: asRecord(o.entitlement_snapshot),
    created_at: asString(o.created_at),
  };
}

function normalizeAudit(raw: unknown): RefundAdminAuditEvent {
  const o = asRecord(raw) ?? {};
  const detailsRaw = asRecord(o.details) ?? asRecord(o.event_metadata);
  return {
    id: asNumber(o.id),
    refund_request_id: asNumber(o.refund_request_id),
    refund_revision_id: asNullableNumber(o.refund_revision_id),
    actor_user_id: asNullableNumber(o.actor_user_id),
    actor_type: asString(o.actor_type),
    action: asString(o.action),
    title: asNullableString(o.title),
    previous_status: asNullableString(o.previous_status),
    new_status: asNullableString(o.new_status),
    changed_fields: o.changed_fields ?? null,
    reason: asNullableString(o.reason),
    event_metadata: detailsRaw,
    details: detailsRaw,
    created_at: asString(o.created_at),
  };
}

export function normalizeAdminDetail(raw: unknown): RefundAdminDetail {
  const o = asRecord(raw) ?? {};
  const req = asRecord(o.request) ?? {};
  const user = asRecord(o.user);
  const intent = asRecord(o.checkout_intent);
  const attempt = asRecord(o.payment_attempt);
  const product = asRecord(o.product);
  const revisionsRaw = Array.isArray(o.revisions) ? o.revisions : [];
  const auditRaw = Array.isArray(o.audit_timeline) ? o.audit_timeline : [];

  return {
    request: {
      id: asNumber(req.id),
      user_id: asNumber(req.user_id),
      checkout_intent_id: asNumber(req.checkout_intent_id),
      payment_attempt_id: asNumber(req.payment_attempt_id),
      status: asString(req.status),
      reason_category: asString(req.reason_category),
      user_comment: asNullableString(req.user_comment),
      current_revision_number: asNumber(req.current_revision_number),
      approved_revision_id: asNullableNumber(req.approved_revision_id),
      version: asNumber(req.version, 1),
      recommended_refund_amount: moneyStr(req.recommended_refund_amount),
      proposed_amount_undefined: asBool(req.proposed_amount_undefined, false),
      manual_review_required: asBool(req.manual_review_required, false),
      created_at: asString(req.created_at),
      updated_at: asString(req.updated_at),
      submitted_at: asString(req.submitted_at),
      completed_at: asNullableString(req.completed_at),
    },
    user: user
      ? {
          id: asNumber(user.id),
          public_id: asNullableNumber(user.public_id),
          email: asString(user.email),
          name: asNullableString(user.name),
          role: asNullableString(user.role),
          plan_code: asNullableString(user.plan_code),
          is_suspended: asBool(user.is_suspended, false),
          created_at: asNullableString(user.created_at),
        }
      : null,
    checkout_intent: intent
      ? {
          id: asNumber(intent.id),
          user_id: asNumber(intent.user_id),
          product_type: asString(intent.product_type),
          product_code: asString(intent.product_code),
          product_name: asString(intent.product_name),
          description: asNullableString(intent.description),
          amount: moneyStr(intent.amount) ?? '0.00',
          currency: asString(intent.currency, 'RUB'),
          status: asString(intent.status),
          idempotency_key: asString(intent.idempotency_key),
          payment_provider: asNullableString(intent.payment_provider),
          provider_payment_id: asNullableString(intent.provider_payment_id),
          paid_at: asNullableString(intent.paid_at),
          fulfilled_at: asNullableString(intent.fulfilled_at),
          created_at: asNullableString(intent.created_at),
          updated_at: asNullableString(intent.updated_at),
        }
      : null,
    payment_attempt: attempt
      ? {
          id: asNumber(attempt.id),
          checkout_intent_id: asNumber(attempt.checkout_intent_id),
          user_id: asNumber(attempt.user_id),
          provider: asString(attempt.provider),
          connection_id: asNullableNumber(attempt.connection_id),
          provider_payment_id: asNullableString(attempt.provider_payment_id),
          amount: moneyStr(attempt.amount) ?? '0.00',
          currency: asString(attempt.currency, 'RUB'),
          status: asString(attempt.status),
          idempotency_key: asString(attempt.idempotency_key),
          created_at: asNullableString(attempt.created_at),
          updated_at: asNullableString(attempt.updated_at),
        }
      : null,
    product: product
      ? {
          product_type: asString(product.product_type),
          product_code: asString(product.product_code),
          product_name: asString(product.product_name),
          amount: moneyStr(product.amount) ?? '0.00',
          currency: asString(product.currency, 'RUB'),
        }
      : null,
    usage_snapshot: asRecord(o.usage_snapshot),
    financial_snapshot: asRecord(o.financial_snapshot),
    current_revision: o.current_revision ? normalizeRevision(o.current_revision) : null,
    approved_revision: o.approved_revision ? normalizeRevision(o.approved_revision) : null,
    revisions: revisionsRaw.map(normalizeRevision),
    audit_timeline: auditRaw.map(normalizeAudit),
  };
}

function buildListQuery(params: AdminRefundListParams): string {
  const q = new URLSearchParams();
  if (params.status) q.set('status', params.status);
  if (params.user_id != null) q.set('user_id', String(params.user_id));
  if (params.reason_category) q.set('reason_category', params.reason_category);
  if (params.manual_review === true) q.set('manual_review', 'true');
  if (params.manual_review === false) q.set('manual_review', 'false');
  q.set('limit', String(params.limit ?? 20));
  q.set('offset', String(params.offset ?? 0));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function listAdminRefunds(
  params: AdminRefundListParams = {}
): Promise<RefundAdminList> {
  const raw = await get(`${ADMIN_REFUNDS_API_PATH}${buildListQuery(params)}`);
  const o = asRecord(raw) ?? {};
  const items = Array.isArray(o.items) ? o.items.map(normalizeAdminListItem) : [];
  return {
    items,
    total: asNumber(o.total),
    limit: asNumber(o.limit, params.limit ?? 20),
    offset: asNumber(o.offset, params.offset ?? 0),
  };
}

export async function getAdminRefund(id: number): Promise<RefundAdminDetail> {
  const raw = await get(`${ADMIN_REFUNDS_API_PATH}/${id}`);
  return normalizeAdminDetail(raw);
}

export async function adminRecalculateRefund(
  id: number,
  expected_version: number
): Promise<RefundAdminDetail> {
  const raw = await post(`${ADMIN_REFUNDS_API_PATH}/${id}/recalculate`, { expected_version });
  return normalizeAdminDetail(raw);
}

export async function adminCreateRefundRevision(
  id: number,
  body: AdminRevisionInput
): Promise<RefundAdminDetail> {
  const raw = await post(`${ADMIN_REFUNDS_API_PATH}/${id}/revisions`, body);
  return normalizeAdminDetail(raw);
}

export async function adminNeedsInformation(
  id: number,
  expected_version: number,
  reason: string
): Promise<RefundAdminDetail> {
  const raw = await post(`${ADMIN_REFUNDS_API_PATH}/${id}/needs-information`, {
    expected_version,
    reason,
  });
  return normalizeAdminDetail(raw);
}

export async function adminRejectRefund(
  id: number,
  expected_version: number,
  reason: string
): Promise<RefundAdminDetail> {
  const raw = await post(`${ADMIN_REFUNDS_API_PATH}/${id}/reject`, { expected_version, reason });
  return normalizeAdminDetail(raw);
}

export async function adminConfirmRefund(
  id: number,
  expected_version: number
): Promise<RefundAdminDetail> {
  const raw = await post(`${ADMIN_REFUNDS_API_PATH}/${id}/confirm`, { expected_version });
  return normalizeAdminDetail(raw);
}

export async function adminApproveRefund(
  id: number,
  expected_version: number,
  revision_id: number
): Promise<RefundAdminDetail> {
  const raw = await post(`${ADMIN_REFUNDS_API_PATH}/${id}/approve`, {
    expected_version,
    revision_id,
  });
  return normalizeAdminDetail(raw);
}

export function safeAdminRefundErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return 'Недостаточно прав для управления возвратами.';
    }
    if (
      err.code === 'version_conflict' ||
      err.code === 'revision_stale' ||
      err.code === 'stale_revision'
    ) {
      return 'Данные заявки устарели. Обновите карточку и повторите действие.';
    }
    if (err.code === 'request_not_found') {
      return 'Заявка на возврат не найдена.';
    }
    if (err.message && err.message.trim()) {
      return err.message;
    }
  }
  if (err instanceof Error && /failed to fetch|network|abort/i.test(err.message)) {
    return 'Нет связи с сервером. Проверьте интернет и попробуйте снова.';
  }
  return 'Не удалось выполнить действие. Попробуйте позже.';
}

export function isVersionConflictError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === 'version_conflict' ||
      err.code === 'revision_stale' ||
      err.code === 'stale_revision')
  );
}
