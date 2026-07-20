/**
 * Хелперы UI юридического раздела.
 * Палитра совпадает с финансами — без нового дизайна.
 */
import type { CSSProperties } from 'react';
import { FINANCE_COLORS } from '../finance/financeHelpers';

export { FINANCE_COLORS as LEGAL_COLORS };

export const LEGAL_DOC_TYPE_OPTIONS: { value: string; label: string; slug: string }[] = [
  { value: 'public_offer', label: 'Публичная оферта', slug: 'public-offer' },
  { value: 'refund_policy', label: 'Политика возвратов', slug: 'refund-policy' },
  { value: 'privacy_policy', label: 'Политика конфиденциальности', slug: 'privacy-policy' },
  {
    value: 'personal_data_consent',
    label: 'Согласие на обработку персональных данных',
    slug: 'personal-data-consent',
  },
  { value: 'tariff_terms', label: 'Условия тарифов', slug: 'tariff-terms' },
  { value: 'advertising_consent', label: 'Согласие на рекламу', slug: 'advertising-consent' },
  { value: 'cookies_policy', label: 'Политика cookies', slug: 'cookies-policy' },
  {
    value: 'data_processing_assignment',
    label: 'Поручение на обработку данных',
    slug: 'data-processing-assignment',
  },
  { value: 'acceptable_use', label: 'Правила использования', slug: 'acceptable-use' },
  { value: 'marketplace_rules', label: 'Правила маркетплейса', slug: 'marketplace-rules' },
  { value: 'autorenewal_terms', label: 'Условия автопродления', slug: 'autorenewal-terms' },
];

export type LegalListTabId = 'active' | 'archive';

export const LEGAL_LIST_TABS: { id: LegalListTabId; label: string }[] = [
  { id: 'active', label: 'Действующие' },
  { id: 'archive', label: 'Архив' },
];

/** Пользовательские статусы (без технических кодов). */
export const LEGAL_STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  ready_for_review: 'Черновик',
  lawyer_approved: 'Черновик',
  published: 'Опубликован',
  archived: 'В архиве',
};

export function legalDocTypeLabel(docType: string): string {
  const byValue = LEGAL_DOC_TYPE_OPTIONS.find(o => o.value === docType);
  if (byValue) return byValue.label;
  const bySlug = LEGAL_DOC_TYPE_OPTIONS.find(o => o.slug === docType);
  if (bySlug) return bySlug.label;
  // Не показываем сырые коды вроде terms / privacy_policy.
  if (docType === 'terms') return 'Публичная оферта';
  return 'Юридический документ';
}

export function legalDocTypeSlug(docType: string): string | null {
  const byValue = LEGAL_DOC_TYPE_OPTIONS.find(o => o.value === docType);
  if (byValue) return byValue.slug;
  if (docType === 'terms') return 'public-offer';
  const bySlug = LEGAL_DOC_TYPE_OPTIONS.find(o => o.slug === docType);
  return bySlug?.slug ?? null;
}

export function legalStatusLabel(status: string): string {
  return LEGAL_STATUS_LABELS[status] ?? 'Документ';
}

export function formatLegalDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatLegalDateShort(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/** Для UI: черновик = draft + legacy review statuses. */
export function isLegalDraftStatus(status: string): boolean {
  return status === 'draft' || status === 'ready_for_review' || status === 'lawyer_approved';
}

export function canEditLegalDraft(status: string): boolean {
  return isLegalDraftStatus(status);
}

export function canPublishLegal(status: string): boolean {
  return status === 'draft';
}

export function canDeleteLegalDraft(status: string): boolean {
  return status === 'draft';
}

export function canArchiveLegal(status: string): boolean {
  return status === 'published';
}

export function canCreateNextRevision(status: string): boolean {
  return status === 'published';
}

export function suggestNextVersion(current: string): string {
  const m = /^(\d+)\.(\d+)$/.exec((current || '').trim());
  if (!m) return `${(current || '1.0').trim()}-next`;
  return `${m[1]}.${Number(m[2]) + 1}`;
}

/** Primary amber button: dark text on yellow (BotForg standard). */
export const legalPrimaryBtnStyle: CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: `1px solid ${FINANCE_COLORS.accent}`,
  background: FINANCE_COLORS.accent,
  color: FINANCE_COLORS.dark,
  fontSize: 14,
  fontWeight: 700,
  cursor: 'pointer',
};

export const legalSecondaryBtnStyle: CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: `1px solid ${FINANCE_COLORS.accentBorder}`,
  background: FINANCE_COLORS.panelBgElevated,
  color: FINANCE_COLORS.text,
  fontSize: 14,
  cursor: 'pointer',
};
