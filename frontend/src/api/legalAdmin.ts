/**
 * Admin legal API (этап 6.14.9B-1B) — /api/admin/legal
 */
import { del, get, patch, post, ApiError } from './client';

export const ADMIN_LEGAL_API_PATH = '/api/admin/legal';

export interface LegalRevisionAdmin {
  id: number;
  doc_type: string;
  slug: string;
  version: string;
  status: string;
  title: string;
  body_markdown: string;
  content_sha256: string;
  published_at: string | null;
  archived_at: string | null;
  internal_notes: string | null;
  created_by_user_id: number | null;
  updated_by_user_id: number | null;
  lawyer_approved_by_user_id: number | null;
  published_by_user_id: number | null;
  created_at: string;
  updated_at: string;
  lawyer_approved_at: string | null;
}

export interface LegalDraftCreate {
  doc_type: string;
  version: string;
  title: string;
  body_markdown?: string;
  internal_notes?: string | null;
}

export interface LegalDraftUpdate {
  title?: string;
  body_markdown?: string;
  internal_notes?: string | null;
  clear_internal_notes?: boolean;
}

export interface LegalChecklistItem {
  id: number;
  item_key: string;
  label_ru: string;
  is_completed: boolean;
  completed_at: string | null;
  completed_by_user_id: number | null;
  note: string | null;
  updated_at: string;
}

export interface LegalLaunchStatus {
  legal_launch_ready: boolean;
  environment: string;
  payments_blocked: boolean;
  checklist_complete: boolean;
  required_docs_published: boolean;
  missing_checklist_keys: string[];
  missing_doc_types: string[];
}

/** English / technical API fragments that must never reach the UI. */
const TECHNICAL_ERROR_RE =
  /lawyer_approved|ready_for_review|Only\s+draft|Only\s+lawyer|409\s*Conflict|Conflict|invalid_status|revision_immutable|body_required|title_required|HTTPException/i;

function looksTechnical(msg: string): boolean {
  const t = msg.trim();
  if (!t) return true;
  if (TECHNICAL_ERROR_RE.test(t)) return true;
  // Latin-only technical phrases (no Cyrillic)
  if (/^[A-Za-z0-9_ '".,:;!?/()-]+$/.test(t) && /[A-Za-z]{4,}/.test(t)) return true;
  return false;
}

export function safeLegalAdminErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Недостаточно прав для управления юридическими документами';
    if (err.status === 401) return 'Требуется вход в аккаунт';
    if (err.status === 404) {
      return 'Админ API юридических документов недоступен. Перезапустите backend и повторите попытку.';
    }
    if (err.status === 409) {
      if (err.code === 'body_required') {
        return 'Перед публикацией заполните текст документа';
      }
      if (err.code === 'title_required') {
        return 'Перед публикацией укажите название документа';
      }
      if (
        err.code === 'invalid_status_transition' ||
        err.code === 'publish_requires_lawyer_approval'
      ) {
        return 'Опубликовать можно только черновик. Откройте черновик и нажмите «Опубликовать».';
      }
      if (err.code === 'revision_immutable') {
        return 'Опубликованные и архивные редакции нельзя изменять';
      }
      const msg = (err.message || '').trim();
      if (msg && !looksTechnical(msg)) return msg;
      return 'Не удалось выполнить действие. Опубликовать можно только готовый черновик.';
    }
    const msg = (err.message || '').trim();
    if (msg && !looksTechnical(msg)) return msg;
  }
  if (err instanceof Error) {
    const msg = (err.message || '').trim();
    if (msg && !looksTechnical(msg)) return msg;
  }
  return fallback;
}

export async function listAdminLegalRevisions(docType?: string): Promise<LegalRevisionAdmin[]> {
  const q = docType ? `?doc_type=${encodeURIComponent(docType)}` : '';
  return get(`${ADMIN_LEGAL_API_PATH}/revisions${q}`);
}

export async function createAdminLegalDraft(body: LegalDraftCreate): Promise<LegalRevisionAdmin> {
  return post(`${ADMIN_LEGAL_API_PATH}/revisions`, body);
}

export async function updateAdminLegalDraft(
  revisionId: number,
  body: LegalDraftUpdate
): Promise<LegalRevisionAdmin> {
  return patch(`${ADMIN_LEGAL_API_PATH}/revisions/${revisionId}`, body);
}

export async function submitAdminLegalReview(revisionId: number): Promise<LegalRevisionAdmin> {
  return post(`${ADMIN_LEGAL_API_PATH}/revisions/${revisionId}/submit-review`);
}

export async function approveAdminLegalLawyer(revisionId: number): Promise<LegalRevisionAdmin> {
  return post(`${ADMIN_LEGAL_API_PATH}/revisions/${revisionId}/lawyer-approve`);
}

export async function publishAdminLegalRevision(revisionId: number): Promise<LegalRevisionAdmin> {
  return post(`${ADMIN_LEGAL_API_PATH}/revisions/${revisionId}/publish`);
}

export async function archiveAdminLegalRevision(revisionId: number): Promise<LegalRevisionAdmin> {
  return post(`${ADMIN_LEGAL_API_PATH}/revisions/${revisionId}/archive`);
}

export async function deleteAdminLegalDraft(revisionId: number): Promise<void> {
  await del(`${ADMIN_LEGAL_API_PATH}/revisions/${revisionId}`);
}

export async function getAdminLegalChecklist(): Promise<LegalChecklistItem[]> {
  return get(`${ADMIN_LEGAL_API_PATH}/checklist`);
}

export async function updateAdminLegalChecklistItem(
  itemKey: string,
  body: { is_completed: boolean; note?: string | null }
): Promise<LegalChecklistItem> {
  return patch(`${ADMIN_LEGAL_API_PATH}/checklist/${encodeURIComponent(itemKey)}`, body);
}

export async function getAdminLegalLaunchStatus(): Promise<LegalLaunchStatus> {
  return get(`${ADMIN_LEGAL_API_PATH}/launch-status`);
}
