import React, { useMemo, useRef, useState } from 'react';
import { ApiError } from '../../../api/client';
import {
  createAdminPlan,
  safeAdminPlanUpdateErrorMessage,
  type AdminPlan,
  type AdminPlanCreatePayload,
} from '../../../api/tariffsAdmin';
import { FINANCE_COLORS } from './financeHelpers';
import {
  nextDefaultSortOrder,
  PLAN_CODE_HELP,
  PLAN_RECOMMENDED_HELP,
  PLAN_SORT_ORDER_HELP,
  PLAN_SORT_ORDER_LABEL,
  slugifyPlanCode,
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
  code: string;
  name: string;
  name_ru: string;
  description_ru: string;
  price_month: string;
  price_on_request: boolean;
  currency: string;
  is_public: boolean;
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

function parseOptionalNonNegInt(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    throw new Error('invalid_int');
  }
  return n;
}

function buildInitial(existingPlans: AdminPlan[]): FormState {
  return {
    code: '',
    name: '',
    name_ru: '',
    description_ru: '',
    price_month: '',
    price_on_request: false,
    currency: 'RUB',
    is_public: true,
    is_recommended: false,
    sort_order: String(nextDefaultSortOrder(existingPlans)),
    monthly_messages: '500',
    active_bots: '1',
    team_members: '0',
    analytics_history_days: '7',
    addon_purchase: false,
    export_reports: false,
    priority_support: false,
    marketplace_access: true,
    template_publish: true,
    scenario_publish: true,
  };
}

export default function TariffsAdminCreateModal({
  existingPlans,
  onClose,
  onCreated,
}: {
  existingPlans: AdminPlan[];
  onClose: () => void;
  onCreated: (plan: AdminPlan) => void;
}) {
  const [form, setForm] = useState<FormState>(() => buildInitial(existingPlans));
  const [codeManual, setCodeManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const onNameChange = (value: string) => {
    setForm(prev => {
      const next = { ...prev, name: value };
      if (!codeManual) {
        next.code = slugifyPlanCode(value || prev.name_ru);
      }
      return next;
    });
  };

  const onNameRuChange = (value: string) => {
    setForm(prev => {
      const next = { ...prev, name_ru: value };
      if (!codeManual) {
        // Prefer Russian title for slug when present.
        next.code = slugifyPlanCode(value || prev.name);
      }
      return next;
    });
  };

  const buildPayload = (): AdminPlanCreatePayload => {
    const code = form.code.trim().toLowerCase();
    if (!/^[a-z0-9_]+$/.test(code)) {
      throw new Error('Код тарифа: только a-z, 0-9 и _');
    }
    if (!form.name.trim() || !form.name_ru.trim()) {
      throw new Error('Укажите название и русское название.');
    }
    let price_month: string | null = null;
    if (!form.price_on_request) {
      const t = form.price_month.trim();
      if (t === '') throw new Error('Укажите цену или выберите «По запросу».');
      const n = Number(t.replace(',', '.'));
      if (!Number.isFinite(n) || n < 0) throw new Error('Цена должна быть числом ≥ 0.');
      price_month = n.toFixed(2);
    }
    const sort_order = Number(form.sort_order);
    if (!Number.isInteger(sort_order))
      throw new Error('Позиция в каталоге должна быть целым числом.');

    let limits: AdminPlanCreatePayload['limits'];
    try {
      limits = {
        monthly_messages: parseOptionalNonNegInt(form.monthly_messages),
        active_bots: parseOptionalNonNegInt(form.active_bots),
        team_members: parseOptionalNonNegInt(form.team_members),
        analytics_history_days: parseOptionalNonNegInt(form.analytics_history_days),
        addon_purchase: form.addon_purchase,
        export_reports: form.export_reports,
        priority_support: form.priority_support,
        marketplace_access: form.marketplace_access,
        template_publish: form.template_publish,
        scenario_publish: form.scenario_publish,
      };
    } catch {
      throw new Error('Лимиты должны быть целыми числами ≥ 0 (пусто = без ограничения).');
    }

    return {
      code,
      name: form.name.trim(),
      name_ru: form.name_ru.trim(),
      description_ru: form.description_ru.trim() || null,
      price_month,
      currency: form.currency.trim().toUpperCase() || 'RUB',
      is_public: form.is_public,
      is_recommended: form.is_recommended,
      sort_order,
      limits,
    };
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload();
      const created = await createAdminPlan(payload);
      onCreated(created);
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
    }
  };

  const footer = useMemo(
    () => (
      <>
        <button
          type="button"
          data-testid="tariffs-admin-create-cancel"
          onClick={onClose}
          style={tariffsBtnSecondary}
        >
          Отмена
        </button>
        <button
          type="submit"
          form="tariffs-admin-create-form"
          data-testid="tariffs-admin-create-save"
          className="bf-primary-cta"
          disabled={saving}
          style={tariffsBtnPrimaryLayout}
        >
          {saving ? 'Создание…' : 'Создать'}
        </button>
      </>
    ),
    [onClose, saving]
  );

  return (
    <TariffsAdminFormModalShell
      testId="tariffs-admin-create-modal"
      title="Создать тариф"
      onClose={onClose}
      footer={footer}
    >
      <form
        id="tariffs-admin-create-form"
        onSubmit={e => void onSubmit(e)}
        data-testid="tariffs-admin-create-form"
      >
        <div style={tariffsFormSectionStyle} data-testid="tariffs-admin-create-section-main">
          <div style={tariffsSectionTitle}>Основное</div>
          <div style={tariffsFormGridStyle}>
            <div>
              <label style={tariffsLabelStyle}>Название</label>
              <input
                data-testid="tariffs-admin-create-name"
                value={form.name}
                onChange={e => onNameChange(e.target.value)}
                style={tariffsFieldStyle}
                required
              />
            </div>
            <div>
              <label style={tariffsLabelStyle}>Русское название</label>
              <input
                data-testid="tariffs-admin-create-name-ru"
                value={form.name_ru}
                onChange={e => onNameRuChange(e.target.value)}
                style={tariffsFieldStyle}
                required
              />
            </div>
          </div>
          <label style={tariffsLabelStyle}>Описание</label>
          <textarea
            data-testid="tariffs-admin-create-description"
            value={form.description_ru}
            onChange={e => set('description_ru', e.target.value)}
            rows={2}
            style={{ ...tariffsFieldStyle, resize: 'vertical' }}
          />
          <div style={{ marginTop: 10 }}>
            <label style={tariffsLabelStyle}>Код</label>
            <input
              data-testid="tariffs-admin-create-code"
              value={form.code}
              onChange={e => {
                setCodeManual(true);
                set('code', e.target.value);
              }}
              style={tariffsFieldStyle}
              required
              autoComplete="off"
            />
            <p data-testid="tariffs-admin-create-code-help" style={tariffsHelpStyle}>
              {PLAN_CODE_HELP}
            </p>
          </div>
        </div>

        <div style={tariffsFormSectionStyle} data-testid="tariffs-admin-create-section-price">
          <div style={tariffsSectionTitle}>Цена</div>
          <TariffsCheckbox
            label="По запросу"
            checked={form.price_on_request}
            onChange={v => set('price_on_request', v)}
            testId="tariffs-admin-create-price-on-request"
          />
          <div style={tariffsFormGridStyle}>
            {!form.price_on_request && (
              <div>
                <label style={tariffsLabelStyle}>Цена в месяц</label>
                <input
                  data-testid="tariffs-admin-create-price"
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
                data-testid="tariffs-admin-create-currency"
                value={form.currency}
                onChange={e => set('currency', e.target.value)}
                style={tariffsFieldStyle}
              />
            </div>
          </div>
        </div>

        <div style={tariffsFormSectionStyle} data-testid="tariffs-admin-create-section-limits">
          <div style={tariffsSectionTitle}>Лимиты</div>
          <div style={tariffsFormGridStyle}>
            <div>
              <label style={tariffsLabelStyle}>Сообщений в месяц</label>
              <input
                data-testid="tariffs-admin-create-monthly-messages"
                value={form.monthly_messages}
                onChange={e => set('monthly_messages', e.target.value)}
                style={tariffsFieldStyle}
              />
            </div>
            <div>
              <label style={tariffsLabelStyle}>Активных ботов</label>
              <input
                data-testid="tariffs-admin-create-active-bots"
                value={form.active_bots}
                onChange={e => set('active_bots', e.target.value)}
                style={tariffsFieldStyle}
              />
            </div>
            <div>
              <label style={tariffsLabelStyle}>Участников команды</label>
              <input
                data-testid="tariffs-admin-create-team-members"
                value={form.team_members}
                onChange={e => set('team_members', e.target.value)}
                style={tariffsFieldStyle}
              />
            </div>
            <div>
              <label style={tariffsLabelStyle}>История аналитики, дней</label>
              <input
                data-testid="tariffs-admin-create-analytics-days"
                value={form.analytics_history_days}
                onChange={e => set('analytics_history_days', e.target.value)}
                style={tariffsFieldStyle}
              />
            </div>
          </div>
        </div>

        <div style={tariffsFormSectionStyle} data-testid="tariffs-admin-create-section-caps">
          <div style={tariffsSectionTitle}>Возможности</div>
          <div style={tariffsFormGridStyle}>
            <TariffsCheckbox
              label="Покупка доп. пакетов"
              checked={form.addon_purchase}
              onChange={v => set('addon_purchase', v)}
              testId="tariffs-admin-create-addon-purchase"
            />
            <TariffsCheckbox
              label="Экспорт отчётов"
              checked={form.export_reports}
              onChange={v => set('export_reports', v)}
              testId="tariffs-admin-create-export-reports"
            />
            <TariffsCheckbox
              label="Приоритетная поддержка"
              checked={form.priority_support}
              onChange={v => set('priority_support', v)}
              testId="tariffs-admin-create-priority-support"
            />
            <TariffsCheckbox
              label="Доступ к маркетплейсу"
              checked={form.marketplace_access}
              onChange={v => set('marketplace_access', v)}
              testId="tariffs-admin-create-marketplace"
            />
            <TariffsCheckbox
              label="Публикация шаблонов"
              checked={form.template_publish}
              onChange={v => set('template_publish', v)}
              testId="tariffs-admin-create-template-publish"
            />
            <TariffsCheckbox
              label="Публикация сценариев"
              checked={form.scenario_publish}
              onChange={v => set('scenario_publish', v)}
              testId="tariffs-admin-create-scenario-publish"
            />
          </div>
        </div>

        <div style={tariffsFormSectionStyle} data-testid="tariffs-admin-create-section-display">
          <div style={tariffsSectionTitle}>Отображение в каталоге</div>
          <div style={tariffsFormGridStyle}>
            <TariffsCheckbox
              label="Публичный каталог"
              checked={form.is_public}
              onChange={v => set('is_public', v)}
              testId="tariffs-admin-create-is-public"
            />
            <TariffsCheckbox
              label="Рекомендуемый тариф"
              checked={form.is_recommended}
              onChange={v => set('is_recommended', v)}
              testId="tariffs-admin-create-recommended"
              hint={PLAN_RECOMMENDED_HELP}
            />
          </div>
        </div>

        <div style={tariffsFormSectionStyle} data-testid="tariffs-admin-create-section-extra">
          <div style={tariffsSectionTitle}>Дополнительные настройки</div>
          <label style={tariffsLabelStyle}>{PLAN_SORT_ORDER_LABEL}</label>
          <input
            data-testid="tariffs-admin-create-sort-order"
            value={form.sort_order}
            onChange={e => set('sort_order', e.target.value)}
            style={{ ...tariffsFieldStyle, maxWidth: 220 }}
            inputMode="numeric"
          />
          <p data-testid="tariffs-admin-create-sort-help" style={tariffsHelpStyle}>
            {PLAN_SORT_ORDER_HELP}
          </p>
        </div>

        {error && (
          <div
            data-testid="tariffs-admin-create-error"
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
    </TariffsAdminFormModalShell>
  );
}
