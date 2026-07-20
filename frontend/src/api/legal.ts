/**
 * Public + account legal API (этап 6.14.9B-1B).
 */
import { get, post } from './client';

export const LEGAL_DOCUMENTS_API_PATH = '/legal/documents';
export const LEGAL_ACCOUNT_API_PATH = '/legal/account';

/** Legacy AuthModal aliases → CMS doc_type / slug. */
export const LEGAL_AUTH_DOC_MAP = {
  privacy_policy: { docType: 'privacy_policy', slug: 'privacy-policy' },
  terms: { docType: 'public_offer', slug: 'public-offer', legacyAlias: 'terms' },
} as const;

export interface LegalRevisionListItem {
  id: number;
  doc_type: string;
  slug: string;
  version: string;
  status: string;
  title: string;
  content_sha256: string;
  published_at: string | null;
  archived_at: string | null;
}

export interface LegalRevisionPublic {
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
}

export interface LegalConsentAccepted {
  doc_type: string;
  doc_version: string;
  accepted_at: string;
  revision_id: number | null;
  source: string | null;
}

export interface LegalPurchaseSnapshotDoc {
  revision_id: number;
  doc_type: string;
  slug: string;
  version: string;
  title: string;
}

export interface LegalPurchaseSnapshot {
  checkout_intent_id: number;
  product_type: string;
  product_code: string;
  product_name: string;
  amount: string;
  currency: string;
  status: string;
  legal_snapshot_at: string | null;
  refund_formula_version: string | null;
  offer: LegalPurchaseSnapshotDoc | null;
  refund_policy: LegalPurchaseSnapshotDoc | null;
  tariff_terms: LegalPurchaseSnapshotDoc | null;
}

export interface LegalAccountOverview {
  current_documents: LegalRevisionListItem[];
  accepted: LegalConsentAccepted[];
  purchase_snapshots: LegalPurchaseSnapshot[];
}

export async function listLegalDocuments(): Promise<LegalRevisionListItem[]> {
  return get(LEGAL_DOCUMENTS_API_PATH);
}

export async function getLegalDocument(slug: string): Promise<LegalRevisionPublic> {
  return get(`${LEGAL_DOCUMENTS_API_PATH}/${encodeURIComponent(slug)}`);
}

export async function getLegalDocumentVersion(
  slug: string,
  version: string
): Promise<LegalRevisionPublic> {
  return get(
    `${LEGAL_DOCUMENTS_API_PATH}/${encodeURIComponent(slug)}/versions/${encodeURIComponent(version)}`
  );
}

export async function listLegalArchive(slug: string): Promise<LegalRevisionListItem[]> {
  return get(`${LEGAL_DOCUMENTS_API_PATH}/${encodeURIComponent(slug)}/archive`);
}

export async function getLegalAccountOverview(): Promise<LegalAccountOverview> {
  return get(LEGAL_ACCOUNT_API_PATH);
}

export interface PublishedConsentTarget {
  /** Alias for legacy POST /legal/consent (privacy_policy | terms). */
  legacyDocType: 'privacy_policy' | 'terms';
  docType: string;
  slug: string;
  version: string;
  revisionId: number;
  title: string;
}

/**
 * Resolve published CMS versions for AuthModal consent.
 * Returns null entries when a required document is not published — caller must not invent consent.
 */
export function resolvePublishedConsentTargets(docs: LegalRevisionListItem[]): {
  privacy: PublishedConsentTarget | null;
  terms: PublishedConsentTarget | null;
} {
  const bySlug = new Map(docs.map(d => [d.slug, d]));
  const privacyDoc = bySlug.get(LEGAL_AUTH_DOC_MAP.privacy_policy.slug) ?? null;
  const termsDoc = bySlug.get(LEGAL_AUTH_DOC_MAP.terms.slug) ?? null;
  return {
    privacy: privacyDoc
      ? {
          legacyDocType: 'privacy_policy',
          docType: privacyDoc.doc_type,
          slug: privacyDoc.slug,
          version: privacyDoc.version,
          revisionId: privacyDoc.id,
          title: privacyDoc.title,
        }
      : null,
    terms: termsDoc
      ? {
          legacyDocType: 'terms',
          docType: termsDoc.doc_type,
          slug: termsDoc.slug,
          version: termsDoc.version,
          revisionId: termsDoc.id,
          title: termsDoc.title,
        }
      : null,
  };
}

export function hasAcceptedRequiredConsents(
  accepted: { doc_type: string; doc_version?: string }[],
  targets: { privacy: PublishedConsentTarget | null; terms: PublishedConsentTarget | null }
): boolean {
  if (!targets.privacy || !targets.terms) return true;
  const types = new Set(accepted.map(a => a.doc_type));
  const privacyOk =
    types.has('privacy_policy') || types.has(LEGAL_AUTH_DOC_MAP.privacy_policy.docType);
  const termsOk =
    types.has('terms') || types.has('public_offer') || types.has(LEGAL_AUTH_DOC_MAP.terms.docType);
  return privacyOk && termsOk;
}

export async function acceptPublishedConsent(
  target: PublishedConsentTarget
): Promise<{ ok: boolean; code?: string }> {
  return post('/legal/consent', {
    doc_type: target.legacyDocType,
    doc_version: target.version,
  });
}
