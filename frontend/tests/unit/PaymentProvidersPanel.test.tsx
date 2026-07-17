import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import React from 'react';
import type { PaymentProviderConnection } from '@/api/paymentProviderConnections';
import type { PaymentProviderDefinition } from '@/api/paymentProviderConnections';
import type { PaymentProviderAdmin } from '@/api/paymentProvidersAdmin';
import {
  DISABLE_DEFAULT_HINT,
  SHOP_ID_INVALID_RU,
  defaultConnectionName,
} from '@/features/dashboard/finance/financeHelpers';

const { toast } = vi.hoisted(() => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/utils/toast', () => ({ toast }));

vi.mock('@/api/paymentProviderConnections', () => ({
  PROVIDER_DEFINITIONS_API_PATH: '/api/admin/payment-provider-definitions',
  PROVIDER_CONNECTIONS_API_PATH: '/api/admin/payment-provider-connections',
  listProviderDefinitions: vi.fn(),
  listProviderConnections: vi.fn(),
  createProviderConnection: vi.fn(),
  updateProviderConnection: vi.fn(),
  setDefaultProviderConnection: vi.fn(),
  verifyProviderConnection: vi.fn(),
  replaceProviderConnectionCredentials: vi.fn(),
  deleteProviderConnection: vi.fn(),
}));

vi.mock('@/api/paymentProvidersAdmin', () => ({
  PAYMENT_PROVIDERS_API_PATH: '/api/admin/payment-providers',
  listPaymentProviders: vi.fn(),
  updatePaymentProvider: vi.fn(),
  setDefaultPaymentProvider: vi.fn(),
  healthCheckPaymentProvider: vi.fn(),
}));

import {
  listProviderDefinitions,
  listProviderConnections,
  createProviderConnection,
  updateProviderConnection,
  setDefaultProviderConnection,
  verifyProviderConnection,
  deleteProviderConnection,
} from '@/api/paymentProviderConnections';
import { listPaymentProviders } from '@/api/paymentProvidersAdmin';
import PaymentProvidersPanel from '@/features/dashboard/finance/PaymentProvidersPanel';

function definition(over: Partial<PaymentProviderDefinition> = {}): PaymentProviderDefinition {
  return {
    code: 'fake',
    display_name: 'Fake (тесты)',
    regions: ['DEV'],
    supported_currencies: ['RUB'],
    supported_features: [],
    adapter_status: 'available',
    credential_schema: [
      {
        name: 'label',
        required: false,
        secret: false,
        label_ru: 'Метка',
        help_text: 'метка',
        validation_pattern: null,
        allowed_modes: ['test', 'production'],
      },
      {
        name: 'test_token',
        required: true,
        secret: true,
        label_ru: 'Тестовый токен',
        help_text: 'секрет',
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

function connection(over: Partial<PaymentProviderConnection> = {}): PaymentProviderConnection {
  return {
    id: 1,
    provider_code: 'fake',
    connection_name: 'Fake main',
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

function legacy(over: Partial<PaymentProviderAdmin> = {}): PaymentProviderAdmin {
  return {
    code: 'yookassa',
    display_name: 'ЮKassa',
    enabled: true,
    mode: 'test',
    currency: 'RUB',
    priority: 10,
    is_default_for_new_payments: false,
    configured: false,
    readiness_status: 'missing_secrets',
    missing_required_settings: ['SECRET'],
    masked_identifiers: {},
    adapter_implemented: false,
    is_fake: false,
    last_health_check_at: null,
    last_health_check_status: null,
    last_health_check_message: null,
    last_webhook_status: null,
    last_webhook_at: null,
    updated_at: new Date().toISOString(),
    ...over,
  };
}

describe('PaymentProvidersPanel secure connections UX', () => {
  beforeEach(() => {
    vi.mocked(listProviderDefinitions).mockReset();
    vi.mocked(listProviderConnections).mockReset();
    vi.mocked(createProviderConnection).mockReset();
    vi.mocked(updateProviderConnection).mockReset();
    vi.mocked(setDefaultProviderConnection).mockReset();
    vi.mocked(verifyProviderConnection).mockReset();
    vi.mocked(deleteProviderConnection).mockReset();
    vi.mocked(listPaymentProviders).mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    toast.warning.mockReset();
    toast.info.mockReset();

    vi.mocked(listProviderDefinitions).mockResolvedValue([
      definition(),
      definition({
        code: 'yookassa',
        display_name: 'ЮKassa',
        adapter_status: 'available',
        can_connect: true,
        is_fake: false,
        credential_schema: [
          {
            name: 'shop_id',
            required: true,
            secret: false,
            label_ru: 'Shop ID',
            help_text: 'id',
            validation_pattern: '^[0-9]{1,20}$',
            allowed_modes: ['test', 'production'],
            placeholder: '123456',
          },
          {
            name: 'secret_key',
            required: true,
            secret: true,
            label_ru: 'Секретный ключ',
            help_text: 'secret',
            validation_pattern: null,
            allowed_modes: ['test', 'production'],
          },
        ],
      }),
      definition({
        code: 'cloudpayments',
        display_name: 'CloudPayments',
        adapter_status: 'planned',
        can_connect: false,
        is_fake: false,
      }),
    ]);
    vi.mocked(listPaymentProviders).mockResolvedValue([legacy()]);
  });

  it('does not show unconfigured connection as Включено', async () => {
    vi.mocked(listProviderConnections).mockResolvedValue([
      connection({ enabled: true, has_credentials: false, connection_name: 'Broken' }),
    ]);
    render(<PaymentProvidersPanel />);
    await screen.findByTestId('connection-card-1');
    expect(screen.queryByText('Включено')).toBeNull();
    expect(screen.getAllByText('Настройка не завершена').length).toBeGreaterThan(0);
  });

  it('separates legacy env settings from secure connections', async () => {
    vi.mocked(listProviderConnections).mockResolvedValue([
      connection({ has_credentials: true, verified: true }),
    ]);
    render(<PaymentProvidersPanel />);
    await screen.findByTestId('secure-connections-list');
    expect(screen.getByTestId('legacy-env-settings')).toBeTruthy();
    expect(screen.getByText(/Старая конфигурация/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId('legacy-env-toggle'));
    expect(screen.getByTestId('legacy-row-yookassa')).toBeTruthy();
    expect(screen.getByText(/не считать рабочим подключением/i)).toBeTruthy();
  });

  it('blocks planned definition and allows available in add wizard', async () => {
    vi.mocked(listProviderConnections).mockResolvedValue([]);
    render(<PaymentProvidersPanel />);
    fireEvent.click(await screen.findByTestId('add-connection-button'));
    const planned = await screen.findByTestId('definition-option-cloudpayments');
    const yookassa = screen.getByTestId('definition-option-yookassa');
    expect(planned).toHaveProperty('disabled', true);
    expect(planned.getAttribute('title')).toMatch(/Скоро/i);
    expect(yookassa).toHaveProperty('disabled', false);
  });

  it('uses human default name without technical Test suffix', async () => {
    vi.mocked(listProviderConnections).mockResolvedValue([]);
    render(<PaymentProvidersPanel />);
    fireEvent.click(await screen.findByTestId('add-connection-button'));
    fireEvent.click(await screen.findByTestId('definition-option-yookassa'));
    fireEvent.click(screen.getByTestId('add-connection-next'));
    const nameInput = await screen.findByTestId('connection-name-input');
    expect((nameInput as HTMLInputElement).value).toBe(defaultConnectionName('ЮKassa', 'test'));
    expect((nameInput as HTMLInputElement).value).not.toMatch(/\(Test\)/i);
  });

  it('shows Shop ID error under field for email and does not create', async () => {
    vi.mocked(listProviderConnections).mockResolvedValue([]);
    render(<PaymentProvidersPanel />);
    fireEvent.click(await screen.findByTestId('add-connection-button'));
    fireEvent.click(await screen.findByTestId('definition-option-yookassa'));
    fireEvent.click(screen.getByTestId('add-connection-next'));
    fireEvent.change(await screen.findByTestId('credential-field-shop_id'), {
      target: { value: 'user@mail.ru' },
    });
    fireEvent.change(screen.getByTestId('credential-field-secret_key'), {
      target: { value: 'test_secret_key_xx' },
    });
    fireEvent.click(screen.getByTestId('add-connection-save'));
    expect(await screen.findByTestId('credential-field-error-shop_id')).toHaveTextContent(
      SHOP_ID_INVALID_RU
    );
    expect(createProviderConnection).not.toHaveBeenCalled();
    expect(screen.queryByTestId('add-connection-error')).toBeNull();
  });

  it('creates connection once, confirms via GET, runs verify', async () => {
    const created = connection({
      id: 9,
      has_credentials: true,
      credential_fields_present: ['test_token'],
      connection_name: 'Fake (тесты) — тестовое',
    });
    vi.mocked(listProviderConnections).mockResolvedValueOnce([]).mockResolvedValue([created]);
    vi.mocked(createProviderConnection).mockResolvedValue(created);
    vi.mocked(verifyProviderConnection).mockResolvedValue({
      connection_id: 9,
      provider_code: 'fake',
      status: 'config_valid',
      message: 'ok',
      verified: true,
      checked_at: new Date().toISOString(),
    });

    render(<PaymentProvidersPanel />);
    fireEvent.click(await screen.findByTestId('add-connection-button'));
    fireEvent.click(await screen.findByTestId('definition-option-fake'));
    fireEvent.click(screen.getByTestId('add-connection-next'));

    const secretInput = await screen.findByTestId('credential-field-test_token');
    fireEvent.change(secretInput, { target: { value: 'secret-value-xyz' } });
    fireEvent.click(screen.getByTestId('add-connection-save'));

    await waitFor(() => {
      expect(createProviderConnection).toHaveBeenCalledTimes(1);
      expect(verifyProviderConnection).toHaveBeenCalledWith(9);
    });
    await screen.findByTestId('add-connection-result');
    expect(screen.queryByDisplayValue('secret-value-xyz')).toBeNull();
  });

  it('offers rename for technical names and renames via PATCH', async () => {
    const tech = connection({
      id: 5,
      connection_name: 'Lifecycle Fake 2 3e198345',
      has_credentials: true,
      verified: true,
    });
    vi.mocked(listProviderConnections)
      .mockResolvedValueOnce([tech])
      .mockResolvedValue([{ ...tech, connection_name: 'Мой Fake' }]);
    vi.mocked(updateProviderConnection).mockResolvedValue({
      ...tech,
      connection_name: 'Мой Fake',
    });

    render(<PaymentProvidersPanel />);
    await screen.findByTestId('connection-technical-name-5');
    fireEvent.click(screen.getByTestId('connection-actions-5'));
    fireEvent.click(screen.getByTestId('connection-rename-5'));
    const input = await screen.findByTestId('rename-connection-input');
    fireEvent.change(input, { target: { value: 'Мой Fake' } });
    fireEvent.click(screen.getByTestId('rename-connection-submit'));
    await waitFor(() => {
      expect(updateProviderConnection).toHaveBeenCalledWith(5, { connection_name: 'Мой Fake' });
    });
  });

  it('delete flow removes card after reload; blocks default delete', async () => {
    const a = connection({
      id: 1,
      connection_name: 'A',
      has_credentials: true,
      verified: true,
      enabled: true,
      is_default: true,
    });
    const b = connection({
      id: 2,
      connection_name: 'B',
      has_credentials: true,
      verified: true,
      enabled: false,
      is_default: false,
    });
    vi.mocked(listProviderConnections).mockResolvedValueOnce([a, b]).mockResolvedValue([a]);
    vi.mocked(deleteProviderConnection).mockResolvedValue(undefined);

    render(<PaymentProvidersPanel />);
    await screen.findByTestId('connection-card-1');

    fireEvent.click(screen.getByTestId('connection-actions-1'));
    expect(screen.getByTestId('connection-delete-1')).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByTestId('connection-actions-2'));
    fireEvent.click(screen.getByTestId('connection-delete-2'));
    fireEvent.click(await screen.findByTestId('delete-connection-confirm'));
    await waitFor(() => {
      expect(deleteProviderConnection).toHaveBeenCalledWith(2);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('connection-card-2')).toBeNull();
    });
  });

  it('keeps enable disabled until ready; default disabled until enabled', async () => {
    vi.mocked(listProviderConnections).mockResolvedValue([
      connection({
        id: 3,
        has_credentials: true,
        verified: false,
        enabled: false,
      }),
    ]);
    render(<PaymentProvidersPanel />);
    const toggle = await screen.findByTestId('connection-toggle-3');
    const setDefault = screen.getByTestId('connection-set-default-3');
    expect(toggle).toHaveProperty('disabled', true);
    expect(toggle.getAttribute('title')).toMatch(/проверьте/i);
    expect(setDefault).toHaveProperty('disabled', true);
  });

  it('switches default via confirmation and then allows disabling old default', async () => {
    const a = connection({
      id: 1,
      connection_name: 'A',
      has_credentials: true,
      verified: true,
      enabled: true,
      is_default: true,
    });
    const b = connection({
      id: 2,
      connection_name: 'B',
      has_credentials: true,
      verified: true,
      enabled: true,
      is_default: false,
    });
    const after = [
      { ...a, is_default: false },
      { ...b, is_default: true },
    ];
    vi.mocked(listProviderConnections).mockResolvedValueOnce([a, b]).mockResolvedValue(after);
    vi.mocked(setDefaultProviderConnection).mockResolvedValue({ ...b, is_default: true });

    render(<PaymentProvidersPanel />);
    expect(await screen.findByTestId('connection-toggle-1')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('connection-toggle-1').getAttribute('title')).toBe(
      DISABLE_DEFAULT_HINT
    );

    fireEvent.click(screen.getByTestId('connection-set-default-2'));
    const dialog = await screen.findByTestId('confirm-default-modal');
    expect(within(dialog).getByText(/Новые платежи будут направляться через/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId('confirm-default-submit'));

    await waitFor(() => {
      expect(setDefaultProviderConnection).toHaveBeenCalledWith(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId('connection-toggle-1')).toHaveProperty('disabled', false);
      expect(screen.getByTestId('connection-toggle-2')).toHaveProperty('disabled', true);
    });
    const card2 = screen.getByTestId('connection-card-2');
    expect(within(card2).getAllByText('Основное').length).toBeGreaterThanOrEqual(1);
    expect(within(screen.getByTestId('connection-card-1')).queryByText('Основное')).toBeNull();
  });

  it('maps master-key 503 to server storage error', async () => {
    const { formatProviderActionError, SERVER_ENCRYPTION_NOT_CONFIGURED } = await import(
      '@/features/dashboard/finance/financeHelpers'
    );
    expect(
      formatProviderActionError(
        503,
        'PAYMENT_CREDENTIALS_MASTER_KEY is missing',
        'master_key_missing'
      )
    ).toBe(SERVER_ENCRYPTION_NOT_CONFIGURED);
  });
});
