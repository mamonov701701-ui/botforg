import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import {
  createCustomBlockDraft,
  fetchCustomBlock,
  publishCustomBlock,
  updateCustomBlockDraft,
  validateCustomBlock,
} from '../../../api/blocks';
import type { CustomBlockDraftPayload } from '../../../types/blocks';
import { CUSTOM_BLOCK_WIZARD_STEPS } from '../blockLibrary/customBlockWizardContent';

const initialDraft: CustomBlockDraftPayload = {
  title: '',
  description: '',
  purpose: '',
  when_to_use: '',
  category: 'custom',
  inputs: [],
  outputs: [],
  config_schema: [
    {
      name: 'text',
      type: 'text',
      label: 'Текст сообщения',
      required: true,
      description: 'Текст, который получит пользователь.',
    },
  ],
  connection_rules: { max_inputs: 1, max_outputs: 1 },
  runtime_compatibility: 'message',
  simulator_compatibility: true,
  supported_channels: ['telegram'],
  limitations: [],
  examples: [],
  user_guide: { content: '' },
  runtime_definition: { kind: 'message' },
};

const lines = (value: string) =>
  value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);

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

  useEffect(() => {
    if (!versionId) return;
    void fetchCustomBlock(Number(versionId))
      .then(item => {
        if (item.status !== 'draft') {
          navigate(`/dashboard/block-library/custom/${item.id}`, { replace: true });
          return;
        }
        const p = item.passport;
        setDraft({
          title: item.title,
          description: item.description,
          purpose: String(p.purpose || ''),
          when_to_use: String(p.when_to_use || ''),
          category: item.category,
          inputs: p.inputs || [],
          outputs: p.outputs || [],
          config_schema: p.config_schema || initialDraft.config_schema,
          connection_rules: p.connection_rules || initialDraft.connection_rules,
          runtime_compatibility: item.runtime_kind,
          simulator_compatibility: Boolean(p.simulator_compatibility),
          supported_channels: p.supported_channels || [],
          limitations: p.limitations || [],
          examples: p.examples || [],
          user_guide: item.user_guide || { content: '' },
          internal_code: String(p.internal_code || ''),
          runtime_definition: item.runtime_definition,
        });
      })
      .catch(() => setMessage('Не удалось загрузить черновик.'));
  }, [navigate, versionId]);

  const current = CUSTOM_BLOCK_WIZARD_STEPS[step];
  const summary = useMemo(
    () => [
      ['Название', draft.title || 'Не заполнено'],
      ['Назначение', draft.purpose || 'Не заполнено'],
      ['Категория', 'Пользовательский'],
      ['Входы', draft.inputs.map(v => v.name).join(', ') || 'Нет'],
      ['Выходы', draft.outputs.map(v => v.name).join(', ') || 'Нет'],
      ['Параметры', draft.config_schema.map(v => v.label).join(', ')],
      ['Соединения', 'Один вход, один выход'],
      ['Выполнение', 'Сообщение'],
      ['Предпросмотр', 'Поддерживается'],
      ['Версия', savedId ? 'Черновик сохранён' : 'Новая версия'],
    ],
    [draft, savedId]
  );

  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const item = savedId
        ? await updateCustomBlockDraft(savedId, draft)
        : await createCustomBlockDraft(draft);
      setSavedId(item.id);
      setMessage('Черновик сохранён.');
      return item.id;
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось сохранить черновик.');
      return null;
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
      setMessage(error?.message || 'Не удалось проверить блок.');
    }
  };
  const publish = async () => {
    const id = await save();
    if (!id) return;
    try {
      const result = await validateCustomBlock(id);
      setValidation(result);
      if (!result.valid) return;
      await publishCustomBlock(id);
      navigate('/dashboard/block-library');
    } catch (error: any) {
      setMessage(error?.message || 'Не удалось опубликовать блок.');
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
          draft.inputs.map(v => String(v.name)).join('\n'),
          value => setDraft({ ...draft, inputs: lines(value).map(name => ({ name })) })
        );
      case 'outputs':
        return textArea(
          'Выходные данные — по одному на строке',
          draft.outputs.map(v => String(v.name)).join('\n'),
          value => setDraft({ ...draft, outputs: lines(value).map(name => ({ name })) })
        );
      case 'settings':
        return (
          <Card>
            <p className="font-medium">Текст сообщения</p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Обязательное поле редактора. Это минимальный безопасный исполняемый тип кастомного
              блока.
            </p>
          </Card>
        );
      case 'connections':
        return (
          <Card>
            <p>
              Поддерживается один вход и один выход. Ветвление создавайте системным блоком «Выбор».
            </p>
          </Card>
        );
      case 'runtime':
        return (
          <Card>
            <p>
              Блок отправляет настроенный текст как системный блок «Сообщение». Произвольный код и
              сетевые вызовы не выполняются.
            </p>
          </Card>
        );
      case 'limitations':
        return textArea('Ограничения — по одному на строке', draft.limitations.join('\n'), value =>
          setDraft({ ...draft, limitations: lines(value) })
        );
      case 'examples':
        return textArea('Примеры — по одному на строке', draft.examples.join('\n'), value =>
          setDraft({ ...draft, examples: lines(value) })
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
                      <li key={v}>{v}</li>
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
        <div className="h-2 overflow-hidden rounded bg-[var(--border)]">
          <div
            className="h-full bg-[var(--accent)]"
            style={{ width: `${((step + 1) / CUSTOM_BLOCK_WIZARD_STEPS.length) * 100}%` }}
          />
        </div>
        <Card>
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
        </Card>
        <Card>{renderFields()}</Card>
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
            {step < 10 ? (
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
                  onClick={() => void publish()}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-[#0A1B3D]"
                >
                  Опубликовать
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardPage>
  );
}
