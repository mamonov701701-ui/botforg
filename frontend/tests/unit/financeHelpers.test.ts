import { describe, expect, it } from 'vitest';
import type { PaymentProviderAdmin } from '../../src/api/paymentProvidersAdmin';
import type {
  PaymentProviderConnection,
  PaymentProviderDefinition,
} from '../../src/api/paymentProviderConnections';
import {
  DISABLE_DEFAULT_HINT,
  PAYMENT_PROVIDERS_API_PATH,
  PROVIDER_CONNECTIONS_API_PATH,
  PROVIDER_DEFINITIONS_API_PATH,
  SHOP_ID_INVALID_RU,
  canDeleteConnection,
  canDisableConnection,
  canEnableConnection,
  canSelectDefinition,
  canSetDefaultConnection,
  connectionLifecycleBadges,
  connectionResponseLooksSafe,
  connectionStatusSteps,
  countDefaultConnections,
  defaultConnectionName,
  formatProviderActionError,
  hasAlternateDefaultCandidate,
  isConnectionShownAsEnabled,
  isTechnicalConnectionName,
  validateShopId,
  withUpdatedDefaultConnection,
} from '../../src/features/dashboard/finance/financeHelpers';
import { PAYMENT_PROVIDERS_API_PATH as API_PATH } from '../../src/api/paymentProvidersAdmin';

function def(over: Partial<PaymentProviderDefinition> = {}): PaymentProviderDefinition {
  return {
    code: 'fake',
    display_name: 'Fake',
    regions: ['DEV'],
    supported_currencies: ['RUB'],
    supported_features: [],
    adapter_status: 'available',
    credential_schema: [
      {
        name: 'test_token',
        required: true,
        secret: true,
        label_ru: 'Токен',
        help_text: 'secret',
        validation_pattern: null,
        allowed_modes: ['test', 'production'],
      },
    ],
    webhook_capabilities: [],
    documentation_note: '',
    is_fake: true,
    can_connect: true,
    ...over,
  };
}

function conn(over: Partial<PaymentProviderConnection> = {}): PaymentProviderConnection {
  return {
    id: 1,
    provider_code: 'fake',
    connection_name: 'Test',
    mode: 'test',
    enabled: false,
    verified: false,
    is_default: false,
    currency: 'RUB',
    priority: 100,
    public_identifier_masked: null,
    credentials_version: 1,
    credentials_key_id: 'default',
    has_credentials: false,
    credential_fields_present: [],
    adapter_status: 'available',
    created_by: 1,
    updated_by: 1,
    verified_at: null,
    last_health_check_at: null,
    last_health_check_status: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...over,
  };
}

describe('financeHelpers connections (6.10A)', () => {
  it('does not show unconfigured connection as enabled', () => {
    const c = conn({ enabled: true, has_credentials: false });
    expect(isConnectionShownAsEnabled(c)).toBe(false);
    const steps = connectionStatusSteps(c);
    expect(steps.find(s => s.id === 'enabled')?.reached).toBe(false);
    expect(steps.find(s => s.current)?.id).toBe('not_configured');
  });

  it('lifecycle badges are coherent without duplicate contradictions', () => {
    const badges = connectionLifecycleBadges(
      conn({
        has_credentials: true,
        verified: true,
        enabled: false,
        is_default: false,
      })
    );
    expect(badges).toEqual(['Ключи сохранены', 'Проверено', 'Выключено']);
    expect(badges.includes('Включено')).toBe(false);
  });

  it('default connection names have no technical Test suffix', () => {
    expect(defaultConnectionName('ЮKassa', 'test')).toBe('ЮKassa — тестовое');
    expect(defaultConnectionName('ЮKassa', 'production')).toBe('ЮKassa — рабочее');
    expect(defaultConnectionName('ЮKassa', 'test')).not.toMatch(/\(Test\)/i);
  });

  it('detects technical name tails and allows human names', () => {
    expect(isTechnicalConnectionName('Lifecycle Fake 2 3e198345', 'fake')).toBe(true);
    expect(isTechnicalConnectionName('fake #3', 'fake')).toBe(true);
    expect(isTechnicalConnectionName('Fake (тесты) (Test)', 'fake')).toBe(true);
    expect(isTechnicalConnectionName('ЮKassa — тестовое', 'yookassa')).toBe(false);
    expect(isTechnicalConnectionName('Основной эквайринг', 'yookassa')).toBe(false);
  });

  it('rejects email as Shop ID with Russian message', () => {
    expect(validateShopId('user@example.com')).toBe(SHOP_ID_INVALID_RU);
    expect(validateShopId('123456')).toBeNull();
  });

  it('blocks planned definition selection and allows available', () => {
    expect(canSelectDefinition(def({ adapter_status: 'planned', can_connect: false }))).toBe(false);
    expect(canSelectDefinition(def({ adapter_status: 'available', can_connect: true }))).toBe(true);
  });

  it('keeps credentials out of connection response safety check', () => {
    const secrets = { test_token: 'super-secret-token-999' };
    const safe = conn({
      has_credentials: true,
      credential_fields_present: ['test_token'],
      public_identifier_masked: '****',
    });
    expect(connectionResponseLooksSafe(safe, secrets)).toBe(true);
    const leaky = { ...safe, note: 'super-secret-token-999' } as PaymentProviderConnection;
    expect(connectionResponseLooksSafe(leaky, secrets)).toBe(false);
  });

  it('disables enable until ready (credentials + verified + available)', () => {
    expect(canEnableConnection(conn({ has_credentials: false })).ok).toBe(false);
    expect(canEnableConnection(conn({ has_credentials: true, verified: false })).ok).toBe(false);
    expect(
      canEnableConnection(
        conn({ has_credentials: true, verified: true, adapter_status: 'planned' })
      ).ok
    ).toBe(false);
    expect(
      canEnableConnection(
        conn({ has_credentials: true, verified: true, adapter_status: 'available' })
      ).ok
    ).toBe(true);
  });

  it('disables set-default until enabled+verified', () => {
    expect(
      canSetDefaultConnection(conn({ has_credentials: true, verified: true, enabled: false })).ok
    ).toBe(false);
    expect(
      canSetDefaultConnection(conn({ has_credentials: true, verified: true, enabled: true })).ok
    ).toBe(true);
    expect(
      canSetDefaultConnection(
        conn({ has_credentials: true, verified: true, enabled: true, is_default: true })
      ).ok
    ).toBe(false);
  });

  it('blocks disable for default; allows after default switch', () => {
    const a = conn({
      id: 1,
      enabled: true,
      has_credentials: true,
      verified: true,
      is_default: true,
    });
    const b = conn({
      id: 2,
      connection_name: 'Other',
      enabled: true,
      has_credentials: true,
      verified: true,
      is_default: false,
    });
    expect(canDisableConnection(a).ok).toBe(false);
    expect(canDisableConnection(a).reason).toBe(DISABLE_DEFAULT_HINT);

    const switched = withUpdatedDefaultConnection([a, b], { ...b, is_default: true });
    expect(countDefaultConnections(switched)).toBe(1);
    const old = switched.find(c => c.id === 1)!;
    const neu = switched.find(c => c.id === 2)!;
    expect(neu.is_default).toBe(true);
    expect(old.is_default).toBe(false);
    expect(canDisableConnection(old).ok).toBe(true);
  });

  it('blocks delete for default and enabled', () => {
    expect(
      canDeleteConnection(
        conn({ is_default: true, enabled: true, has_credentials: true, verified: true })
      ).ok
    ).toBe(false);
    expect(
      canDeleteConnection(
        conn({ is_default: false, enabled: true, has_credentials: true, verified: true })
      ).ok
    ).toBe(false);
    expect(
      canDeleteConnection(
        conn({ is_default: false, enabled: false, has_credentials: true, verified: true })
      ).ok
    ).toBe(true);
  });

  it('maps 409 default conflict to Russian hint', () => {
    expect(
      formatProviderActionError(409, 'Сначала назначьте другой default, затем отключите провайдер')
    ).toBe(DISABLE_DEFAULT_HINT);
  });

  it('maps Shop ID format error to Russian text', () => {
    expect(formatProviderActionError(422, SHOP_ID_INVALID_RU, 'invalid_credential_format')).toBe(
      SHOP_ID_INVALID_RU
    );
  });

  it('detects alternate default candidate', () => {
    const only = [
      conn({
        id: 1,
        is_default: true,
        enabled: true,
        verified: true,
        has_credentials: true,
      }),
    ];
    expect(hasAlternateDefaultCandidate(only, 1)).toBe(false);
    const withAlt = [
      ...only,
      conn({
        id: 2,
        is_default: false,
        enabled: true,
        verified: true,
        has_credentials: true,
      }),
    ];
    expect(hasAlternateDefaultCandidate(withAlt, 1)).toBe(true);
  });

  it('keeps API paths aligned', () => {
    expect(PROVIDER_DEFINITIONS_API_PATH).toBe('/api/admin/payment-provider-definitions');
    expect(PROVIDER_CONNECTIONS_API_PATH).toBe('/api/admin/payment-provider-connections');
    expect(PAYMENT_PROVIDERS_API_PATH).toBe('/api/admin/payment-providers');
    expect(API_PATH).toBe(PAYMENT_PROVIDERS_API_PATH);
  });
});

describe('legacy helpers still compile', () => {
  it('legacy default flag is separate from secure connection enabled display', () => {
    const legacy: PaymentProviderAdmin = {
      code: 'yookassa',
      display_name: 'ЮKassa',
      enabled: true,
      mode: 'test',
      currency: 'RUB',
      priority: 10,
      is_default_for_new_payments: false,
      configured: false,
      readiness_status: 'missing_secrets',
      missing_required_settings: ['YOOKASSA_SECRET'],
      masked_identifiers: {},
      adapter_implemented: false,
      is_fake: false,
      last_health_check_at: null,
      last_health_check_status: null,
      last_health_check_message: null,
      last_webhook_status: null,
      last_webhook_at: null,
      updated_at: new Date().toISOString(),
    };
    expect(legacy.enabled && !legacy.configured).toBe(true);
  });
});
