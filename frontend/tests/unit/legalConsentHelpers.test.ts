import { describe, expect, it } from 'vitest';
import {
  hasAcceptedRequiredConsents,
  resolvePublishedConsentTargets,
  type LegalRevisionListItem,
} from '../../src/api/legal';

function doc(
  partial: Partial<LegalRevisionListItem> & Pick<LegalRevisionListItem, 'slug'>
): LegalRevisionListItem {
  return {
    id: partial.id ?? 1,
    doc_type: partial.doc_type ?? 'privacy_policy',
    slug: partial.slug,
    version: partial.version ?? '2.0',
    status: partial.status ?? 'published',
    title: partial.title ?? 'Doc',
    content_sha256: partial.content_sha256 ?? 'abc',
    published_at: partial.published_at ?? '2026-07-01T00:00:00Z',
    archived_at: partial.archived_at ?? null,
  };
}

describe('resolvePublishedConsentTargets', () => {
  it('returns null when published versions are missing', () => {
    const targets = resolvePublishedConsentTargets([]);
    expect(targets.privacy).toBeNull();
    expect(targets.terms).toBeNull();
  });

  it('maps privacy-policy and public-offer published docs', () => {
    const targets = resolvePublishedConsentTargets([
      doc({ id: 10, slug: 'privacy-policy', doc_type: 'privacy_policy', version: '3.1' }),
      doc({
        id: 11,
        slug: 'public-offer',
        doc_type: 'public_offer',
        version: '4.2',
        title: 'Offer',
      }),
    ]);
    expect(targets.privacy?.version).toBe('3.1');
    expect(targets.privacy?.legacyDocType).toBe('privacy_policy');
    expect(targets.terms?.version).toBe('4.2');
    expect(targets.terms?.legacyDocType).toBe('terms');
  });
});

describe('hasAcceptedRequiredConsents', () => {
  it('is true when required published docs are absent (no fake consent needed)', () => {
    expect(hasAcceptedRequiredConsents([], { privacy: null, terms: null })).toBe(true);
  });

  it('accepts public_offer as terms acceptance', () => {
    const targets = resolvePublishedConsentTargets([
      doc({ slug: 'privacy-policy', doc_type: 'privacy_policy' }),
      doc({ id: 2, slug: 'public-offer', doc_type: 'public_offer' }),
    ]);
    expect(
      hasAcceptedRequiredConsents(
        [{ doc_type: 'privacy_policy' }, { doc_type: 'public_offer' }],
        targets
      )
    ).toBe(true);
  });
});
