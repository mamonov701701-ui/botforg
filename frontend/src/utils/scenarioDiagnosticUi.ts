/**
 * Единое отображение ScenarioDiagnostic в UI (подписи, hints, summary).
 */

import type { ScenarioDiagnostic, ScenarioDiagnosticCode } from './scenarioConsistency';
import type { ValidationResult } from './schemaValidation';

export interface ScenarioDiagnosticUiModel {
  /** Короткое название типа проблемы */
  title: string;
  /** Основной текст (как правило из validator message) */
  body: string;
  /** Подсказка что сделать */
  actionHint?: string;
}

const CODE_TITLES: Record<ScenarioDiagnosticCode, string> = {
  InputVariableKeyInvalid: 'Некорректный ключ переменной',
  InputVariableKeyMissing: 'Не указан ключ переменной',
  MessageUnknownPlaceholder: 'Неизвестный плейсхолдер в тексте',
  ConditionUnknownVariable: 'Неизвестная переменная в условии',
  MissingOutgoingEdge: 'Нет исходящей связи',
  RequiredFieldMissing: 'Обязательное поле',
};

const CODE_ACTION_HINTS: Partial<Record<ScenarioDiagnosticCode, string>> = {
  InputVariableKeyInvalid:
    'Задайте ключ латиницей в стиле snake_case, без пробелов и без префикса user./system.',
  InputVariableKeyMissing: 'Заполните поле «Ключ переменной» (variable_key) в настройках блока.',
  MessageUnknownPlaceholder:
    'Объявите переменную в конструкторе бота или используйте {{user.*}} / {{system.*}} по справке.',
  ConditionUnknownVariable:
    'Выберите объявленную переменную или выражение user.* / system.* из справки плейсхолдеров.',
  MissingOutgoingEdge:
    'Потяните связь от оранжевого выхода «Успех» (или от единственного не-error выхода) к следующему блоку.',
  RequiredFieldMissing: 'Заполните отмеченные обязательные поля в панели настроек этого блока.',
};

export function getScenarioDiagnosticUiModel(d: ScenarioDiagnostic): ScenarioDiagnosticUiModel {
  return {
    title: CODE_TITLES[d.code] ?? 'Проблема проверки сценария',
    body: d.message,
    actionHint: CODE_ACTION_HINTS[d.code],
  };
}

/** Одна строка для badge / компактного списка */
export function formatScenarioDiagnosticOneLine(d: ScenarioDiagnostic): string {
  const { title, body } = getScenarioDiagnosticUiModel(d);
  return `${title}: ${body}`;
}

/** Многострочный tooltip для узла */
export function formatScenarioDiagnosticsTooltip(
  diagnostics: ScenarioDiagnostic[],
  schemaLines?: string[]
): string {
  const parts: string[] = [];
  if (schemaLines?.length) {
    parts.push('Схема блока:', ...schemaLines.map(s => `• ${s}`));
  }
  for (const d of diagnostics) {
    const m = getScenarioDiagnosticUiModel(d);
    let line = `${m.title}: ${m.body}`;
    if (m.actionHint) line += `\n  → ${m.actionHint}`;
    parts.push(line);
  }
  return parts.join('\n\n');
}

export interface ScenarioValidationSummary {
  /** Уникальные узлы: схема невалидна или есть diagnostic error */
  errorNodeCount: number;
  /** Количество предупреждений консистентности (строки diagnostics) */
  warningCount: number;
}

/**
 * Сводка для верхней панели: уникальные узлы с ошибками + число warning-диагностик.
 */
export function computeScenarioValidationSummary(input: {
  validationResults: Map<string, ValidationResult>;
  diagnostics: ScenarioDiagnostic[];
}): ScenarioValidationSummary {
  const errorIds = new Set<string>();
  for (const r of input.validationResults.values()) {
    if (!r.isValid) errorIds.add(r.nodeId);
  }
  for (const d of input.diagnostics) {
    if (d.severity === 'error') errorIds.add(d.blockId);
  }
  const warningCount = input.diagnostics.filter(d => d.severity === 'warning').length;
  return { errorNodeCount: errorIds.size, warningCount };
}
