/**
 * Admin API: secure payment provider connections (Этап 6.10A).
 * Secret values никогда не ожидаются в response.
 */
import api from './client';

export const PROVIDER_DEFINITIONS_API_PATH = '/api/admin/payment-provider-definitions';
export const PROVIDER_CONNECTIONS_API_PATH = '/api/admin/payment-provider-connections';

export type AdapterStatus = 'planned' | 'available' | string;
export type ConnectionMode = 'test' | 'production';

export interface CredentialFieldSchema {
  name: string;
  required: boolean;
  secret: boolean;
  label_ru: string;
  help_text: string;
  validation_pattern: string | null;
  allowed_modes: string[];
  placeholder?: string | null;
}

export interface PaymentProviderDefinition {
  code: string;
  display_name: string;
  regions: string[];
  supported_currencies: string[];
  supported_features: string[];
  adapter_status: AdapterStatus;
  credential_schema: CredentialFieldSchema[];
  webhook_capabilities: string[];
  documentation_note: string;
  is_fake: boolean;
  can_connect: boolean;
}

export interface PaymentProviderConnection {
  id: number;
  provider_code: string;
  connection_name: string;
  mode: ConnectionMode | string;
  enabled: boolean;
  verified: boolean;
  is_default: boolean;
  currency: string;
  priority: number;
  public_identifier_masked: string | null;
  credentials_version: number;
  credentials_key_id: string | null;
  has_credentials: boolean;
  credential_fields_present: string[];
  adapter_status: AdapterStatus;
  created_by: number | null;
  updated_by: number | null;
  verified_at: string | null;
  last_health_check_at: string | null;
  last_health_check_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConnectionCreatePayload {
  provider_code: string;
  connection_name: string;
  mode: ConnectionMode;
  currency: string;
  priority?: number;
  enabled?: boolean;
  credentials: Record<string, string>;
}

export interface ConnectionUpdatePayload {
  connection_name?: string;
  mode?: ConnectionMode;
  currency?: string;
  priority?: number;
  enabled?: boolean;
}

export interface ConnectionVerifyResult {
  connection_id: number;
  provider_code: string;
  status: 'config_valid' | 'adapter_not_implemented' | 'invalid' | string;
  message: string;
  verified: boolean;
  checked_at: string;
}

export async function listProviderDefinitions(): Promise<PaymentProviderDefinition[]> {
  return api.get(PROVIDER_DEFINITIONS_API_PATH) as Promise<PaymentProviderDefinition[]>;
}

export async function listProviderConnections(): Promise<PaymentProviderConnection[]> {
  return api.get(PROVIDER_CONNECTIONS_API_PATH) as Promise<PaymentProviderConnection[]>;
}

export async function createProviderConnection(
  payload: ConnectionCreatePayload
): Promise<PaymentProviderConnection> {
  return api.post(PROVIDER_CONNECTIONS_API_PATH, payload) as Promise<PaymentProviderConnection>;
}

export async function updateProviderConnection(
  id: number,
  payload: ConnectionUpdatePayload
): Promise<PaymentProviderConnection> {
  return api.patch(
    `${PROVIDER_CONNECTIONS_API_PATH}/${id}`,
    payload
  ) as Promise<PaymentProviderConnection>;
}

export async function setDefaultProviderConnection(id: number): Promise<PaymentProviderConnection> {
  return api.post(
    `${PROVIDER_CONNECTIONS_API_PATH}/${id}/set-default`,
    {}
  ) as Promise<PaymentProviderConnection>;
}

export async function verifyProviderConnection(id: number): Promise<ConnectionVerifyResult> {
  return api.post(
    `${PROVIDER_CONNECTIONS_API_PATH}/${id}/verify`,
    {}
  ) as Promise<ConnectionVerifyResult>;
}

export async function replaceProviderConnectionCredentials(
  id: number,
  credentials: Record<string, string>
): Promise<PaymentProviderConnection> {
  return api.put(`${PROVIDER_CONNECTIONS_API_PATH}/${id}/credentials`, {
    credentials,
  }) as Promise<PaymentProviderConnection>;
}

export async function deleteProviderConnection(id: number): Promise<void> {
  await api.delete(`${PROVIDER_CONNECTIONS_API_PATH}/${id}`);
}
