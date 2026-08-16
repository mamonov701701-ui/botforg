import React, { useMemo, useRef, useState } from 'react';
import { ApiError } from '../../../api/client';
import {
  createAdminAddon,
  safeAdminAddonUpdateErrorMessage,
  type AdminAddon,
  type AdminAddonCreatePayload,
} from '../../../api/addonsAdmin';
import { FINANCE_COLORS } from './financeHelpers';
import {
  ADDON_AI_CREDITS_HELP,
  ADDON_CODE_HELP,
  ADDON_SORT_ORDER_HELP,
  ADDON_SORT_ORDER_LABEL,
  ADDON_TYPE_HELP,
  ADDON_TYPE_OPTIONS,
  ADDON_CAPACITY_DURATION_HELP,
  ADDON_AI_DURATION_HELP,
  addonDurationUiKind,
  nextAddonDefaultSortOrder,
  slugifyAddonCode,
} from './addonsAdminDisplay';
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
  name_ru: string;
  description_ru: string;
  type: string;
  amount: string;
  price: string;
  currency: string;
  duration_type: string;
  validity_days: string;
  available_from_plan: string;
  max_per_period: string;
  is_public: boolean;
  sort_order: string;
};

function buildInitial(existing: AdminAddon[]): FormState {
  return {
    code: '',
    name_ru: '',
    description_ru: '',
    type: 'messages',
    amount: '1000',
    price: '199.00',
    currency: 'RUB',
    duration_type: 'current_period',
    validity_days: '30',
    available_from_plan: '',
    max_per_period: '',
    is_public: true,
    sort_order: String(nextAddonDefaultSortOrder(existing)),
  };
}

export default function AddonsAdminCreateModal({
  existingAddons,
  onClose,
  onCreated,
}: {
  existingAddons: AdminAddon[];
  onClose: () => void;
  onCreated: (pkg: AdminAddon) => void;
}) {
  const [form, setForm] = useState<FormState>(() => buildInitial(existingAddons));
  const [codeManual, setCodeManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const onNameRuChange = (value: string) => {
    setForm(prev => {
      const next = { ...prev, name_ru: value };
      if (!codeManual) next.code = slugifyAddonCode(value);
      return next;
    });
  };

  const buildPayload = (): AdminAddonCreatePayload => {
    const code = form.code.trim().toLowerCase();
    if (!/^[a-z0-9_]+$/.test(code) || code.length > 64) {
      throw new Error('Код пакета: только a-z, 0-9 и _ (до 64 символов)');
    }
    if (!form.name_ru.trim()) throw new Error('Укажите название.');
    const amount = Number(form.amount);
    if (!Number.isInteger(amount) || amount < 1)
      throw new Error('Количество должно быть целым числом ≥ 1.');
    const priceN = Number(form.price.replace(',', '.'));
    if (!Number.isFinite(priceN) || priceN < 0) throw new Error('Цена должна быть числом ≥ 0.');
    const durationKind = addonDurationUiKind(form.type);
    let validity = 30;
    let duration_type = 'current_period';
    if (durationKind === 'messages') {
      validity = Number(form.validity_days);
      if (!Number.isInteger(validity) || validity < 1)
        throw new Error('Срок действия: целое число дней ≥ 1.');
      duration_type = 'current_period';
    } else if (durationKind === 'capacity') {
      duration_type = 'current_billing_period';
    } else if (durationKind === 'ai_credits') {
      duration_type = 'unspecified';
    }
    const sort_order = Number(form.sort_order);
    if (!Number.isInteger(sort_order))
      throw new Error('Позиция в каталоге должна быть целым числом.');
    const plans = form.available_from_plan
      .split(/[,;\s]+/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    let max_per_period: number | null = null;
    if (form.max_per_period.trim() !== '') {
      const n = Number(form.max_per_period);
      if (!Number.isInteger(n) || n < 1)
        throw new Error('Лимит покупок за период: целое число ≥ 1 или пусто.');
      max_per_period = n;
    }
    return {
      code,
      name_ru: form.name_ru.trim(),
      description_ru: form.description_ru.trim() || null,
      type: form.type,
      amount,
      price: priceN.toFixed(2),
      currency: form.currency.trim().toUpperCase() || 'RUB',
      duration_type,
      validity_days: validity,
      available_from_plan: plans.length ? plans : null,
      max_per_period,
      is_public: form.is_public,
      sort_order,
    };
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    setError(null);
    let payload: AdminAddonCreatePayload;
    try {
      payload = buildPayload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Проверьте поля формы.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const created = await createAdminAddon(payload);
      onCreated(created);
    } catch (err) {
      setError(safeAdminAddonUpdateErrorMessage(err instanceof ApiError ? err : err));
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
          data-testid="addons-admin-create-cancel"
          onClick={onClose}
          style={tariffsBtnSecondary}
        >
          Отмена
        </button>
        <button
          type="submit"
          form="addons-admin-create-form"
          data-testid="addons-admin-create-save"
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
      testId="addons-admin-create-modal"
      title="Создать пакет"
      onClose={onClose}
      footer={footer}
    >
      <form
        id="addons-admin-create-form"
        onSubmit={e => void onSubmit(e)}
        data-testid="addons-admin-create-form"
      >
        {error ? (
          <p
            data-testid="addons-admin-create-error"
            style={{ color: FINANCE_COLORS.danger, fontSize: 13 }}
          >
            {error}
          </p>
        ) : null}

        <div style={tariffsFormSectionStyle} data-testid="addons-admin-create-section-main">
          <div style={tariffsSectionTitle}>Основное</div>
          <div style={tariffsFormGridStyle}>
            <div>
              <label style={tariffsLabelStyle}>Название</label>
              <input
                data-testid="addons-admin-create-name-ru"
                value={form.name_ru}
                onChange={e => onNameRuChange(e.target.value)}
                style={tariffsFieldStyle}
                required
              />
            </div>
            <div>
              <label style={tariffsLabelStyle}>Тип ресурса</label>
              <select
                data-testid="addons-admin-create-type"
                value={form.type}
                onChange={e => set('type', e.target.value)}
                style={tariffsFieldStyle}
              >
                {ADDON_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p style={tariffsHelpStyle}>{ADDON_TYPE_HELP}</p>
            </div>
          </div>
          <label style={tariffsLabelStyle}>Описание</label>
          <textarea
            data-testid="addons-admin-create-description"
            value={form.description_ru}
            onChange={e => set('description_ru', e.target.value)}
            rows={2}
            style={{ ...tariffsFieldStyle, resize: 'vertical' }}
          />
          <div style={{ marginTop: 10 }}>
            <label style={tariffsLabelStyle}>Код</label>
            <input
              data-testid="addons-admin-create-code"
              value={form.code}
              onChange={e => {
                setCodeManual(true);
                set('code', e.target.value);
              }}
              style={tariffsFieldStyle}
              required
              autoComplete="off"
            />
            <p style={tariffsHelpStyle}>{ADDON_CODE_HELP}</p>
          </div>
        </div>

        <div style={tariffsFormSectionStyle}>
          <div style={tariffsSectionTitle}>Количество, цена и срок</div>
          <div style={tariffsFormGridStyle}>
            <div>
              <label style={tariffsLabelStyle}>Количество</label>
              <input
                data-testid="addons-admin-create-amount"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                style={tariffsFieldStyle}
                inputMode="numeric"
              />
            </div>
            <div>
              <label style={tariffsLabelStyle}>Цена</label>
              <input
                data-testid="addons-admin-create-price"
                value={form.price}
                onChange={e => set('price', e.target.value)}
                style={tariffsFieldStyle}
                inputMode="decimal"
              />
            </div>
            <div>
              <label style={tariffsLabelStyle}>Валюта</label>
              <input
                data-testid="addons-admin-create-currency"
                value={form.currency}
                onChange={e => set('currency', e.target.value)}
                style={tariffsFieldStyle}
              />
            </div>
            {addonDurationUiKind(form.type) === 'messages' ? (
              <div>
                <label style={tariffsLabelStyle}>Срок действия, дней</label>
                <input
                  data-testid="addons-admin-create-validity-days"
                  value={form.validity_days}
                  onChange={e => set('validity_days', e.target.value)}
                  style={tariffsFieldStyle}
                  inputMode="numeric"
                />
              </div>
            ) : addonDurationUiKind(form.type) === 'capacity' ? (
              <div data-testid="addons-admin-create-period-hint">
                <label style={tariffsLabelStyle}>Срок действия</label>
                <p style={tariffsHelpStyle}>{ADDON_CAPACITY_DURATION_HELP}</p>
              </div>
            ) : (
              <div data-testid="addons-admin-create-ai-duration-hint">
                <label style={tariffsLabelStyle}>Срок действия</label>
                <p style={tariffsHelpStyle}>{ADDON_AI_DURATION_HELP}</p>
              </div>
            )}
            <div>
              <label style={tariffsLabelStyle}>{ADDON_SORT_ORDER_LABEL}</label>
              <input
                data-testid="addons-admin-create-sort-order"
                value={form.sort_order}
                onChange={e => set('sort_order', e.target.value)}
                style={tariffsFieldStyle}
                inputMode="numeric"
              />
              <p style={tariffsHelpStyle}>{ADDON_SORT_ORDER_HELP}</p>
            </div>
          </div>
          {form.type === 'ai_credits' ? (
            <p data-testid="addons-admin-create-ai-hint" style={tariffsHelpStyle}>
              {ADDON_AI_CREDITS_HELP}
            </p>
          ) : null}
        </div>

        <div style={tariffsFormSectionStyle}>
          <div style={tariffsSectionTitle}>Каталог</div>
          <TariffsCheckbox
            label="Публичный пакет"
            checked={form.is_public}
            onChange={v => set('is_public', v)}
            testId="addons-admin-create-is-public"
            hint="Скрытый пакет не показывается в публичном каталоге."
          />
          <label style={tariffsLabelStyle}>Доступен с тарифов (коды через запятую)</label>
          <input
            data-testid="addons-admin-create-available-from"
            value={form.available_from_plan}
            onChange={e => set('available_from_plan', e.target.value)}
            style={tariffsFieldStyle}
            placeholder="start, business"
          />
          <label style={{ ...tariffsLabelStyle, marginTop: 8 }}>Лимит покупок за период</label>
          <input
            data-testid="addons-admin-create-max-per-period"
            value={form.max_per_period}
            onChange={e => set('max_per_period', e.target.value)}
            style={tariffsFieldStyle}
            placeholder="без ограничения"
          />
        </div>
      </form>
    </TariffsAdminFormModalShell>
  );
}
