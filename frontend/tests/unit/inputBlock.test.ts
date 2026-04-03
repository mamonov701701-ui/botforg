import { describe, it, expect } from 'vitest';
import {
  migrateInputNodeSettings,
  validateInputAnswer,
  validateInputVariableKey,
} from '@/utils/inputBlock';

describe('inputBlock', () => {
  it('migrates legacy keys', () => {
    const m = migrateInputNodeSettings({ text: 'Hi', variableName: 'x_y' });
    expect(m.question_text).toBe('Hi');
    expect(m.variable_key).toBe('x_y');
  });

  it('rejects invalid variable key', () => {
    expect(validateInputVariableKey('Bad')).toBeTruthy();
    expect(validateInputVariableKey('good_key')).toBeUndefined();
  });

  it('validates min_length', () => {
    const r = validateInputAnswer(
      {
        question_text: 'q',
        variable_key: 'a',
        validation: { type: 'string', min_length: 3 },
        required: true,
      },
      'ab'
    );
    expect(r.ok).toBe(false);
  });
});
