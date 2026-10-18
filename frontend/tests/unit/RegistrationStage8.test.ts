import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerEmail } from '@/api/auth';

afterEach(() => vi.unstubAllGlobals());

describe('Stage 8 registration contract', () => {
  it('sends three distinct legal decisions and no marketing opt-in', async () => {
    const send = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          message: 'Если регистрация возможна, проверьте почту для подтверждения адреса',
        }),
      });
    vi.stubGlobal('fetch', send);
    await registerEmail(
      'member@example.com',
      'SecretPass123!',
      'Member',
      'member_one',
      '1990-10-09',
      {
        public_offer: 11,
        privacy_policy: 12,
        personal_data_consent: 13,
      },
      { termsAccepted: true, privacyAcknowledged: true, personalDataConsentAccepted: true }
    );
    const [url, options] = send.mock.calls[0];
    expect(url).toBe('/auth/email/register');
    const body = JSON.parse(options.body);
    expect(body.legal_revision_ids).toEqual({
      public_offer: 11,
      privacy_policy: 12,
      personal_data_consent: 13,
    });
    expect(body.username).toBe('member_one');
    expect(body).toMatchObject({
      terms_accepted: true,
      privacy_acknowledged: true,
      personal_data_consent_accepted: true,
    });
    expect(body).not.toHaveProperty('advertising_consent');
  });
});
