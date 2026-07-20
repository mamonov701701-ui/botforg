import { describe, expect, it } from 'vitest';
import {
  canCreateNextRevision,
  canPublishLegal,
  legalDocTypeLabel,
  legalPrimaryBtnStyle,
  legalStatusLabel,
  LEGAL_COLORS,
  LEGAL_LIST_TABS,
} from '@/features/dashboard/legal/legalHelpers';

describe('legalHelpers draft-only publish', () => {
  it('publishes only draft; archive cannot create revision', () => {
    expect(canPublishLegal('draft')).toBe(true);
    expect(canPublishLegal('ready_for_review')).toBe(false);
    expect(canPublishLegal('lawyer_approved')).toBe(false);
    expect(canPublishLegal('published')).toBe(false);
    expect(canCreateNextRevision('published')).toBe(true);
    expect(canCreateNextRevision('archived')).toBe(false);
  });

  it('russian labels and tabs', () => {
    expect(LEGAL_LIST_TABS.map(t => t.label)).toEqual(['Действующие', 'Архив']);
    expect(legalDocTypeLabel('privacy_policy')).toMatch(/Политика/);
    expect(legalStatusLabel('draft')).toBe('Черновик');
    expect(legalPrimaryBtnStyle.color).toBe(LEGAL_COLORS.dark);
  });
});
