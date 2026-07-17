import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../../api/client';
import {
  createProviderConnection,
  listProviderConnections,
  verifyProviderConnection,
  type ConnectionMode,
  type ConnectionVerifyResult,
  type PaymentProviderConnection,
  type PaymentProviderDefinition,
} from '../../../api/paymentProviderConnections';
import {
  FINANCE_COLORS,
  SHOP_ID_INVALID_RU,
  SHOP_ID_PLACEHOLDER,
  canSelectDefinition,
  connectionResponseLooksSafe,
  defaultConnectionName,
  definitionAvailabilityLabel,
  formatProviderActionError,
  validateCredentialField,
} from './financeHelpers';

interface Props {
  open: boolean;
  definitions: PaymentProviderDefinition[];
  busy: boolean;
  onBusy: (v: boolean) => void;
  onClose: () => void;
  onCreated: (connection: PaymentProviderConnection, verify: ConnectionVerifyResult | null) => void;
  onIncomplete?: (connection: PaymentProviderConnection | null) => void;
}

type Step = 1 | 2 | 3;

/**
 * Wizard: выбрать available definition → заполнить форму → сохранить + verify.
 * Credentials живут в state только до успешной отправки create, затем очищаются.
 */
export default function AddConnectionModal({
  open,
  definitions,
  busy,
  onBusy,
  onClose,
  onCreated,
  onIncomplete,
}: Props) {
  const [step, setStep] = useState<Step>(1);
  const [providerCode, setProviderCode] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [mode, setMode] = useState<ConnectionMode>('test');
  const [currency, setCurrency] = useState('RUB');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<PaymentProviderConnection | null>(null);
  const [verifyResult, setVerifyResult] = useState<ConnectionVerifyResult | null>(null);
  const [incomplete, setIncomplete] = useState(false);
  const submittingRef = useRef(false);
  const createdIdRef = useRef<number | null>(null);

  const selected = useMemo(
    () => definitions.find(d => d.code === providerCode) || null,
    [definitions, providerCode]
  );

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setProviderCode('');
    setConnectionName('');
    setMode('test');
    setCurrency('RUB');
    setCredentials({});
    setError(null);
    setFieldErrors({});
    setCreated(null);
    setVerifyResult(null);
    setIncomplete(false);
    submittingRef.current = false;
    createdIdRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!selected) return;
    const next: Record<string, string> = {};
    for (const field of selected.credential_schema) {
      next[field.name] = '';
    }
    setCredentials(next);
    if (selected.supported_currencies?.length) {
      setCurrency(selected.supported_currencies[0]);
    }
    setConnectionName(defaultConnectionName(selected.display_name, mode));
    setFieldErrors({});
  }, [selected]);

  useEffect(() => {
    if (!selected) return;
    setConnectionName(defaultConnectionName(selected.display_name, mode));
  }, [mode, selected]);

  if (!open) return null;

  const schemaFields = (selected?.credential_schema || []).filter(f =>
    (f.allowed_modes || ['test', 'production']).includes(mode)
  );

  const goStep2 = () => {
    setError(null);
    if (!selected || !canSelectDefinition(selected)) {
      setError('Выберите провайдера с реализованным адаптером');
      return;
    }
    setStep(2);
  };

  const validateForm = (): boolean => {
    const nextErrors: Record<string, string> = {};
    if (!connectionName.trim()) {
      setError('Укажите название подключения');
      return false;
    }
    for (const field of schemaFields) {
      const err = validateCredentialField(
        field.name,
        credentials[field.name] || '',
        field.validation_pattern,
        field.required,
        field.label_ru
      );
      if (err) nextErrors[field.name] = err;
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError(null);
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (!selected || submittingRef.current || busy) return;
    setError(null);
    if (!validateForm()) return;

    submittingRef.current = true;
    onBusy(true);
    try {
      const payloadCreds: Record<string, string> = {};
      for (const field of schemaFields) {
        const v = (credentials[field.name] || '').trim();
        if (v) payloadCreds[field.name] = v;
      }
      const credentialsSnapshot = { ...payloadCreds };

      let connection: PaymentProviderConnection;
      if (createdIdRef.current != null) {
        // Повторный клик после частичного успеха — не создаём дубликат
        const listed = await listProviderConnections();
        const found = listed.find(c => c.id === createdIdRef.current);
        if (!found) {
          setIncomplete(true);
          setStep(3);
          onIncomplete?.(null);
          return;
        }
        connection = found;
      } else {
        connection = await createProviderConnection({
          provider_code: selected.code,
          connection_name: connectionName.trim(),
          mode,
          currency: currency.trim().toUpperCase() || 'RUB',
          enabled: false,
          credentials: credentialsSnapshot,
        });
        createdIdRef.current = connection.id;
      }

      if (!connectionResponseLooksSafe(connection, credentialsSnapshot)) {
        setError('Ответ API неожиданно содержит секретные данные — обратитесь к разработчикам');
        setCredentials({});
        return;
      }

      setCredentials({});

      let verify: ConnectionVerifyResult | null = null;
      try {
        verify = await verifyProviderConnection(connection.id);
      } catch (err: unknown) {
        const status = err instanceof ApiError ? err.status : 0;
        const raw = err instanceof Error ? err.message : null;
        verify = {
          connection_id: connection.id,
          provider_code: connection.provider_code,
          status: 'invalid',
          message: formatProviderActionError(
            status,
            raw,
            err instanceof ApiError ? err.code : undefined
          ),
          verified: false,
          checked_at: new Date().toISOString(),
        };
      }

      const listed = await listProviderConnections();
      const confirmed = listed.find(c => c.id === connection.id) || null;
      if (!confirmed) {
        setCreated(connection);
        setVerifyResult(verify);
        setIncomplete(true);
        setStep(3);
        onIncomplete?.(connection);
        return;
      }

      setCreated(confirmed);
      setVerifyResult(verify);
      setIncomplete(false);
      setStep(3);
      onCreated(confirmed, verify);
    } catch (err: unknown) {
      const status = err instanceof ApiError ? err.status : 0;
      const raw = err instanceof Error ? err.message : null;
      const code = err instanceof ApiError ? err.code : undefined;
      const field = err instanceof ApiError ? err.field : undefined;
      const message = formatProviderActionError(status, raw, code);
      if (
        field === 'shop_id' ||
        code === 'invalid_credential_format' ||
        message.includes('Shop ID')
      ) {
        setFieldErrors(prev => ({
          ...prev,
          shop_id: message.includes('Shop ID') ? SHOP_ID_INVALID_RU : message,
        }));
        setError(null);
      } else {
        setError(message);
      }
      // Не очищаем credentials при ошибке валидации — пользователь может исправить поле
      if (status >= 500 || status === 503) {
        setCredentials({});
      }
    } finally {
      submittingRef.current = false;
      onBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-connection-title"
      data-testid="add-connection-modal"
      onClick={onClose}
      style={overlayStyle}
    >
      <div onClick={e => e.stopPropagation()} style={modalStyle}>
        <h3 id="add-connection-title" style={titleStyle}>
          Подключить платёжную систему
        </h3>
        <p style={stepHintStyle}>Шаг {step} из 3</p>

        {error && (
          <div style={errorBox} data-testid="add-connection-error">
            {error}
          </div>
        )}

        {step === 1 && (
          <div style={{ display: 'grid', gap: 8 }}>
            <p style={{ margin: 0, color: FINANCE_COLORS.textSecondary, fontSize: 13 }}>
              Выберите платёжную систему. Пункты со статусом «Скоро» пока нельзя подключить.
            </p>
            {definitions.map(d => {
              const selectable = canSelectDefinition(d);
              const active = providerCode === d.code;
              return (
                <button
                  key={d.code}
                  type="button"
                  data-testid={`definition-option-${d.code}`}
                  disabled={!selectable || busy}
                  title={selectable ? undefined : 'Скоро'}
                  onClick={() => selectable && setProviderCode(d.code)}
                  style={{
                    ...optionBtn,
                    border: active
                      ? `1px solid ${FINANCE_COLORS.accent}`
                      : `1px solid ${FINANCE_COLORS.badgeMutedBorder}`,
                    opacity: selectable ? 1 : 0.55,
                    cursor: selectable ? 'pointer' : 'not-allowed',
                    background: active ? FINANCE_COLORS.accentSoftBg : FINANCE_COLORS.fieldBg,
                  }}
                >
                  <div style={{ fontWeight: 700, color: FINANCE_COLORS.accent }}>
                    {d.display_name}
                  </div>
                  <div style={{ fontSize: 12, color: FINANCE_COLORS.textSecondary }}>
                    {definitionAvailabilityLabel(d)}
                  </div>
                </button>
              );
            })}
            <div style={footerRow}>
              <button type="button" onClick={onClose} disabled={busy} style={secondaryBtn}>
                Отмена
              </button>
              <button
                type="button"
                data-testid="add-connection-next"
                onClick={goStep2}
                disabled={busy || !providerCode}
                style={primaryBtn}
              >
                Далее
              </button>
            </div>
          </div>
        )}

        {step === 2 && selected && (
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={fieldLabel}>
              Название подключения
              <input
                data-testid="connection-name-input"
                value={connectionName}
                disabled={busy}
                onChange={e => setConnectionName(e.target.value)}
                style={fieldControl}
              />
            </label>
            <label style={fieldLabel}>
              Режим
              <select
                data-testid="connection-mode-select"
                value={mode}
                disabled={busy || selected.is_fake}
                onChange={e => setMode(e.target.value as ConnectionMode)}
                style={fieldControl}
              >
                <option value="test">Тестовый</option>
                {!selected.is_fake && <option value="production">Рабочий</option>}
              </select>
            </label>
            <label style={fieldLabel}>
              Валюта
              <input
                value={currency}
                disabled={busy}
                onChange={e => setCurrency(e.target.value)}
                style={fieldControl}
              />
            </label>
            {schemaFields.map(field => {
              const fieldError = fieldErrors[field.name];
              const placeholder =
                field.placeholder ||
                (field.name === 'shop_id'
                  ? SHOP_ID_PLACEHOLDER
                  : field.secret
                    ? '••••••••'
                    : undefined);
              return (
                <label key={field.name} style={fieldLabel}>
                  {field.label_ru}
                  {field.required ? ' *' : ''}
                  <input
                    data-testid={`credential-field-${field.name}`}
                    type={field.secret ? 'password' : 'text'}
                    autoComplete="off"
                    value={credentials[field.name] || ''}
                    disabled={busy}
                    placeholder={placeholder}
                    aria-invalid={Boolean(fieldError)}
                    onChange={e => {
                      setCredentials(prev => ({ ...prev, [field.name]: e.target.value }));
                      if (fieldErrors[field.name]) {
                        setFieldErrors(prev => {
                          const next = { ...prev };
                          delete next[field.name];
                          return next;
                        });
                      }
                    }}
                    style={{
                      ...fieldControl,
                      border: fieldError
                        ? `1px solid ${FINANCE_COLORS.danger}`
                        : fieldControl.border,
                    }}
                  />
                  {fieldError ? (
                    <span
                      data-testid={`credential-field-error-${field.name}`}
                      style={{ fontSize: 12, color: FINANCE_COLORS.danger }}
                    >
                      {fieldError}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: FINANCE_COLORS.textSecondary }}>
                      {field.help_text}
                      {field.secret ? ' Секрет нельзя прочитать после сохранения.' : ''}
                    </span>
                  )}
                </label>
              );
            })}
            <div style={footerRow}>
              <button type="button" onClick={() => setStep(1)} disabled={busy} style={secondaryBtn}>
                Назад
              </button>
              <button
                type="button"
                data-testid="add-connection-save"
                onClick={() => void submit()}
                disabled={busy}
                style={primaryBtn}
              >
                {busy ? 'Сохраняем…' : 'Сохранить и проверить'}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'grid', gap: 12 }} data-testid="add-connection-result">
            {incomplete ? (
              <>
                <p
                  style={{ margin: 0, color: FINANCE_COLORS.accent, fontWeight: 700 }}
                  data-testid="add-connection-incomplete"
                >
                  Настройка не завершена
                </p>
                <p style={{ margin: 0, color: FINANCE_COLORS.textSecondary, fontSize: 13 }}>
                  Запись создана частично или ещё не появилась в списке. Можно продолжить настройку
                  на карточке подключения или удалить её через меню «Действия».
                </p>
              </>
            ) : (
              created && (
                <>
                  <p style={{ margin: 0, color: FINANCE_COLORS.text, lineHeight: 1.5 }}>
                    Подключение{' '}
                    <strong style={{ color: FINANCE_COLORS.accent }}>
                      {created.connection_name}
                    </strong>{' '}
                    сохранено.
                  </p>
                  <p style={{ margin: 0, color: FINANCE_COLORS.textSecondary, fontSize: 13 }}>
                    Ключи сохранены на сервере в зашифрованном виде и больше не отображаются.
                  </p>
                  <div
                    style={{
                      padding: 12,
                      borderRadius: 8,
                      border: `1px solid ${
                        verifyResult?.verified
                          ? 'rgba(16,185,129,0.45)'
                          : FINANCE_COLORS.accentBorder
                      }`,
                      background: FINANCE_COLORS.fieldBg,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: FINANCE_COLORS.accent, marginBottom: 6 }}>
                      Результат проверки
                    </div>
                    <div style={{ color: FINANCE_COLORS.text, fontSize: 14 }}>
                      {verifyResult?.verified
                        ? 'Подключение проверено'
                        : verifyResult?.message || 'Проверка не пройдена'}
                    </div>
                  </div>
                </>
              )
            )}
            <div style={footerRow}>
              <button
                type="button"
                data-testid="add-connection-done"
                onClick={onClose}
                style={primaryBtn}
              >
                Готово
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.78)',
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const modalStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 520,
  maxHeight: '90vh',
  overflow: 'auto',
  background: FINANCE_COLORS.panelBgElevated,
  border: `1px solid ${FINANCE_COLORS.accentBorder}`,
  borderRadius: 12,
  padding: 24,
  boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
  color: FINANCE_COLORS.text,
};

const titleStyle: React.CSSProperties = {
  margin: '0 0 4px 0',
  color: FINANCE_COLORS.accent,
  fontSize: 18,
};

const stepHintStyle: React.CSSProperties = {
  margin: '0 0 16px 0',
  color: FINANCE_COLORS.textSecondary,
  fontSize: 13,
};

const errorBox: React.CSSProperties = {
  marginBottom: 12,
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid rgba(255, 59, 48, 0.5)`,
  background: FINANCE_COLORS.fieldBg,
  color: FINANCE_COLORS.danger,
  fontSize: 13,
};

const optionBtn: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 14px',
  borderRadius: 8,
  color: FINANCE_COLORS.text,
};

const footerRow: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
  marginTop: 8,
};

const fieldLabel: React.CSSProperties = {
  display: 'grid',
  gap: 4,
  fontSize: 12,
  color: FINANCE_COLORS.textSecondary,
};

const fieldControl: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${FINANCE_COLORS.accentBorder}`,
  background: FINANCE_COLORS.fieldBg,
  color: FINANCE_COLORS.text,
  minHeight: 44,
};

const secondaryBtn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 8,
  border: `1px solid ${FINANCE_COLORS.badgeMutedBorder}`,
  background: FINANCE_COLORS.fieldBg,
  color: FINANCE_COLORS.text,
  cursor: 'pointer',
  fontWeight: 600,
  minHeight: 44,
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 14px',
  borderRadius: 8,
  border: 'none',
  background: FINANCE_COLORS.accent,
  color: FINANCE_COLORS.dark,
  cursor: 'pointer',
  fontWeight: 700,
  minHeight: 44,
};
