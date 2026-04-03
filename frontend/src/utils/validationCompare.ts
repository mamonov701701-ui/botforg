/**
 * Сравнение результатов валидации без лишних обновлений zustand.
 */

import type { ScenarioDiagnostic } from './scenarioConsistency';
import type { ValidationResult } from './schemaValidation';

export function validationResultEqual(a: ValidationResult, b: ValidationResult): boolean {
  if (a.nodeId !== b.nodeId || a.isValid !== b.isValid) return false;
  if (a.missingFields.length !== b.missingFields.length) return false;
  for (let i = 0; i < a.missingFields.length; i++) {
    if (a.missingFields[i] !== b.missingFields[i]) return false;
  }
  if (a.blockTitle !== b.blockTitle) return false;
  return true;
}

export function validationResultsMapEqual(
  prev: Map<string, ValidationResult>,
  next: Map<string, ValidationResult>
): boolean {
  if (prev.size !== next.size) return false;
  for (const [id, a] of next) {
    const b = prev.get(id);
    if (!b) return false;
    if (a.isValid !== b.isValid) return false;
    if (a.missingFields.length !== b.missingFields.length) return false;
    for (let i = 0; i < a.missingFields.length; i++) {
      if (a.missingFields[i] !== b.missingFields[i]) return false;
    }
    if (a.blockTitle !== b.blockTitle) return false;
  }
  return true;
}

export function scenarioDiagnosticsEqual(
  a: ScenarioDiagnostic[],
  b: ScenarioDiagnostic[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.severity !== y.severity ||
      x.blockId !== y.blockId ||
      x.code !== y.code ||
      x.message !== y.message
    ) {
      return false;
    }
    const mx = x.meta;
    const my = y.meta;
    if (mx === my) continue;
    if (!mx || !my) return false;
    if (JSON.stringify(mx) !== JSON.stringify(my)) return false;
  }
  return true;
}
