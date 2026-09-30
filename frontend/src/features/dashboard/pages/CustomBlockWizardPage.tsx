import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import {
  createCustomBlockDraft,
  fetchCustomBlock,
  submitCustomBlockReview,
  updateCustomBlockDraft,
  validateCustomBlock,
} from '../../../api/blocks';
import type { CustomBlockDraftPayload } from '../../../types/blocks';
import {
  CUSTOM_BLOCK_WIZARD_STEPS,
  customBlockWizardStepNumber,
} from '../blockLibrary/customBlockWizardContent';
import {
  normalizedInputPorts,
  normalizedOutputPorts,
  outputMachineKey,
} from '../../../utils/customBlockConnections';

const initialDraft: CustomBlockDraftPayload = {
  title: '',
  description: '',
  purpose: '',
  when_to_use: '',
  category: 'custom',
  inputs: [],
  outputs: [{ name: 'success', display_name: 'Успех', type: 'json' }],
  config_schema: [
    {
      name: 'text',
      type: 'text',
      label: 'Текст сообщения',
      required: true,
      description: 'Текст, который получит пользователь.',
    },
  ],
  connection_rules: { input_count: 1, output_count: 1, max_inputs: 1, max_outputs: 1 },
  runtime_compatibility: 'message',
  simulator_compatibility: true,
  supported_channels: ['telegram'],
  limitations: [],
  examples: [],
  user_guide: { content: '' },
  runtime_definition: { kind: 'message' },
  wizard_step: 0,
};

const lines = (value: string) =>
  value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);

const executionStep = customBlockWizardStepNumber('runtime');

const dockedRowOrder = (group: number, activeGroup: number, groupCount: number) => {
  if (group === activeGroup) return groupCount;
  return group < activeGroup ? group + 1 : group;
};

const userFacingRequestError = (error: any, fallback: string) => {
  const message = String(error?.message || '');
  if (/at most 96 characters|string_too_long/i.test(message)) {
    return 'Название входа или выхода слишком длинное. Максимум — 96 символов.';
  }
  if (/string should match pattern|validation error|pydantic|\^\[a-z\]/i.test(message)) {
    return `Шаг ${executionStep} «Выполнение»: не удалось сохранить спецификацию выполнения. Один из системных идентификаторов имеет некорректный формат.`;
  }
  return message || fallback;
};

export default function CustomBlockWizardPage() {
  const { versionId } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<CustomBlockDraftPayload>(initialDraft);
  const [savedId, setSavedId] = useState<number | null>(versionId ? Number(versionId) : null);
  const [message, setMessage] = useState('');
  const [validation, setValidation] = useState<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [hydrated, setHydrated] = useState(!versionId);
  const [submitted, setSubmitted] = useState<null | { id: number; version: number }>(null);
  const savedIdRef = useRef<number | null>(versionId ? Number(versionId) : null);
  const observedRef = useRef<{ draft: CustomBlockDraftPayload; step: number }>({
    draft: initialDraft,
    step: 0,
  });
  const revisionRef = useRef(0);
  const saveQueueRef = useRef<Promise<number | null>>(Promise.resolve(null));

  useEffect(() => {
    if (!versionId) return;
    setHydrated(false);
    void fetchCustomBlock(Number(versionId))
      .then(item => {
        if (
          item.status !== 'draft' ||
          item.review_state === 'admin_review_pending' ||
          item.review_state === 'approved'
        ) {
          navigate(`/dashboard/block-library/custom/${item.id}`, { replace: true });
          return;
        }
        const p = item.passport;
        const outputs = normalizedOutputPorts(
          p.outputs || [],
          Number(p.connection_rules?.output_count ?? ((p.outputs || []).length || 1))
        );
        const inputs = normalizedInputPorts(
          p.inputs || [],
          outputs.map(port => port.name)
        );
        const restoredDraft: CustomBlockDraftPayload = {
          title: item.title,
          description: item.description,
          purpose: String(p.purpose || ''),
          when_to_use: String(p.when_to_use || ''),
          category: item.category,
          inputs,
          outputs,
          config_schema: p.config_schema || initialDraft.config_schema,
          connection_rules: { ...initialDraft.connection_rules, ...(p.connection_rules || {}) },
          runtime_compatibility: item.runtime_kind,
          simulator_compatibility: Boolean(p.simulator_compatibility),
          supported_channels: p.supported_channels || [],
          limitations: p.limitations || [],
          examples: p.examples || [],
          user_guide: item.user_guide || { content: '' },
          internal_code: String(p.internal_code || ''),
          runtime_definition: { ...(item.runtime_definition || {}), kind: item.runtime_kind },
          execution_spec: item.execution_spec ?? null,
          wizard_step: Number(p.wizard_step ?? 0),
        };
        const restoredStep = Math.max(0, Math.min(8, Number(p.wizard_step ?? 0)));
        observedRef.current = { draft: restoredDraft, step: restoredStep };
        setDraft(restoredDraft);
        setStep(restoredStep);
        setHydrated(true);
        setSaveStatus('saved');
      })
      .catch(() => {
        setMessage('Не удалось загрузить черновик.');
        setHydrated(true);
      });
  }, [navigate, versionId]);

  const current = CUSTOM_BLOCK_WIZARD_STEPS[step];
  const summary = useMemo(
    () => [
      ['Название', draft.title || 'Не заполнено'],
      ['Назначение', draft.purpose || 'Не заполнено'],
      ['Категория', 'Пользовательский'],
      ['Входы', String(Number(draft.connection_rules.input_count ?? 1))],
      [
        'Выходы',
        draft.outputs.map(v => String(v.display_name || v.name)).join(', ') ||
          'Нет (терминальный блок)',
      ],
      ['Параметры', draft.config_schema.map(v => v.label).join(', ')],
      [
        'Соединения',
        `${Number(draft.connection_rules.input_count ?? 1)} вход(а), ${draft.outputs.length} выход(а)`,
      ],
      ['Выполнение', draft.runtime_compatibility === 'javascript' ? 'JavaScript' : 'Сообщение'],
      ['Предпросмотр', 'Поддерживается'],
      ['Версия', savedId ? 'Черновик сохранён' : 'Новая версия'],
    ],
    [draft, savedId]
  );

  const persistSnapshot = useCallback(
    (snapshot: CustomBlockDraftPayload, snapshotStep: number, revision: number) => {
      const payload = { ...snapshot, wizard_step: snapshotStep };
      setSaveStatus('saving');
      const task = async () => {
        try {
          const currentId = savedIdRef.current;
          const item = currentId
            ? await updateCustomBlockDraft(currentId, payload)
            : await createCustomBlockDraft(payload);
          if (!currentId) {
            savedIdRef.current = item.id;
            setSavedId(item.id);
            window.history.replaceState(
              window.history.state,
              '',
              `/dashboard/block-library/custom/${item.id}/edit`
            );
          }
          if (revision === revisionRef.current) setSaveStatus('saved');
          return item.id;
        } catch (error: any) {
          if (revision === revisionRef.current) {
            setSaveStatus('error');
            setMessage(userFacingRequestError(error, 'Не удалось сохранить черновик.'));
          }
          return null;
        }
      };
      saveQueueRef.current = saveQueueRef.current.catch(() => null).then(task);
      return saveQueueRef.current;
    },
    [navigate]
  );

  useEffect(() => {
    if (!hydrated || submitted) return;
    if (observedRef.current.draft === draft && observedRef.current.step === step) return;
    observedRef.current = { draft, step };
    revisionRef.current += 1;
    const revision = revisionRef.current;
    const timer = window.setTimeout(() => {
      void persistSnapshot(draft, step, revision);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [draft, hydrated, persistSnapshot, submitted, step]);

  const save = async () => {
    setBusy(true);
    setMessage('');
    revisionRef.current += 1;
    const revision = revisionRef.current;
    try {
      return await persistSnapshot(draft, step, revision);
    } finally {
      setBusy(false);
    }
  };
  const check = async () => {
    const id = await save();
    if (!id) return;
    try {
      setValidation(await validateCustomBlock(id));
    } catch (error: any) {
      setMessage(userFacingRequestError(error, 'Не удалось проверить блок.'));
    }
  };
  const submitReview = async () => {
    const id = await save();
    if (!id) return;
    try {
      const result = await validateCustomBlock(id);
      setValidation(result);
      if (!result.valid) return;
      const item = await submitCustomBlockReview(id);
      setSubmitted({ id: item.id, version: item.version });
    } catch (error: any) {
      setMessage(userFacingRequestError(error, 'Не удалось опубликовать блок.'));
    }
  };

  const textArea = (label: string, value: string, onChange: (value: string) => void) => (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-[var(--text)]">{label}</span>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        className="min-h-28 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-[var(--text)]"
      />
    </label>
  );
  const renderFields = () => {
    switch (current.id) {
      case 'identity':
        return (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">Название</span>
              <input
                value={draft.title}
                onChange={e => setDraft({ ...draft, title: e.target.value })}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
              />
            </label>
            {textArea('Краткое описание', draft.description, value =>
              setDraft({ ...draft, description: value })
            )}
            {textArea('Назначение', draft.purpose, value => setDraft({ ...draft, purpose: value }))}
          </div>
        );
      case 'when':
        return textArea('Когда использовать', draft.when_to_use, value =>
          setDraft({ ...draft, when_to_use: value })
        );
      case 'inputs':
        return textArea(
          'Входные данные — по одному на строке',
          draft.inputs.map(v => String(v.display_name || v.name)).join('\n'),
          value => {
            const inputs = normalizedInputPorts(
              lines(value).map(display_name => ({ display_name })),
              draft.outputs.map(port => String(port.name))
            );
            setDraft({
              ...draft,
              inputs,
              execution_spec: draft.execution_spec
                ? { ...draft.execution_spec, inputs }
                : draft.execution_spec,
            });
          }
        );
      case 'connections': {
        const inputCount = Number(draft.connection_rules.input_count ?? 1);
        const outputCount = draft.outputs.length;
        const updatePorts = (ports: Record<string, unknown>[]) =>
          setDraft({
            ...draft,
            outputs: ports,
            connection_rules: {
              ...draft.connection_rules,
              input_count: inputCount,
              output_count: ports.length,
              max_inputs: inputCount,
              max_outputs: ports.length,
            },
            execution_spec: draft.execution_spec
              ? {
                  ...draft.execution_spec,
                  outputs: ports,
                  inputs: draft.inputs,
                  settings_schema: draft.config_schema,
                }
              : draft.execution_spec,
          });
        return (
          <div className="space-y-5">
            <p className="text-sm text-[var(--text-muted)]">
              Каждый выход описывает результат, который блок передаёт дальше, и создаёт отдельный
              маршрут сценария.
            </p>
            <label className="block">
              <span className="mb-2 block font-medium">Входы</span>
              <select
                value={inputCount}
                onChange={e =>
                  setDraft({
                    ...draft,
                    connection_rules: {
                      ...draft.connection_rules,
                      input_count: Number(e.target.value),
                      max_inputs: Number(e.target.value),
                    },
                  })
                }
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
              >
                <option value={1}>1 вход — обычный шаг сценария</option>
                <option value={0}>0 входов — стартовый или самостоятельный блок</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block font-medium">Выходы</span>
              <select
                value={outputCount}
                onChange={e =>
                  updatePorts(
                    normalizedOutputPorts(
                      draft.outputs,
                      Number(e.target.value),
                      draft.inputs.map(input => String(input.name))
                    )
                  )
                }
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
              >
                {Array.from({ length: 33 }, (_, value) => (
                  <option key={value} value={value}>
                    {value} {value === 0 ? 'выходов — терминальный блок' : 'выход(а)'}
                  </option>
                ))}
              </select>
            </label>
            {draft.outputs.map((port, index) => (
              <label key={index} className="block">
                <span className="mb-2 block text-sm font-medium">
                  Выход {index + 1}: отображаемое название
                </span>
                <input
                  value={String(port.display_name || '')}
                  onChange={e => {
                    const ports = [...draft.outputs];
                    const display_name = e.target.value;
                    ports[index] = {
                      ...ports[index],
                      display_name,
                      name: outputMachineKey(display_name, [
                        ...draft.inputs.map(input => String(input.name)),
                        ...ports.filter((_, i) => i !== index).map(item => String(item.name)),
                      ]),
                    };
                    updatePorts(ports);
                  }}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3"
                  placeholder="Например, Успех"
                />
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Маршрут: <code>{String(port.name)}</code>
                </p>
              </label>
            ))}
            <p className="text-sm text-[var(--text-muted)]">
              Ключи маршрутов система создаёт автоматически и закрепляет за опубликованной версией.
            </p>
          </div>
        );
      }
      case 'runtime':
        return (
          <Card>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.runtime_compatibility === 'javascript'}
                onChange={e =>
                  setDraft({
                    ...draft,
                    runtime_compatibility: e.target.checked ? 'javascript' : 'message',
                    runtime_definition: {
                      ...draft.runtime_definition,
                      kind: e.target.checked ? 'javascript' : 'message',
                    },
                    execution_spec: e.target.checked
                      ? {
                          schema_version: 1,
                          language: 'javascript',
                          runtime_profile: 'quickjs-wasm-v1',
                          source: draft.outputs.length
                            ? `function run(envelope) { return { outputs: {}, route: "${String(draft.outputs[0]?.name)}", logs: [] }; }`
                            : 'function run(envelope) { return { outputs: {}, logs: [] }; }',
                          inputs: draft.inputs,
                          outputs: draft.outputs,
                          settings_schema: draft.config_schema,
                          capabilities: {
                            network: false,
                            filesystem: false,
                            secrets: false,
                            database: false,
                            persistence: false,
                            dependencies: false,
                            subprocess: false,
                            platform_api: false,
                          },
                          resource_profile: {
                            wall_clock_ms: 750,
                            cpu_ms: 500,
                            memory_mb: 32,
                            max_source_bytes: 32768,
                            max_input_bytes: 16384,
                            max_output_bytes: 16384,
                            max_log_entries: 20,
                            max_log_entry_bytes: 512,
                            max_log_bytes: 4096,
                          },
                        }
                      : null,
                  })
                }
              />
              Выполнять JavaScript в изолированном раннере
            </label>
            {draft.outputs.length > 1 && draft.runtime_compatibility !== 'javascript' ? (
              <p role="alert" className="mt-3 text-sm text-amber-400">
                Для нескольких выходов включите JavaScript Runtime (выполнение JavaScript): только
                код может выбрать именованный маршрут. Message fallback (резервное выполнение
                сообщением) поддерживает не более одного выхода.
              </p>
            ) : null}
            {draft.runtime_compatibility === 'javascript' ? (
              <label className="mt-4 block">
                <span className="mb-2 block text-sm font-medium">Код JavaScript</span>
                <textarea
                  value={String(draft.execution_spec?.source || '')}
                  onChange={e =>
                    setDraft({
                      ...draft,
                      execution_spec: {
                        ...draft.execution_spec,
                        source: e.target.value,
                        inputs: draft.inputs,
                        outputs: draft.outputs,
                        settings_schema: draft.config_schema,
                      },
                    })
                  }
                  className="min-h-56 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 font-mono text-sm"
                />
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Код выполняется в изолированном Runner (раннере). Определите функцию{' '}
                  <code>run(envelope)</code>, возвращающую <code>{'{ outputs, route, logs }'}</code>
                  . Сеть, пакеты, файлы и секреты запрещены.
                </p>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  В <code>envelope.settings</code> передаются только настройки из контракта блока, а
                  в <code>envelope.input</code> — только входные данные текущего выполнения.
                </p>
                <p className="mt-2 text-sm font-medium">
                  Доступные маршруты:{' '}
                  {draft.outputs.length
                    ? draft.outputs.map(port => (
                        <span key={String(port.name)} className="mr-3">
                          <code>{String(port.name)}</code> — «{String(port.display_name)}»
                        </span>
                      ))
                    : 'нет: блок терминальный'}
                </p>
              </label>
            ) : (
              <p className="mt-3">
                Блок отправляет настроенный текст как системный блок «Сообщение».
              </p>
            )}
          </Card>
        );
      case 'limitations':
        return (
          <div className="space-y-4">
            <div>
              <p className="font-medium">Системные ограничения</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-[var(--text-muted)]">
                <li>Нет доступа к сети, файлам и секретам.</li>
                <li>Выполнение ограничено по времени.</li>
                <li>Доступны только переданные входные данные.</li>
              </ul>
            </div>
            {textArea(
              'Ограничения автора — необязательно, по одному на строке',
              draft.limitations.join('\n'),
              value => setDraft({ ...draft, limitations: lines(value) })
            )}
            <p className="text-sm text-[var(--text-muted)]">
              Например: «Не работает с изображениями больше 5 МБ» или «При пустом тексте возвращает
              ошибку».
            </p>
          </div>
        );
      case 'examples':
        return (
          <>
            <p className="mb-3 text-sm text-[var(--text-muted)]">
              Опишите один реальный сценарий использования блока простым языком. Один пример на
              строку; минимум один пример обязателен.
            </p>
            {textArea('Примеры использования', draft.examples.join('\n'), value =>
              setDraft({ ...draft, examples: lines(value) })
            )}
          </>
        );
      case 'guide':
        return textArea(
          'Пользовательская инструкция',
          String(draft.user_guide.content || ''),
          value => setDraft({ ...draft, user_guide: { content: value } })
        );
      default:
        return (
          <div className="space-y-4">
            {summary.map(([label, value]) => (
              <div
                key={label}
                className="grid gap-1 border-b border-[var(--border)] pb-2 md:grid-cols-3"
              >
                <strong>{label}</strong>
                <span className="md:col-span-2 text-[var(--text-muted)]">{value}</span>
              </div>
            ))}
            {validation ? (
              <div>
                <h3 className="font-semibold">Ошибки</h3>
                {validation.errors.length ? (
                  <ul className="list-disc pl-5 text-red-400">
                    {validation.errors.map(v => (
                      <li key={v} className="mb-2">
                        {v}
                        {v.startsWith('Шаг ') ? (
                          <button
                            onClick={() => {
                              const match = v.match(/^Шаг (\d+)/);
                              if (match) setStep(Number(match[1]) - 1);
                            }}
                            className="ml-2 rounded border border-red-400 px-2 py-1 text-xs"
                          >
                            Исправить
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-emerald-400">Критических ошибок нет.</p>
                )}
                <h3 className="mt-3 font-semibold">Предупреждения</h3>
                {validation.warnings.length ? (
                  <ul className="list-disc pl-5 text-amber-400">
                    {validation.warnings.map(v => (
                      <li key={v}>{v}</li>
                    ))}
                  </ul>
                ) : (
                  <p>Нет.</p>
                )}
              </div>
            ) : null}
          </div>
        );
    }
  };

  return (
    <DashboardPage
      title="Создать свой блок"
      subtitle={`Шаг ${step + 1} из ${CUSTOM_BLOCK_WIZARD_STEPS.length}: ${current.title}`}
    >
      <div className="mx-auto max-w-4xl space-y-4" data-testid="custom-block-wizard">
        {submitted ? (
          <Card>
            <h2 className="text-xl font-semibold text-emerald-500">Блок отправлен на проверку</h2>
            <p className="mt-2">
              {draft.title} · версия {submitted.version} · ожидает ручной проверки администратором.
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Входов: {Number(draft.connection_rules.input_count ?? 1)}. Выходы:{' '}
              {draft.outputs.length
                ? draft.outputs.map(port => `«${String(port.display_name)}»`).join(', ')
                : 'нет (терминальный блок)'}
              .
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => navigate(`/dashboard/block-library/custom/${submitted.id}`)}
                className="rounded-lg border border-[var(--border)] px-4 py-2"
              >
                Открыть блок
              </button>
              <button
                onClick={() => navigate('/dashboard/block-library')}
                className="rounded-lg border border-[var(--border)] px-4 py-2"
              >
                Вернуться в библиотеку
              </button>
              <button
                onClick={() => navigate('/editor')}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-[#0A1B3D]"
              >
                Открыть в редакторе
              </button>
            </div>
          </Card>
        ) : null}
        {!submitted ? (
          <div className="min-w-0" data-testid="wizard-navigation-content-layout">
            <div
              className="custom-block-wizard__active-page-shell"
              data-testid="wizard-active-page-shell"
            >
              <div
                role="tablist"
                aria-label="Шаги создания блока"
                data-testid="wizard-tab-navigation"
                data-active-desktop-row={step < 5 ? '1' : '2'}
                data-active-medium-row={String(Math.floor(step / 3) + 1)}
                data-active-narrow-row={String(Math.floor(step / 2) + 1)}
                className="custom-block-wizard__tablist grid min-w-0 gap-x-0 gap-y-2"
              >
                {CUSTOM_BLOCK_WIZARD_STEPS.map((wizardStep, index) => {
                  const errors =
                    validation?.errors.filter(value => value.startsWith(`Шаг ${index + 1} `)) || [];
                  const hasError = errors.length > 0;
                  const desktopGroup = index < 5 ? 0 : 1;
                  const mediumGroup = Math.floor(index / 3);
                  const narrowGroup = Math.floor(index / 2);
                  const tabOrderStyle = {
                    '--wizard-tab-row-mobile': dockedRowOrder(index, step, 9),
                    '--wizard-tab-column-mobile': 1,
                    '--wizard-tab-row-narrow': dockedRowOrder(narrowGroup, Math.floor(step / 2), 5),
                    '--wizard-tab-column-narrow': (index % 2) + 1,
                    '--wizard-tab-row-medium': dockedRowOrder(mediumGroup, Math.floor(step / 3), 3),
                    '--wizard-tab-column-medium': (index % 3) + 1,
                    '--wizard-tab-row-desktop': dockedRowOrder(desktopGroup, step < 5 ? 0 : 1, 2),
                    '--wizard-tab-column-desktop': desktopGroup === 0 ? index + 1 : index - 4,
                  } as React.CSSProperties;
                  return (
                    <button
                      key={wizardStep.id}
                      type="button"
                      role="tab"
                      onClick={() => setStep(index)}
                      onKeyDown={event => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setStep(index);
                        }
                      }}
                      aria-current={index === step ? 'step' : undefined}
                      aria-selected={index === step}
                      aria-controls="wizard-current-step-panel"
                      aria-invalid={hasError || undefined}
                      aria-describedby={
                        hasError ? `wizard-step-${index + 1}-error-description` : undefined
                      }
                      id={`wizard-step-tab-${index + 1}`}
                      title={wizardStep.title}
                      data-step-status={hasError ? 'error' : 'normal'}
                      data-desktop-row={desktopGroup + 1}
                      data-medium-row={mediumGroup + 1}
                      data-narrow-row={narrowGroup + 1}
                      data-testid={`wizard-step-${index + 1}`}
                      style={tabOrderStyle}
                      className={`custom-block-wizard__tab relative flex h-11 items-center justify-center gap-1.5 rounded-t-xl border px-2 py-2 text-xs transition-colors focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:text-sm ${index === step ? 'z-10 border-[var(--bf-section-border)] border-b-0 bg-[var(--bf-section-bg)] font-semibold text-[var(--text)] shadow-[inset_0_2px_0_var(--accent)]' : 'border-[var(--border)] bg-[var(--bf-shell-bg-solid)] font-normal text-[var(--text-muted)] hover:border-[var(--bf-section-border)] hover:bg-[var(--bf-section-bg)] hover:text-[var(--text)]'}`}
                    >
                      <span
                        data-testid={`wizard-step-number-${index + 1}`}
                        className="font-semibold tabular-nums"
                      >
                        {index + 1}
                      </span>
                      <span>{wizardStep.navigationTitle}</span>
                      {hasError ? (
                        <span
                          id={`wizard-step-${index + 1}-error-description`}
                          data-testid={`wizard-step-error-${index + 1}`}
                          className="text-red-400"
                        >
                          <span aria-hidden>●</span>
                          <span className="sr-only">На этом шаге есть ошибка</span>
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <div
                id="wizard-current-step-panel"
                role="tabpanel"
                aria-labelledby={`wizard-step-tab-${step + 1}`}
                data-testid="wizard-current-step-card"
                className="custom-block-wizard__page-content"
              >
                <h2 className="text-xl font-semibold">{current.title}</h2>
                <p className="mt-2 text-[var(--text-muted)]">{current.explanation}</p>
                <p className="mt-3 text-sm">
                  <strong>Зачем:</strong> {current.why}
                </p>
                <p className="mt-2 text-sm">
                  <strong>Хороший пример:</strong> {current.example}
                </p>
                <p className="mt-2 text-sm text-amber-400">
                  <strong>Типичная ошибка:</strong> {current.commonMistake}
                </p>
                <div className="mt-6 border-t border-[var(--border)] pt-6">{renderFields()}</div>
              </div>
            </div>
            <div className="mt-4 min-w-0 space-y-4" data-testid="wizard-content-stack">
              {!submitted && validation?.errors.length ? (
                <div
                  role="alert"
                  className="rounded-lg border border-red-500 bg-red-950/30 p-4 text-red-200"
                >
                  <strong>Есть ошибки, которые нужно исправить до публикации.</strong>
                  <ul className="mt-2 list-disc pl-5">
                    {validation.errors.map(error => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p
                role="status"
                data-testid="draft-save-status"
                className={`text-sm ${saveStatus === 'error' ? 'text-red-400' : 'text-[var(--text-muted)]'}`}
              >
                {saveStatus === 'saving'
                  ? 'Сохранение…'
                  : saveStatus === 'saved'
                    ? 'Сохранено'
                    : saveStatus === 'error'
                      ? 'Ошибка сохранения'
                      : 'Изменения будут сохранены автоматически'}
              </p>
              {message ? (
                <p role="status" className="text-sm text-[var(--text-muted)]">
                  {message}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-between gap-3">
                <button
                  disabled={step === 0 || busy}
                  onClick={() => setStep(v => v - 1)}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 disabled:opacity-40"
                >
                  Назад
                </button>
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    onClick={() => void save()}
                    className="rounded-lg border border-[var(--border)] px-4 py-2"
                  >
                    Сохранить черновик
                  </button>
                  {step < CUSTOM_BLOCK_WIZARD_STEPS.length - 1 ? (
                    <button
                      onClick={() => setStep(v => v + 1)}
                      className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-[#0A1B3D]"
                    >
                      Далее
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => void check()}
                        className="rounded-lg border border-[var(--accent)] px-4 py-2"
                      >
                        Проверить
                      </button>
                      <button
                        onClick={() => void submitReview()}
                        className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-[#0A1B3D]"
                      >
                        Отправить на проверку
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </DashboardPage>
  );
}
