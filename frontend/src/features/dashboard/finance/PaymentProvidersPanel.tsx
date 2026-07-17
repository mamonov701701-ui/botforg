import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteProviderConnection,
  listProviderConnections,
  listProviderDefinitions,
  replaceProviderConnectionCredentials,
  setDefaultProviderConnection,
  updateProviderConnection,
  verifyProviderConnection,
  type PaymentProviderConnection,
  type PaymentProviderDefinition,
} from '../../../api/paymentProviderConnections';
import {
  listPaymentProviders,
  type PaymentProviderAdmin,
} from '../../../api/paymentProvidersAdmin';
import { ApiError } from '../../../api/client';
import { toast } from '../../../utils/toast';
import AddConnectionModal from './AddConnectionModal';
import ConfirmDefaultModal from './ConfirmDefaultModal';
import {
  FINANCE_COLORS,
  SWITCH_DEFAULT_INSTRUCTION,
  canDeleteConnection,
  canDisableConnection,
  canEnableConnection,
  canSetDefaultConnection,
  canShowDisableButton,
  canShowEnableButton,
  canShowSetDefaultButton,
  canShowVerifyButton,
  connectionLifecycleBadges,
  defaultConnectionName,
  formatConnectionsLoadError,
  formatDateTime,
  formatProviderActionError,
  formatProvidersLoadError,
  getDefaultConnection,
  hasAlternateDefaultCandidate,
  isTechnicalConnectionName,
  modeLabel,
  readinessLabel,
  validateCredentialField,
  SHOP_ID_PLACEHOLDER,
} from './financeHelpers';

type LoadState = 'loading' | 'ready' | 'error' | 'forbidden' | 'empty';

export default function PaymentProvidersPanel() {
  const [connections, setConnections] = useState<PaymentProviderConnection[]>([]);
  const [definitions, setDefinitions] = useState<PaymentProviderDefinition[]>([]);
  const [legacy, setLegacy] = useState<PaymentProviderAdmin[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmDefault, setConfirmDefault] = useState<PaymentProviderConnection | null>(null);
  const [legacyError, setLegacyError] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [renameTarget, setRenameTarget] = useState<PaymentProviderConnection | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PaymentProviderConnection | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<PaymentProviderConnection | null>(null);
  const [replaceCreds, setReplaceCreds] = useState<Record<string, string>>({});
  const [replaceErrors, setReplaceErrors] = useState<Record<string, string>>({});
  const [detailsOpenId, setDetailsOpenId] = useState<number | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) {
      setLoadState('loading');
      setErrorMessage(null);
    }
    try {
      const [defs, conns] = await Promise.all([
        listProviderDefinitions(),
        listProviderConnections(),
      ]);
      setDefinitions(Array.isArray(defs) ? defs : []);
      setConnections(Array.isArray(conns) ? conns : []);
      setLoadState(!conns || conns.length === 0 ? 'empty' : 'ready');
    } catch (err: unknown) {
      const status = err instanceof ApiError ? err.status : 0;
      const message = err instanceof Error ? err.message : 'Не удалось загрузить подключения';
      const formatted = formatConnectionsLoadError(status, message);
      setLoadState(status === 401 || status === 403 ? 'forbidden' : 'error');
      setErrorMessage(formatted);
    }

    try {
      const legacyList = await listPaymentProviders();
      setLegacy(Array.isArray(legacyList) ? legacyList : []);
      setLegacyError(null);
    } catch (err: unknown) {
      const status = err instanceof ApiError ? err.status : 0;
      const message = err instanceof Error ? err.message : null;
      setLegacy([]);
      setLegacyError(formatProvidersLoadError(status, message));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const definitionByCode = useCallback(
    (code: string) => definitions.find(d => d.code === code) || null,
    [definitions]
  );

  const definitionName = useCallback(
    (code: string) => definitionByCode(code)?.display_name || code,
    [definitionByCode]
  );

  const withBusy = async (id: number, fn: () => Promise<void>) => {
    setBusyId(id);
    try {
      await fn();
      await load({ silent: true });
    } catch (err: unknown) {
      const status = err instanceof ApiError ? err.status : 0;
      const raw = err instanceof Error ? err.message : null;
      const code = err instanceof ApiError ? err.code : undefined;
      const message = formatProviderActionError(status, raw, code);
      if (status === 409 || status === 503) toast.warning(message);
      else toast.error(message);
    } finally {
      setBusyId(null);
      setMenuOpenId(null);
    }
  };

  const onToggleEnabled = (c: PaymentProviderConnection) => {
    if (c.enabled) {
      const gate = canDisableConnection(c);
      if (!gate.ok) {
        toast.warning(gate.reason || SWITCH_DEFAULT_INSTRUCTION);
        return;
      }
      void withBusy(c.id, async () => {
        await updateProviderConnection(c.id, { enabled: false });
        toast.success('Подключение выключено');
      });
      return;
    }
    const gate = canEnableConnection(c);
    if (!gate.ok) {
      toast.warning(gate.reason || 'Включение недоступно');
      return;
    }
    void withBusy(c.id, async () => {
      await updateProviderConnection(c.id, { enabled: true });
      toast.success('Подключение включено');
    });
  };

  const onVerify = (c: PaymentProviderConnection) => {
    void withBusy(c.id, async () => {
      const result = await verifyProviderConnection(c.id);
      if (result.verified) toast.success(result.message || 'Подключение проверено');
      else toast.warning(result.message || 'Проверка не пройдена');
    });
  };

  const onConfirmDefault = () => {
    if (!confirmDefault) return;
    const id = confirmDefault.id;
    void withBusy(id, async () => {
      await setDefaultProviderConnection(id);
      toast.success('Основное подключение обновлено');
      setConfirmDefault(null);
    });
  };

  const openRename = (c: PaymentProviderConnection) => {
    setMenuOpenId(null);
    setRenameTarget(c);
    setRenameValue(
      isTechnicalConnectionName(c.connection_name, c.provider_code)
        ? defaultConnectionName(definitionName(c.provider_code), c.mode)
        : c.connection_name
    );
  };

  const submitRename = () => {
    if (!renameTarget) return;
    const name = renameValue.trim();
    if (!name) {
      toast.warning('Укажите название');
      return;
    }
    void withBusy(renameTarget.id, async () => {
      await updateProviderConnection(renameTarget.id, { connection_name: name });
      toast.success('Название обновлено');
      setRenameTarget(null);
    });
  };

  const openReplace = (c: PaymentProviderConnection) => {
    setMenuOpenId(null);
    const def = definitionByCode(c.provider_code);
    const next: Record<string, string> = {};
    for (const f of def?.credential_schema || []) {
      next[f.name] = '';
    }
    setReplaceCreds(next);
    setReplaceErrors({});
    setReplaceTarget(c);
  };

  const submitReplace = () => {
    if (!replaceTarget) return;
    const def = definitionByCode(replaceTarget.provider_code);
    const fields = (def?.credential_schema || []).filter(f =>
      (f.allowed_modes || ['test', 'production']).includes(replaceTarget.mode)
    );
    const errors: Record<string, string> = {};
    for (const field of fields) {
      const err = validateCredentialField(
        field.name,
        replaceCreds[field.name] || '',
        field.validation_pattern,
        field.required,
        field.label_ru
      );
      if (err) errors[field.name] = err;
    }
    setReplaceErrors(errors);
    if (Object.keys(errors).length) return;

    const payload: Record<string, string> = {};
    for (const field of fields) {
      const v = (replaceCreds[field.name] || '').trim();
      if (v) payload[field.name] = v;
    }
    void withBusy(replaceTarget.id, async () => {
      await replaceProviderConnectionCredentials(replaceTarget.id, payload);
      toast.success('Ключи обновлены. Проверьте подключение.');
      setReplaceTarget(null);
      setReplaceCreds({});
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const gate = canDeleteConnection(deleteTarget);
    if (!gate.ok) {
      toast.warning(gate.reason || 'Удаление недоступно');
      return;
    }
    const id = deleteTarget.id;
    void withBusy(id, async () => {
      await deleteProviderConnection(id);
      toast.success('Подключение удалено');
      setDeleteTarget(null);
    });
  };

  const currentDefault = useMemo(() => getDefaultConnection(connections), [connections]);
  const canSwitchAway = useMemo(
    () => (currentDefault ? hasAlternateDefaultCandidate(connections, currentDefault.id) : false),
    [connections, currentDefault]
  );

  if (loadState === 'loading') {
    return <StatusBanner tone="muted">Загрузка подключений…</StatusBanner>;
  }

  if (loadState === 'forbidden') {
    return <StatusBanner tone="danger">{errorMessage || 'Доступ запрещён'}</StatusBanner>;
  }

  if (loadState === 'error') {
    return (
      <div style={panelShell}>
        <StatusBanner tone="danger">{errorMessage || 'Ошибка API'}</StatusBanner>
        <button type="button" onClick={() => void load()} style={accentBtn}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div data-testid="payment-providers-panel" onClick={() => setMenuOpenId(null)}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <p
          style={{
            margin: 0,
            flex: '1 1 280px',
            maxWidth: 720,
            color: FINANCE_COLORS.textSecondary,
            fontSize: 14,
            lineHeight: 1.5,
          }}
        >
          Подключайте платёжные системы, проверяйте настройки и выбирайте основную для новых
          платежей.
        </p>
        <button
          type="button"
          data-testid="add-connection-button"
          onClick={() => setAddOpen(true)}
          style={accentBtn}
        >
          Подключить платёжную систему
        </button>
      </div>

      <StatusBanner tone="warn">
        Платёжные ключи хранятся в зашифрованном виде и не отображаются после сохранения. Смена
        основной платёжной системы не влияет на уже созданные платежи.
      </StatusBanner>

      {currentDefault && !canSwitchAway && (
        <StatusBanner tone="warn" data-testid="switch-default-instruction">
          <div style={{ whiteSpace: 'pre-line' }}>{SWITCH_DEFAULT_INSTRUCTION}</div>
        </StatusBanner>
      )}

      {loadState === 'empty' && (
        <StatusBanner tone="muted">
          Платёжные системы пока не подключены. Нажмите «Подключить платёжную систему».
        </StatusBanner>
      )}

      <div
        data-testid="secure-connections-list"
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          marginBottom: 28,
        }}
      >
        {connections.map(c => {
          const enableGate = canEnableConnection(c);
          const disableGate = canDisableConnection(c);
          const defaultGate = canSetDefaultConnection(c);
          const deleteGate = canDeleteConnection(c);
          const busy = busyId === c.id;
          const badges = connectionLifecycleBadges(c);
          const technical = isTechnicalConnectionName(c.connection_name, c.provider_code);
          const incomplete = !c.has_credentials;

          return (
            <article
              key={c.id}
              data-testid={`connection-card-${c.id}`}
              onClick={e => e.stopPropagation()}
              style={{
                border: `1px solid ${
                  c.is_default ? FINANCE_COLORS.accentBorderStrong : FINANCE_COLORS.accentBorder
                }`,
                borderRadius: 12,
                background: FINANCE_COLORS.panelBg,
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                color: FINANCE_COLORS.text,
              }}
            >
              <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 700,
                      color: FINANCE_COLORS.accent,
                      wordBreak: 'break-word',
                    }}
                    data-testid={`connection-title-${c.id}`}
                  >
                    {c.connection_name}
                  </div>
                  <div style={{ fontSize: 13, color: FINANCE_COLORS.textSecondary, marginTop: 4 }}>
                    {definitionName(c.provider_code)} · {modeLabel(c.mode)} · {c.currency}
                  </div>
                </div>
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    data-testid={`connection-actions-${c.id}`}
                    disabled={busy}
                    onClick={() => setMenuOpenId(menuOpenId === c.id ? null : c.id)}
                    style={secondaryBtn}
                  >
                    Действия
                  </button>
                  {menuOpenId === c.id && (
                    <div
                      data-testid={`connection-actions-menu-${c.id}`}
                      style={actionsMenu}
                      role="menu"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        data-testid={`connection-rename-${c.id}`}
                        onClick={() => openRename(c)}
                        style={menuItemBtn}
                      >
                        Переименовать
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        data-testid={`connection-replace-keys-${c.id}`}
                        disabled={!c.has_credentials}
                        title={!c.has_credentials ? 'Сначала сохраните ключи' : undefined}
                        onClick={() => openReplace(c)}
                        style={menuItemBtn}
                      >
                        Заменить ключи
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        data-testid={`connection-delete-${c.id}`}
                        disabled={!deleteGate.ok}
                        title={!deleteGate.ok ? deleteGate.reason : undefined}
                        onClick={() => {
                          setMenuOpenId(null);
                          if (!deleteGate.ok) {
                            toast.warning(deleteGate.reason || 'Удаление недоступно');
                            return;
                          }
                          setDeleteTarget(c);
                        }}
                        style={{ ...menuItemBtn, color: FINANCE_COLORS.danger }}
                      >
                        Удалить
                      </button>
                    </div>
                  )}
                </div>
              </header>

              {incomplete && (
                <StatusBanner tone="warn" data-testid={`connection-incomplete-${c.id}`}>
                  Настройка не завершена. Продолжите настройку или удалите подключение.
                </StatusBanner>
              )}

              {technical && (
                <div
                  data-testid={`connection-technical-name-${c.id}`}
                  style={{
                    fontSize: 12,
                    color: FINANCE_COLORS.textSecondary,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  Техническое название.
                  <button type="button" onClick={() => openRename(c)} style={{ ...linkBtn }}>
                    Переименовать
                  </button>
                </div>
              )}

              <div
                data-testid={`connection-status-${c.id}`}
                style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
              >
                {badges.map(label => (
                  <Badge
                    key={label}
                    color={
                      label === 'Основное' || label === 'Включено' || label === 'Проверено'
                        ? FINANCE_COLORS.accent
                        : FINANCE_COLORS.textSecondary
                    }
                  >
                    {label}
                  </Badge>
                ))}
              </div>

              <button
                type="button"
                data-testid={`connection-details-toggle-${c.id}`}
                onClick={() => setDetailsOpenId(detailsOpenId === c.id ? null : c.id)}
                style={{
                  ...linkBtn,
                  alignSelf: 'flex-start',
                  fontSize: 12,
                }}
              >
                {detailsOpenId === c.id ? '▾ Скрыть детали' : '▸ Технические детали'}
              </button>
              {detailsOpenId === c.id && (
                <dl style={metaGrid} data-testid={`connection-details-${c.id}`}>
                  <dt style={{ color: FINANCE_COLORS.textSecondary }}>Внутренний ID</dt>
                  <dd>{c.id}</dd>
                  <dt style={{ color: FINANCE_COLORS.textSecondary }}>Идентификатор</dt>
                  <dd>{c.public_identifier_masked || '—'}</dd>
                  <dt style={{ color: FINANCE_COLORS.textSecondary }}>Сохранённые поля</dt>
                  <dd>{(c.credential_fields_present || []).join(', ') || '—'}</dd>
                  <dt style={{ color: FINANCE_COLORS.textSecondary }}>Проверено</dt>
                  <dd>
                    {c.verified ? 'да' : 'нет'} · {formatDateTime(c.verified_at)}
                  </dd>
                </dl>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'auto' }}>
                {canShowEnableButton(c) && (
                  <button
                    type="button"
                    data-testid={`connection-toggle-${c.id}`}
                    disabled={busy || !enableGate.ok}
                    title={!enableGate.ok ? enableGate.reason : undefined}
                    onClick={() => onToggleEnabled(c)}
                    style={secondaryBtn}
                  >
                    {busy ? '…' : 'Включить'}
                  </button>
                )}
                {canShowDisableButton(c) && (
                  <button
                    type="button"
                    data-testid={`connection-toggle-${c.id}`}
                    disabled={busy || !disableGate.ok}
                    title={!disableGate.ok ? disableGate.reason : undefined}
                    onClick={() => onToggleEnabled(c)}
                    style={secondaryBtn}
                  >
                    {busy ? '…' : 'Выключить'}
                  </button>
                )}
                {c.is_default && (
                  <button
                    type="button"
                    data-testid={`pick-other-default-${c.id}`}
                    disabled={busy || !canSwitchAway}
                    title={
                      canSwitchAway
                        ? 'Выберите другое включённое проверенное подключение и нажмите «Сделать основным»'
                        : SWITCH_DEFAULT_INSTRUCTION
                    }
                    onClick={() => {
                      toast.info(
                        canSwitchAway
                          ? 'Выберите другое готовое подключение и нажмите «Сделать основным»'
                          : SWITCH_DEFAULT_INSTRUCTION
                      );
                    }}
                    style={secondaryBtn}
                  >
                    Сначала выберите другое основное подключение
                  </button>
                )}
                {canShowVerifyButton(c) && (
                  <button
                    type="button"
                    data-testid={`connection-verify-${c.id}`}
                    disabled={busy}
                    onClick={() => onVerify(c)}
                    style={secondaryBtn}
                  >
                    Проверить
                  </button>
                )}
                {canShowSetDefaultButton(c) && (
                  <button
                    type="button"
                    data-testid={`connection-set-default-${c.id}`}
                    disabled={busy || !defaultGate.ok}
                    title={!defaultGate.ok ? defaultGate.reason : undefined}
                    onClick={() => setConfirmDefault(c)}
                    style={accentBtn}
                  >
                    Сделать основным
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <LegacyEnvBlock items={legacy} error={legacyError} />

      <AddConnectionModal
        open={addOpen}
        definitions={definitions}
        busy={modalBusy}
        onBusy={setModalBusy}
        onClose={() => {
          setAddOpen(false);
          void load({ silent: true });
        }}
        onCreated={() => {
          void load({ silent: true });
        }}
        onIncomplete={() => {
          void load({ silent: true });
        }}
      />

      <ConfirmDefaultModal
        connection={confirmDefault}
        busy={busyId === confirmDefault?.id}
        onCancel={() => setConfirmDefault(null)}
        onConfirm={onConfirmDefault}
      />

      {renameTarget && (
        <SimpleDialog
          title="Переименовать подключение"
          testId="rename-connection-modal"
          onClose={() => setRenameTarget(null)}
        >
          <label style={fieldLabel}>
            Название
            <input
              data-testid="rename-connection-input"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              style={fieldControl}
            />
          </label>
          <div style={footerRow}>
            <button type="button" onClick={() => setRenameTarget(null)} style={secondaryBtn}>
              Отмена
            </button>
            <button
              type="button"
              data-testid="rename-connection-submit"
              disabled={busyId === renameTarget.id}
              onClick={submitRename}
              style={accentBtn}
            >
              Сохранить
            </button>
          </div>
        </SimpleDialog>
      )}

      {deleteTarget && (
        <SimpleDialog
          title="Удалить подключение?"
          testId="delete-connection-modal"
          onClose={() => setDeleteTarget(null)}
        >
          <p style={{ margin: 0, color: FINANCE_COLORS.text, lineHeight: 1.5 }}>
            Удалить «{deleteTarget.connection_name}»? Ключи будут уничтожены. Это действие нельзя
            отменить.
          </p>
          <div style={footerRow}>
            <button type="button" onClick={() => setDeleteTarget(null)} style={secondaryBtn}>
              Отмена
            </button>
            <button
              type="button"
              data-testid="delete-connection-confirm"
              disabled={busyId === deleteTarget.id}
              onClick={confirmDelete}
              style={{ ...accentBtn, background: FINANCE_COLORS.danger, color: '#fff' }}
            >
              Удалить
            </button>
          </div>
        </SimpleDialog>
      )}

      {replaceTarget && (
        <SimpleDialog
          title="Заменить ключи"
          testId="replace-keys-modal"
          onClose={() => {
            setReplaceTarget(null);
            setReplaceCreds({});
          }}
        >
          <p style={{ margin: '0 0 10px 0', color: FINANCE_COLORS.textSecondary, fontSize: 13 }}>
            Новые ключи заменят сохранённые. После замены выполните проверку подключения.
          </p>
          {(definitionByCode(replaceTarget.provider_code)?.credential_schema || [])
            .filter(f => (f.allowed_modes || ['test', 'production']).includes(replaceTarget.mode))
            .map(field => (
              <label key={field.name} style={fieldLabel}>
                {field.label_ru}
                <input
                  data-testid={`replace-field-${field.name}`}
                  type={field.secret ? 'password' : 'text'}
                  autoComplete="off"
                  value={replaceCreds[field.name] || ''}
                  placeholder={
                    field.placeholder ||
                    (field.name === 'shop_id' ? SHOP_ID_PLACEHOLDER : undefined)
                  }
                  onChange={e =>
                    setReplaceCreds(prev => ({ ...prev, [field.name]: e.target.value }))
                  }
                  style={fieldControl}
                />
                {replaceErrors[field.name] && (
                  <span style={{ color: FINANCE_COLORS.danger, fontSize: 12 }}>
                    {replaceErrors[field.name]}
                  </span>
                )}
              </label>
            ))}
          <div style={footerRow}>
            <button
              type="button"
              onClick={() => {
                setReplaceTarget(null);
                setReplaceCreds({});
              }}
              style={secondaryBtn}
            >
              Отмена
            </button>
            <button
              type="button"
              data-testid="replace-keys-submit"
              disabled={busyId === replaceTarget.id}
              onClick={submitReplace}
              style={accentBtn}
            >
              Сохранить ключи
            </button>
          </div>
        </SimpleDialog>
      )}
    </div>
  );
}

function SimpleDialog({
  title,
  testId,
  onClose,
  children,
}: {
  title: string;
  testId: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid={testId}
      onClick={onClose}
      style={overlayStyle}
    >
      <div onClick={e => e.stopPropagation()} style={modalStyle}>
        <h3 style={{ margin: '0 0 12px 0', color: FINANCE_COLORS.accent, fontSize: 18 }}>
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

function LegacyEnvBlock({ items, error }: { items: PaymentProviderAdmin[]; error: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <section
      data-testid="legacy-env-settings"
      aria-label="Старая конфигурация"
      style={{
        marginTop: 8,
        padding: 16,
        borderRadius: 12,
        border: `1px dashed ${FINANCE_COLORS.badgeMutedBorder}`,
        background: FINANCE_COLORS.panelBgElevated,
      }}
    >
      <button
        type="button"
        data-testid="legacy-env-toggle"
        onClick={() => setOpen(v => !v)}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: FINANCE_COLORS.textSecondary,
          fontSize: 15,
          fontWeight: 700,
          textAlign: 'left',
        }}
      >
        {open ? '▾' : '▸'} Старая конфигурация
      </button>
      {open && (
        <>
          <p
            style={{
              margin: '10px 0 12px 0',
              fontSize: 13,
              color: FINANCE_COLORS.textSecondary,
              lineHeight: 1.45,
            }}
          >
            Ранее использовавшиеся настройки из окружения сервера. Для новых подключений используйте
            «Подключить платёжную систему».
          </p>
          {error && <StatusBanner tone="muted">{error}</StatusBanner>}
          {!error && items.length === 0 && (
            <p style={{ margin: 0, color: FINANCE_COLORS.textSecondary, fontSize: 13 }}>
              Старых записей нет.
            </p>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {items.map(p => (
              <div
                key={p.code}
                data-testid={`legacy-row-${p.code}`}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  alignItems: 'center',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: FINANCE_COLORS.fieldBg,
                  border: `1px solid ${FINANCE_COLORS.badgeMutedBorder}`,
                  fontSize: 13,
                  color: FINANCE_COLORS.textSecondary,
                }}
              >
                <strong style={{ color: FINANCE_COLORS.text }}>{p.display_name}</strong>
                <code>{p.code}</code>
                <span>настроено: {p.configured ? 'да' : 'нет'}</span>
                <span>статус: {readinessLabel(p.readiness_status)}</span>
                <span>
                  флаг включения: {p.enabled ? 'да' : 'нет'}
                  {!p.configured && p.enabled ? ' (не считать рабочим подключением)' : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function StatusBanner({
  tone,
  children,
  ...rest
}: {
  tone: 'ok' | 'warn' | 'danger' | 'muted';
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const map = {
    ok: {
      bg: FINANCE_COLORS.panelBgElevated,
      border: 'rgba(16, 185, 129, 0.45)',
      color: '#6ee7b7',
    },
    warn: {
      bg: FINANCE_COLORS.panelBgElevated,
      border: FINANCE_COLORS.accentBorder,
      color: FINANCE_COLORS.accent,
    },
    danger: {
      bg: FINANCE_COLORS.panelBgElevated,
      border: 'rgba(255, 59, 48, 0.5)',
      color: FINANCE_COLORS.danger,
    },
    muted: {
      bg: FINANCE_COLORS.panelBg,
      border: FINANCE_COLORS.accentBorder,
      color: FINANCE_COLORS.textSecondary,
    },
  }[tone];
  return (
    <div
      {...rest}
      style={{
        marginBottom: 16,
        padding: '12px 14px',
        borderRadius: 10,
        background: map.bg,
        border: `1px solid ${map.border}`,
        color: map.color,
        fontSize: 14,
        lineHeight: 1.45,
        ...rest.style,
      }}
    >
      {children}
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 8px',
        borderRadius: 8,
        background: FINANCE_COLORS.fieldBg,
        border: `1px solid ${color}`,
        color,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.2,
      }}
    >
      {children}
    </span>
  );
}

const panelShell: React.CSSProperties = {
  border: `1px solid ${FINANCE_COLORS.accentBorder}`,
  borderRadius: 12,
  background: FINANCE_COLORS.panelBg,
  padding: 18,
};

const metaGrid: React.CSSProperties = {
  margin: 0,
  display: 'grid',
  gridTemplateColumns: '140px 1fr',
  gap: '6px 10px',
  fontSize: 13,
  color: FINANCE_COLORS.text,
};

const secondaryBtn: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${FINANCE_COLORS.badgeMutedBorder}`,
  background: FINANCE_COLORS.fieldBg,
  color: FINANCE_COLORS.text,
  cursor: 'pointer',
  fontWeight: 600,
  minHeight: 44,
};

const accentBtn: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: 'none',
  background: FINANCE_COLORS.accent,
  color: FINANCE_COLORS.dark,
  cursor: 'pointer',
  fontWeight: 700,
  minHeight: 44,
};

const linkBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  color: FINANCE_COLORS.accent,
  cursor: 'pointer',
  fontWeight: 600,
};

const actionsMenu: React.CSSProperties = {
  position: 'absolute',
  right: 0,
  top: '100%',
  marginTop: 4,
  zIndex: 20,
  minWidth: 180,
  background: FINANCE_COLORS.panelBgElevated,
  border: `1px solid ${FINANCE_COLORS.accentBorder}`,
  borderRadius: 8,
  padding: 6,
  display: 'grid',
  gap: 2,
  boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
};

const menuItemBtn: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  color: FINANCE_COLORS.text,
  cursor: 'pointer',
  fontWeight: 600,
  fontSize: 13,
};

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
  maxWidth: 480,
  background: FINANCE_COLORS.panelBgElevated,
  border: `1px solid ${FINANCE_COLORS.accentBorder}`,
  borderRadius: 12,
  padding: 24,
  color: FINANCE_COLORS.text,
};

const fieldLabel: React.CSSProperties = {
  display: 'grid',
  gap: 4,
  fontSize: 12,
  color: FINANCE_COLORS.textSecondary,
  marginBottom: 10,
};

const fieldControl: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${FINANCE_COLORS.accentBorder}`,
  background: FINANCE_COLORS.fieldBg,
  color: FINANCE_COLORS.text,
  minHeight: 44,
};

const footerRow: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
  marginTop: 8,
};
