import { describe, expect, it } from 'vitest';
import {
  customBlockConnectionContract,
  normalizedInputPorts,
  normalizedOutputPorts,
  outputMachineKey,
} from '@/utils/customBlockConnections';

describe('custom block connections', () => {
  it('transliterates Russian display names and resolves normalized duplicates', () => {
    expect(outputMachineKey('Текст сообщения')).toBe('tekst_soobshcheniya');
    expect(outputMachineKey('Текст сообщения', ['tekst_soobshcheniya'])).toBe(
      'tekst_soobshcheniya_2'
    );
    expect(outputMachineKey('Успех')).toBe('success');
  });

  it('repairs invalid persisted keys without changing valid stable keys', () => {
    expect(
      normalizedOutputPorts([
        { name: 'Текст сообщения', display_name: 'Текст сообщения' },
        { name: 'tekst_soobshcheniya', display_name: 'Другой результат' },
        { name: 'already_stable', display_name: 'Стабильный' },
      ])
    ).toEqual([
      expect.objectContaining({ name: 'tekst_soobshcheniya' }),
      expect.objectContaining({ name: 'drugoy_rezultat' }),
      expect.objectContaining({ name: 'already_stable' }),
    ]);
  });

  it('generates backend-compatible unique identifiers for human input and output names', () => {
    const outputs = normalizedOutputPorts([
      { display_name: 'Успех' },
      { display_name: 'Текст сообщения' },
    ]);
    const inputs = normalizedInputPorts(
      [{ display_name: 'Текст сообщения' }],
      outputs.map(port => port.name)
    );
    const identifiers = [...inputs, ...outputs].map(port => port.name);
    expect(identifiers).toEqual(['tekst_soobshcheniya_2', 'success', 'tekst_soobshcheniya']);
    expect(identifiers.every(identifier => /^[a-z][a-z0-9_]*$/.test(identifier))).toBe(true);
    expect(new Set(identifiers).size).toBe(identifiers.length);
  });

  it('normalizes legacy and terminal exact-version contracts', () => {
    expect(customBlockConnectionContract({ connection_rules: {} }).outputs[0].name).toBe('success');
    expect(
      customBlockConnectionContract({
        connection_rules: { input_count: 0, output_count: 0 },
        outputs: [],
      })
    ).toEqual({ inputCount: 0, outputs: [] });
  });
});
