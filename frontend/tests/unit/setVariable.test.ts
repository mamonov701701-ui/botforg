import { describe, expect, it } from 'vitest';
import {
  convertSetVariableValue,
  normalizeSetVariableSettings,
  validateSetVariableSettings,
} from '@/utils/setVariable';

describe('Set Variable contract', () => {
  it('converts supported value types deterministically', () => {
    expect(
      convertSetVariableValue(
        normalizeSetVariableSettings({ key: 'n', value: '2.5', value_type: 'number' })!
      )
    ).toBe(2.5);
    expect(
      convertSetVariableValue(
        normalizeSetVariableSettings({ key: 'ok', value: 'false', value_type: 'boolean' })!
      )
    ).toBe(false);
    expect(
      convertSetVariableValue(
        normalizeSetVariableSettings({ key: 'data', value: '{"x":1}', value_type: 'json' })!
      )
    ).toEqual({ x: 1 });
  });

  it('rejects invalid key and values and reads only safe legacy aliases', () => {
    expect(validateSetVariableSettings({ key: 'Bad key', value: 'x' })).toContain(
      'lower_snake_case'
    );
    expect(
      validateSetVariableSettings({ key: 'flag', value: 'yes', value_type: 'boolean' })
    ).toContain('true');
    expect(
      validateSetVariableSettings({ key: 'data', value: '{bad', value_type: 'json' })
    ).toContain('JSON');
    expect(normalizeSetVariableSettings({ name: 'legacy', value: 'x' }, 'variable')?.key).toBe(
      'legacy'
    );
    expect(
      normalizeSetVariableSettings({ setVariable: 'x', value: '1', text: 'message' }, 'action')
    ).toBeNull();
  });
});
