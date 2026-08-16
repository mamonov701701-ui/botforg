import React, { useMemo, useRef, useState } from 'react';
import { ApiError } from '../../../api/client';
import {
  safeAdminAddonUpdateErrorMessage,
  updateAdminAddon,
  type AdminAddon,
  type AdminAddonUpdatePayload,
} from '../../../api/addonsAdmin';
import { FINANCE_COLORS } from './financeHelpers';
import {
  ADDON_AI_CREDITS_HELP,
  ADDON_AMOUNT_NOTE,
  ADDON_PRICE_NEW_PURCHASES_NOTE,
  ADDON_SORT_ORDER_HELP,
  ADDON_SORT_ORDER_LABEL,
  ADDON_TYPE_HELP,
  ADDON_TYPE_OPTIONS,
  ADDON_CAPACITY_DURATION_HELP,
  ADDON_AI_DURATION_HELP,
  addonDurationUiKind,
} from './addonsAdminDisplay';
import {
  TariffsAdminFormModalShell,
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
  sort_order: string;
};

function plansToInput(raw: unknown): string {
  if (raw == null) return '';
  if (Array.isArray(raw)) return raw.map(String).join(', ');
  return String(raw);
}

function fromPkg(pkg: AdminAddon): FormState {
  return {
    name_ru: pkg.name_ru || '',
    description_ru: pkg.description_ru || '',
    type: pkg.type || 'messages',
    amount: String(pkg.amount ?? ''),
    price: pkg.price || '',
    currency: pkg.currency || 'RUB',
    duration_type: pkg.duration_type || 'current_period',
    validity_days: String(pkg.validity_days || 30),
    available_from_plan: plansToInput(pkg.available_from_plan),
    max_per_period: pkg.max_per_period == null ? '' : String(pkg.max_per_period),
    sort_order: String(pkg.sort_order ?? 0),
  };
}

export default function AddonsAdminEditModal({
  addon,
  onClose,
  onSaved,
}: {
  addon: AdminAddon;
  onClose: () => void;
  onSaved: (pkg: AdminAddon) => void;
}) {
  const [form, setForm] = useState<FormState>(() => fromPkg(addon));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  const initial = useMemo(() => fromPkg(addon), [addon]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const buildPayload = (): AdminAddonUpdatePayload => {
    if (!form.name_ru.trim()) throw new Error('Укажите название.');
    const amount = Number(form.amount);
    if (!Number.isInteger(amount) || amount < 1)
      throw new Error('Количество должно быть целым числом ≥ 1.');
    const priceN = Number(form.price.replace(',', '.'));
    if (!Number.isFinite(priceN) || priceN < 0) throw new Error('Цена должна быть числом ≥ 0.');
    const durationKind = addonDurationUiKind(form.type);
    let validity = Number(form.validity_days);
    let duration_type = form.duration_type;
    if (durationKind === 'messages') {
      if (!Number.isInteger(validity) || validity < 1)
        throw new Error('Срок действия: целое число дней ≥ 1.');
      duration_type = 'current_period';
    } else if (durationKind === 'capacity') {
      duration_type = 'current_billing_period';
      validity = 30;
    } else if (durationKind === 'ai_credits') {
      duration_type = 'unspecified';
      validity = 30;
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
    const payload: AdminAddonUpdatePayload = {};
    if (form.name_ru !== initial.name_ru) payload.name_ru = form.name_ru.trim();
    if (form.description_ru !== initial.description_ru) {
      payload.description_ru = form.description_ru.trim() || null;
    }
    if (form.type !== initial.type) payload.type = form.type;
    if (form.amount !== initial.amount) payload.amount = amount;
    if (form.price !== initial.price) payload.price = priceN.toFixed(2);
    if (form.currency.trim().toUpperCase() !== initial.currency) {
      payload.currency = form.currency.trim().toUpperCase() || 'RUB';
    }
    if (duration_type !== initial.duration_type) payload.duration_type = duration_type;
    if (String(validity) !== initial.validity_days) payload.validity_days = validity;
    if (form.available_from_plan !== initial.available_from_plan) {
      payload.available_from_plan = plans.length ? plans : null;
    }
    if (form.max_per_period !== initial.max_per_period) payload.max_per_period = max_per_period;
    if (form.sort_order !== initial.sort_order) payload.sort_order = sort_order;
    return payload;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRef.current) return;
    setError(null);
    let payload: AdminAddonUpdatePayload;
    try {
      payload = buildPayload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Проверьте поля формы.');
      return;
    }
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const saved = await updateAdminAddon(addon.id, payload);
      onSaved(saved);
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
          data-testid="addons-admin-edit-cancel"
          onClick={onClose}
          style={tariffsBtnSecondary}
        >
          Отмена
        </button>
        <button
          type="submit"
          form="addons-admin-edit-form"
          data-testid="addons-admin-edit-save"
          className="bf-primary-cta"
          disabled={saving}
          style={tariffsBtnPrimaryLayout}
        >
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </>
    ),
    [onClose, saving]
  );

  const typeFrozen = addon.has_references;

  return (
    <TariffsAdminFormModalShell
      testId="addons-admin-edit-modal"
      title={`Изменить пакет: ${addon.name_ru || addon.code}`}
      onClose={onClose}
      footer={footer}
    >
      <form
        id="addons-admin-edit-form"
        onSubmit={e => void onSubmit(e)}
        data-testid="addons-admin-edit-form"
      >
        {error ? (
          <p
            data-testid="addons-admin-edit-error"
            style={{ color: FINANCE_COLORS.danger, fontSize: 13 }}
          >
            {error}
          </p>
        ) : null}

        <div style={tariffsFormSectionStyle}>
          <div style={tariffsSectionTitle}>Основное</div>
          <div style={tariffsFormGridStyle}>
            <div>
              <label style={tariffsLabelStyle}>Название</label>
              <input
                data-testid="addons-admin-edit-name-ru"
                value={form.name_ru}
                onChange={e => set('name_ru', e.target.value)}
                style={tariffsFieldStyle}
                required
              />
            </div>
            <div>
              <label style={tariffsLabelStyle}>Тип ресурса</label>
              <select
                data-testid="addons-admin-edit-type"
                value={form.type}
                disabled={typeFrozen}
                onChange={e => set('type', e.target.value)}
                style={tariffsFieldStyle}
              >
                {ADDON_TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p style={tariffsHelpStyle}>
                {typeFrozen ? 'Тип нельзя менять: пакет уже использовался.' : ADDON_TYPE_HELP}
              </p>
            </div>
          </div>
          <p style={tariffsHelpStyle}>
            Код: <code data-testid="addons-admin-edit-code">{addon.code}</code>
          </p>
          <label style={tariffsLabelStyle}>Описание</label>
          <textarea
            data-testid="addons-admin-edit-description"
            value={form.description_ru}
            onChange={e => set('description_ru', e.target.value)}
            rows={2}
            style={{ ...tariffsFieldStyle, resize: 'vertical' }}
          />
        </div>

        <div style={tariffsFormSectionStyle}>
          <div style={tariffsSectionTitle}>Количество, цена и срок</div>
          <div style={tariffsFormGridStyle}>
            <div>
              <label style={tariffsLabelStyle}>Количество</label>
              <input
                data-testid="addons-admin-edit-amount"
                value={form.amount}
                onChange={e => set('amount', e.target.value)}
                style={tariffsFieldStyle}
                inputMode="numeric"
              />
              <p style={tariffsHelpStyle}>{ADDON_AMOUNT_NOTE}</p>
            </div>
            <div>
              <label style={tariffsLabelStyle}>Цена</label>
              <input
                data-testid="addons-admin-edit-price"
                value={form.price}
                onChange={e => set('price', e.target.value)}
                style={tariffsFieldStyle}
                inputMode="decimal"
              />
              <p style={tariffsHelpStyle}>{ADDON_PRICE_NEW_PURCHASES_NOTE}</p>
            </div>
            <div>
              <label style={tariffsLabelStyle}>Валюта</label>
              <input
                data-testid="addons-admin-edit-currency"
                value={form.currency}
                onChange={e => set('currency', e.target.value)}
                style={tariffsFieldStyle}
              />
            </div>
            {addonDurationUiKind(form.type) === 'messages' ? (
              <div>
                <label style={tariffsLabelStyle}>Срок действия, дней</label>
                <input
                  data-testid="addons-admin-edit-validity-days"
                  value={form.validity_days}
                  onChange={e => set('validity_days', e.target.value)}
                  style={tariffsFieldStyle}
                  inputMode="numeric"
                />
              </div>
            ) : addonDurationUiKind(form.type) === 'capacity' ? (
              <div data-testid="addons-admin-edit-period-hint">
                <label style={tariffsLabelStyle}>Срок действия</label>
                <p style={tariffsHelpStyle}>{ADDON_CAPACITY_DURATION_HELP}</p>
              </div>
            ) : (
              <div data-testid="addons-admin-edit-ai-duration-hint">
                <label style={tariffsLabelStyle}>Срок действия</label>
                <p style={tariffsHelpStyle}>{ADDON_AI_DURATION_HELP}</p>
              </div>
            )}
            <div>
              <label style={tariffsLabelStyle}>{ADDON_SORT_ORDER_LABEL}</label>
              <input
                data-testid="addons-admin-edit-sort-order"
                value={form.sort_order}
                onChange={e => set('sort_order', e.target.value)}
                style={tariffsFieldStyle}
                inputMode="numeric"
              />
              <p style={tariffsHelpStyle}>{ADDON_SORT_ORDER_HELP}</p>
            </div>
          </div>
          {form.type === 'ai_credits' ? (
            <p data-testid="addons-admin-edit-ai-hint" style={tariffsHelpStyle}>
              {ADDON_AI_CREDITS_HELP}
            </p>
          ) : null}
        </div>

        <div style={tariffsFormSectionStyle}>
          <div style={tariffsSectionTitle}>Каталог</div>
          <label style={tariffsLabelStyle}>Доступен с тарифов (коды через запятую)</label>
          <input
            data-testid="addons-admin-edit-available-from"
            value={form.available_from_plan}
            onChange={e => set('available_from_plan', e.target.value)}
            style={tariffsFieldStyle}
          />
          <label style={{ ...tariffsLabelStyle, marginTop: 8 }}>Лимит покупок за период</label>
          <input
            data-testid="addons-admin-edit-max-per-period"
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
