import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../../../api/client';
import {
  safeAdminPlanUpdateErrorMessage,
  updateAdminPlan,
  type AdminPlan,
  type AdminPlanUpdatePayload,
} from '../../../api/tariffsAdmin';
import { FINANCE_COLORS } from './financeHelpers';
import {
  formatSubscriptionCount,
  LIVE_LIMITS_CONFIRM,
  LIVE_LIMITS_WARNING,
  PLAN_CODE_HELP,
  PLAN_RECOMMENDED_HELP,
  PLAN_SORT_ORDER_HELP,
  PLAN_SORT_ORDER_LABEL,
  PRICE_NEW_PURCHASES_NOTE,
} from './tariffsAdminDisplay';
import {
  TariffsAdminFormModalShell,
  TariffsCheckbox,
  tariffsBtnPrimaryLayout,
  tariffsBtnSecondary,
  tariffsFieldStyle,
  tariffsFormGridStyle,
  tariffsFormSectionStyle,
  tariffsHelpStyle,
  tariffsLabelStyle,
  tariffsSectionTitle,
} from './tariffsAdminFormLayout';

type FormState = {
  name: string;
  name_ru: string;
  description_ru: string;
  price_month: string;
  price_on_request: boolean;
  currency: string;
  is_recommended: boolean;
  sort_order: string;
  monthly_messages: string;
  active_bots: string;
  team_members: string;
  analytics_history_days: string;
  addon_purchase: boolean;
  export_reports: boolean;
  priority_support: boolean;
  marketplace_access: boolean;
  template_publish: boolean;
  scenario_publish: boolean;
};

function limitToInput(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

function parseOptionalNonNegInt(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error('invalid_int');
  }
  return n;
}

function planToForm(plan: AdminPlan): FormState {
  return {
    name: plan.name || '',
    name_ru: plan.name_ru || '',
    description_ru: plan.description_ru || '',
    price_month: plan.price_month ?? '',
    price_on_request: plan.price_month == null,
    currency: plan.currency || 'RUB',
    is_recommended: plan.is_recommended,
    sort_order: String(plan.sort_order ?? 0),
    monthly_messages: limitToInput(plan.limits.monthly_messages),
    active_bots: limitToInput(plan.limits.active_bots),
    team_members: limitToInput(plan.limits.team_members),
    analytics_history_days: limitToInput(plan.limits.analytics_history_days),
    addon_purchase: plan.limits.addon_purchase,
    export_reports: plan.limits.export_reports,
    priority_support: plan.limits.priority_support,
    marketplace_access: plan.limits.marketplace_access,
    template_publish: plan.limits.template_publish,
    scenario_publish: plan.limits.scenario_publish,
  };
}

export default function TariffsAdminEditModal({
  plan,
  onClose,
  onSaved,
}: {
  plan: AdminPlan;
  onClose: () => void;
  onSaved: (updated: AdminPlan) => void;
}) {
  const [form, setForm] = useState<FormState>(() => planToForm(plan));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmLimits, setConfirmLimits] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    setForm(planToForm(plan));
    setError(null);
    setConfirmLimits(false);
  }, [plan]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const dirty = useMemo(() => {
    const initial = planToForm(plan);
    return (Object.keys(initial) as (keyof FormState)[]).some(k => form[k] !== initial[k]);
  }, [form, plan]);

  const limitsDirty = useMemo(() => {
    const initial = planToForm(plan);
    const keys: (keyof FormState)[] = [
      'monthly_messages',
      'active_bots',
      'team_members',
      'analytics_history_days',
      'addon_purchase',
      'export_reports',
      'priority_support',
      'marketplace_access',
      'template_publish',
      'scenario_publish',
    ];
    return keys.some(k => form[k] !== initial[k]);
  }, [form, plan]);

  const priceDirty = useMemo(() => {
    const initial = planToForm(plan);
    return (
      form.price_on_request !== initial.price_on_request ||
      (!form.price_on_request && form.price_month !== initial.price_month) ||
      form.currency !== initial.currency
    );
  }, [form, plan]);

  const buildPayload = (): AdminPlanUpdatePayload => {
    const payload: AdminPlanUpdatePayload = {};
    const initial = planToForm(plan);

    if (form.name !== initial.name) payload.name = form.name.trim();
    if (form.name_ru !== initial.name_ru) {
      payload.name_ru = form.name_ru.trim() || null;
    }
    if (form.description_ru !== initial.description_ru) {
      payload.description_ru = form.description_ru.trim() || null;
    }
    if (priceDirty) {
      if (form.price_on_request) {
        payload.price_month = null;
      } else {
        const t = form.price_month.trim();
        if (t === '') throw new Error('Укажите цену или выберите «По запросу».');
        const n = Number(t.replace(',', '.'));
        if (!Number.isFinite(n) || n < 0) throw new Error('Цена должна быть числом ≥ 0.');
        payload.price_month = n.toFixed(2);
      }
      if (form.currency.trim()) {
        payload.currency = form.currency.trim().toUpperCase();
      }
    }
    if (form.is_recommended !== initial.is_recommended) {
      payload.is_recommended = form.is_recommended;
    }
    if (form.sort_order !== initial.sort_order) {
      const so = Number(form.sort_order);
      if (!Number.isInteger(so)) throw new Error('Позиция в каталоге должна быть целым числом.');
      payload.sort_order = so;
    }

    if (limitsDirty) {
      const limits: AdminPlanUpdatePayload['limits'] = {};
      try {
        if (form.monthly_messages !== initial.monthly_messages) {
          limits.monthly_messages = parseOptionalNonNegInt(form.monthly_messages);
        }
        if (form.active_bots !== initial.active_bots) {
          limits.active_bots = parseOptionalNonNegInt(form.active_bots);
        }
        if (form.team_members !== initial.team_members) {
          limits.team_members = parseOptionalNonNegInt(form.team_members);
        }
        if (form.analytics_history_days !== initial.analytics_history_days) {
          limits.analytics_history_days = parseOptionalNonNegInt(form.analytics_history_days);
        }
      } catch {
        throw new Error('Лимиты должны быть целыми числами ≥ 0 (пусто = без ограничения).');
      }
      if (form.addon_purchase !== initial.addon_purchase) {
        limits.addon_purchase = form.addon_purchase;
      }
      if (form.export_reports !== initial.export_reports) {
        limits.export_reports = form.export_reports;
      }
      if (form.priority_support !== initial.priority_support) {
        limits.priority_support = form.priority_support;
      }
      if (form.marketplace_access !== initial.marketplace_access) {
        limits.marketplace_access = form.marketplace_access;
      }
      if (form.template_publish !== initial.template_publish) {
        limits.template_publish = form.template_publish;
      }
      if (form.scenario_publish !== initial.scenario_publish) {
        limits.scenario_publish = form.scenario_publish;
      }
      payload.limits = limits;
    }

    return payload;
  };

  const doSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload();
      if (Object.keys(payload).length === 0) {
        onClose();
        return;
      }
      const updated = await updateAdminPlan(plan.id, payload);
      onSaved(updated);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(safeAdminPlanUpdateErrorMessage(err));
      } else if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError(safeAdminPlanUpdateErrorMessage(err));
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
      setConfirmLimits(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    if (!dirty) {
      onClose();
      return;
    }
    if (limitsDirty && !confirmLimits) {
      setConfirmLimits(true);
      return;
    }
    void doSave();
  };

  const footer = confirmLimits ? (
    <>
      <button
        type="button"
        data-testid="tariffs-admin-limits-confirm-cancel"
        disabled={saving}
        onClick={() => setConfirmLimits(false)}
        style={tariffsBtnSecondary}
      >
        Отмена
      </button>
      <button
        type="button"
        data-testid="tariffs-admin-limits-confirm-save"
        className="bf-primary-cta"
        disabled={saving}
        onClick={() => void doSave()}
        style={tariffsBtnPrimaryLayout}
      >
        {saving ? 'Сохранение…' : 'Сохранить изменения'}
      </button>
    </>
  ) : (
    <>
      <button
        type="button"
        data-testid="tariffs-admin-edit-cancel"
        onClick={onClose}
        style={tariffsBtnSecondary}
      >
        Отмена
      </button>
      <button
        type="submit"
        form="tariffs-admin-edit-form"
        data-testid="tariffs-admin-edit-save"
        className="bf-primary-cta"
        disabled={saving}
        style={tariffsBtnPrimaryLayout}
      >
        {saving ? 'Сохранение…' : 'Сохранить'}
      </button>
    </>
  );

  return (
    <TariffsAdminFormModalShell
      testId="tariffs-admin-edit-modal"
      title="Изменить тариф"
      onClose={onClose}
      footer={footer}
    >
      {confirmLimits ? (
        <div data-testid="tariffs-admin-limits-confirm">
          <p style={{ fontSize: 14, lineHeight: 1.5 }}>{LIVE_LIMITS_CONFIRM}</p>
          <p style={{ fontSize: 13, color: FINANCE_COLORS.textSecondary }}>
            {formatSubscriptionCount(plan.subscription_count)}
          </p>
          <p style={{ fontSize: 13, color: FINANCE_COLORS.textSecondary }}>{LIVE_LIMITS_WARNING}</p>
        </div>
      ) : (
        <form
          id="tariffs-admin-edit-form"
          onSubmit={onSubmit}
          data-testid="tariffs-admin-edit-form"
        >
          <div style={tariffsFormSectionStyle} data-testid="tariffs-admin-edit-section-main">
            <div style={tariffsSectionTitle}>Основное</div>
            <label style={tariffsLabelStyle}>Код</label>
            <input
              data-testid="tariffs-admin-edit-code"
              value={plan.code}
              readOnly
              disabled
              style={{ ...tariffsFieldStyle, opacity: 0.7, maxWidth: 280 }}
            />
            <p style={tariffsHelpStyle}>{PLAN_CODE_HELP}</p>
            <div style={{ ...tariffsFormGridStyle, marginTop: 10 }}>
              <div>
                <label style={tariffsLabelStyle}>Название</label>
                <input
                  data-testid="tariffs-admin-edit-name"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  style={tariffsFieldStyle}
                  required
                />
              </div>
              <div>
                <label style={tariffsLabelStyle}>Русское название</label>
                <input
                  data-testid="tariffs-admin-edit-name-ru"
                  value={form.name_ru}
                  onChange={e => set('name_ru', e.target.value)}
                  style={tariffsFieldStyle}
                />
              </div>
            </div>
            <label style={tariffsLabelStyle}>Описание</label>
            <textarea
              data-testid="tariffs-admin-edit-description"
              value={form.description_ru}
              onChange={e => set('description_ru', e.target.value)}
              rows={2}
              style={{ ...tariffsFieldStyle, resize: 'vertical' }}
            />
          </div>

          <div style={tariffsFormSectionStyle} data-testid="tariffs-admin-edit-section-price">
            <div style={tariffsSectionTitle}>Цена</div>
            <TariffsCheckbox
              label="По запросу (без фиксированной цены)"
              checked={form.price_on_request}
              onChange={v => set('price_on_request', v)}
              testId="tariffs-admin-edit-price-on-request"
            />
            <div style={tariffsFormGridStyle}>
              {!form.price_on_request && (
                <div>
                  <label style={tariffsLabelStyle}>Цена в месяц</label>
                  <input
                    data-testid="tariffs-admin-edit-price"
                    value={form.price_month}
                    onChange={e => set('price_month', e.target.value)}
                    style={tariffsFieldStyle}
                    inputMode="decimal"
                  />
                </div>
              )}
              <div>
                <label style={tariffsLabelStyle}>Валюта</label>
                <input
                  data-testid="tariffs-admin-edit-currency"
                  value={form.currency}
                  onChange={e => set('currency', e.target.value)}
                  style={tariffsFieldStyle}
                />
              </div>
            </div>
            {priceDirty && (
              <p
                data-testid="tariffs-admin-price-note"
                style={{
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 8,
                  background: FINANCE_COLORS.accentSoftBg,
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                {PRICE_NEW_PURCHASES_NOTE}
              </p>
            )}
          </div>

          <div style={tariffsFormSectionStyle} data-testid="tariffs-admin-edit-section-limits">
            <div style={tariffsSectionTitle}>Лимиты</div>
            <div style={tariffsFormGridStyle}>
              <div>
                <label style={tariffsLabelStyle}>Сообщений в месяц</label>
                <input
                  data-testid="tariffs-admin-edit-monthly-messages"
                  value={form.monthly_messages}
                  onChange={e => set('monthly_messages', e.target.value)}
                  style={tariffsFieldStyle}
                  placeholder="пусто = без ограничения"
                />
              </div>
              <div>
                <label style={tariffsLabelStyle}>Активных ботов</label>
                <input
                  data-testid="tariffs-admin-edit-active-bots"
                  value={form.active_bots}
                  onChange={e => set('active_bots', e.target.value)}
                  style={tariffsFieldStyle}
                />
              </div>
              <div>
                <label style={tariffsLabelStyle}>Участников команды</label>
                <input
                  data-testid="tariffs-admin-edit-team-members"
                  value={form.team_members}
                  onChange={e => set('team_members', e.target.value)}
                  style={tariffsFieldStyle}
                />
              </div>
              <div>
                <label style={tariffsLabelStyle}>История аналитики, дней</label>
                <input
                  data-testid="tariffs-admin-edit-analytics-days"
                  value={form.analytics_history_days}
                  onChange={e => set('analytics_history_days', e.target.value)}
                  style={tariffsFieldStyle}
                />
              </div>
            </div>
          </div>

          <div style={tariffsFormSectionStyle} data-testid="tariffs-admin-edit-section-caps">
            <div style={tariffsSectionTitle}>Возможности</div>
            <div style={tariffsFormGridStyle}>
              <TariffsCheckbox
                label="Покупка доп. пакетов"
                checked={form.addon_purchase}
                onChange={v => set('addon_purchase', v)}
                testId="tariffs-admin-edit-addon-purchase"
              />
              <TariffsCheckbox
                label="Экспорт отчётов"
                checked={form.export_reports}
                onChange={v => set('export_reports', v)}
                testId="tariffs-admin-edit-export-reports"
              />
              <TariffsCheckbox
                label="Приоритетная поддержка"
                checked={form.priority_support}
                onChange={v => set('priority_support', v)}
                testId="tariffs-admin-edit-priority-support"
              />
              <TariffsCheckbox
                label="Доступ к маркетплейсу"
                checked={form.marketplace_access}
                onChange={v => set('marketplace_access', v)}
                testId="tariffs-admin-edit-marketplace"
              />
              <TariffsCheckbox
                label="Публикация шаблонов"
                checked={form.template_publish}
                onChange={v => set('template_publish', v)}
                testId="tariffs-admin-edit-template-publish"
              />
              <TariffsCheckbox
                label="Публикация сценариев"
                checked={form.scenario_publish}
                onChange={v => set('scenario_publish', v)}
                testId="tariffs-admin-edit-scenario-publish"
              />
            </div>
            {limitsDirty && (
              <div
                data-testid="tariffs-admin-limits-warning"
                style={{
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 8,
                  border: `1px solid ${FINANCE_COLORS.danger}`,
                  color: FINANCE_COLORS.danger,
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                <div>{LIVE_LIMITS_WARNING}</div>
                <div style={{ marginTop: 4 }}>
                  {formatSubscriptionCount(plan.subscription_count)}
                </div>
              </div>
            )}
          </div>

          <div style={tariffsFormSectionStyle} data-testid="tariffs-admin-edit-section-display">
            <div style={tariffsSectionTitle}>Отображение в каталоге</div>
            <div style={tariffsFormGridStyle}>
              <div>
                <TariffsCheckbox
                  label="Публичный каталог"
                  checked={plan.is_public}
                  onChange={() => undefined}
                  testId="tariffs-admin-edit-is-public"
                  disabled
                  hint="Меняется кнопками «Скрыть» / «Опубликовать» в таблице."
                />
                <span
                  data-testid="tariffs-admin-edit-no-visibility"
                  style={{ display: 'none' }}
                  aria-hidden
                />
              </div>
              <TariffsCheckbox
                label="Рекомендуемый тариф"
                checked={form.is_recommended}
                onChange={v => set('is_recommended', v)}
                testId="tariffs-admin-edit-recommended"
                hint={PLAN_RECOMMENDED_HELP}
              />
            </div>
          </div>

          <div style={tariffsFormSectionStyle} data-testid="tariffs-admin-edit-section-extra">
            <div style={tariffsSectionTitle}>Дополнительные настройки</div>
            <label style={tariffsLabelStyle}>{PLAN_SORT_ORDER_LABEL}</label>
            <input
              data-testid="tariffs-admin-edit-sort-order"
              value={form.sort_order}
              onChange={e => set('sort_order', e.target.value)}
              style={{ ...tariffsFieldStyle, maxWidth: 220 }}
              inputMode="numeric"
            />
            <p data-testid="tariffs-admin-edit-sort-help" style={tariffsHelpStyle}>
              {PLAN_SORT_ORDER_HELP}
            </p>
          </div>

          {error && (
            <div
              data-testid="tariffs-admin-edit-error"
              style={{
                marginTop: 4,
                padding: 10,
                borderRadius: 8,
                border: `1px solid ${FINANCE_COLORS.danger}`,
                color: FINANCE_COLORS.danger,
                fontSize: 13,
              }}
            >
              {error}
            </div>
          )}
        </form>
      )}
    </TariffsAdminFormModalShell>
  );
}
