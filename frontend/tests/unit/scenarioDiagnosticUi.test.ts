import { describe, it, expect } from 'vitest';
import {
  getScenarioDiagnosticUiModel,
  formatScenarioDiagnosticsTooltip,
  computeScenarioValidationSummary,
} from '@/utils/scenarioDiagnosticUi';
import type { ScenarioDiagnostic } from '@/utils/scenarioConsistency';
import type { ValidationResult } from '@/utils/schemaValidation';

describe('scenarioDiagnosticUi', () => {
  it('maps each code to title and hint', () => {
    const codes = [
      'InputVariableKeyInvalid',
      'InputVariableKeyMissing',
      'MessageUnknownPlaceholder',
      'ConditionUnknownVariable',
      'ConditionTooManyBranches',
      'ConditionSecondBranchMissing',
      'MissingOutgoingEdge',
      'RequiredFieldMissing',
    ] as const;
    for (const code of codes) {
      const d: ScenarioDiagnostic = {
        severity:
          code === 'MessageUnknownPlaceholder' || code === 'ConditionSecondBranchMissing'
            ? 'warning'
            : 'error',
        blockId: 'n1',
        code,
        message: 'Детали от валидатора',
      };
      const ui = getScenarioDiagnosticUiModel(d);
      expect(ui.title.length).toBeGreaterThan(3);
      expect(ui.body).toBe('Детали от валидатора');
      expect(ui.actionHint).toBeTruthy();
    }
  });

  it('formatScenarioDiagnosticsTooltip merges schema lines and diagnostics', () => {
    const d: ScenarioDiagnostic = {
      severity: 'error',
      blockId: 'x',
      code: 'MissingOutgoingEdge',
      message: 'Нет связи',
    };
    const t = formatScenarioDiagnosticsTooltip([d], ['Поле А пустое']);
    expect(t).toContain('Схема блока');
    expect(t).toContain('Поле А пустое');
    expect(t).toContain('Нет исходящей связи');
    expect(t).toContain('Нет связи');
  });

  it('computeScenarioValidationSummary counts unique error nodes and warnings', () => {
    const validationResults = new Map<string, ValidationResult>([
      ['a', { nodeId: 'a', isValid: false, missingFields: ['f'], blockTitle: 'A' }],
      ['b', { nodeId: 'b', isValid: true, missingFields: [], blockTitle: 'B' }],
    ]);
    const diagnostics: ScenarioDiagnostic[] = [
      {
        severity: 'error',
        blockId: 'c',
        code: 'MessageUnknownPlaceholder',
        message: 'm',
      },
      {
        severity: 'warning',
        blockId: 'd',
        code: 'MessageUnknownPlaceholder',
        message: 'w',
      },
    ];
    const s = computeScenarioValidationSummary({ validationResults, diagnostics });
    expect(s.errorNodeCount).toBe(2);
    expect(s.warningCount).toBe(1);
  });
});
