import React, { useEffect, useMemo, useState } from 'react';
import { listAdminPlans, type AdminPlan } from '../../../api/tariffsAdmin';
import { TariffsCheckbox, tariffsHelpStyle, tariffsLabelStyle } from './tariffsAdminFormLayout';

function displayName(plan: AdminPlan): string {
  return (plan.name_ru || plan.name || plan.code).trim();
}

export default function AddonPlanAvailabilitySelector({
  value,
  onChange,
  isAiCredits,
  testId,
}: {
  value: string[] | null;
  onChange: (next: string[] | null) => void;
  isAiCredits: boolean;
  testId: string;
}) {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listAdminPlans()
      .then(result => {
        if (!cancelled) setPlans(result.items.filter(plan => plan.is_active));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => new Set((value ?? []).map(code => String(code).trim().toLowerCase()).filter(Boolean)),
    [value]
  );
  const known = useMemo(() => new Set(plans.map(plan => plan.code.toLowerCase())), [plans]);
  const legacy = [...selected].filter(code => !known.has(code));
  const allPlans = value === null;

  const toggle = (code: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(code);
    else next.delete(code);
    onChange([...next]);
  };

  return (
    <div data-testid={testId}>
      <TariffsCheckbox
        label="Доступен всем тарифам"
        checked={allPlans}
        onChange={checked => onChange(checked ? null : [])}
        testId={`${testId}-all`}
        hint={
          isAiCredits
            ? 'ИИ-кредиты доступны пользователям тарифа «Старт» и платных тарифов.'
            : 'Если выключить, выберите тарифы, на которых можно купить этот пакет.'
        }
      />
      {!allPlans ? (
        <div style={{ marginTop: 8 }}>
          <div style={tariffsLabelStyle}>Выберите тарифы</div>
          {loadError ? (
            <p style={tariffsHelpStyle}>
              Не удалось загрузить тарифы. Сохранение не изменит текущий список.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {plans.map(plan => (
                <TariffsCheckbox
                  key={plan.id}
                  label={displayName(plan)}
                  checked={selected.has(plan.code.toLowerCase())}
                  onChange={checked => toggle(plan.code.toLowerCase(), checked)}
                  testId={`${testId}-${plan.code}`}
                />
              ))}
            </div>
          )}
          {legacy.length > 0 ? (
            <p style={tariffsHelpStyle} data-testid={`${testId}-legacy-warning`}>
              Сохранены legacy-коды: {legacy.join(', ')}. Они не отображаются среди активных
              тарифов. Замените или удалите их перед сохранением пакета.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
