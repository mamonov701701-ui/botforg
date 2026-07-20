/**
 * Admin legal API (этап 6.14.9B-1B) — /api/admin/legal
 */
import { get, patch, post, ApiError } from './client';

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

export function safeLegalAdminErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'Недостаточно прав для управления юридическими документами';
    if (err.status === 401) return 'Требуется вход в аккаунт';
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
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
