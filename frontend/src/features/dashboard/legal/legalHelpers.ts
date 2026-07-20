/**
 * Хелперы UI юридического раздела (этап 6.14.9B-1B).
 * Палитра совпадает с финансами — без нового дизайна.
 */
import { FINANCE_COLORS } from '../finance/financeHelpers';

export { FINANCE_COLORS as LEGAL_COLORS };

export type LegalAdminTabId = 'documents' | 'readiness';

export const LEGAL_ADMIN_TABS: { id: LegalAdminTabId; label: string }[] = [
  { id: 'documents', label: 'Документы' },
  { id: 'readiness', label: 'Готовность' },
];

export const LEGAL_DOC_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'public_offer', label: 'Публичная оферта' },
  { value: 'refund_policy', label: 'Политика возвратов' },
  { value: 'privacy_policy', label: 'Политика конфиденциальности' },
  { value: 'personal_data_consent', label: 'Согласие на обработку ПДн' },
  { value: 'tariff_terms', label: 'Условия тарифов' },
  { value: 'advertising_consent', label: 'Согласие на рекламу' },
  { value: 'cookies_policy', label: 'Политика cookies' },
  { value: 'data_processing_assignment', label: 'Поручение на обработку' },
  { value: 'acceptable_use', label: 'Правила использования' },
  { value: 'marketplace_rules', label: 'Правила маркетплейса' },
  { value: 'autorenewal_terms', label: 'Условия автопродления' },
];

export const LEGAL_STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  ready_for_review: 'На проверке',
  lawyer_approved: 'Одобрено юристом',
  published: 'Опубликовано',
  archived: 'В архиве',
};

export function legalDocTypeLabel(docType: string): string {
  return LEGAL_DOC_TYPE_OPTIONS.find(o => o.value === docType)?.label ?? docType;
}

export function legalStatusLabel(status: string): string {
  return LEGAL_STATUS_LABELS[status] ?? status;
}

export function formatLegalDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function canEditLegalDraft(status: string): boolean {
  return status === 'draft';
}

export function canSubmitLegalReview(status: string): boolean {
  return status === 'draft';
}

export function canLawyerApprove(status: string): boolean {
  return status === 'ready_for_review';
}

export function canPublishLegal(status: string): boolean {
  return status === 'lawyer_approved';
}

export function canArchiveLegal(status: string): boolean {
  return status === 'published';
}
