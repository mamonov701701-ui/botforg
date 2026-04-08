import { describe, expect, it } from 'vitest';
import type { SimulatorMessage } from '@/features/simulator/scenarioRunner';
import { getVisiblePreviewHistory } from '@/features/simulator/historyVisibility';

function msg(
  id: string,
  from: SimulatorMessage['from'],
  text: string,
  variant?: 'system' | 'error'
): SimulatorMessage {
  return {
    id,
    from,
    text,
    meta: variant ? { variant } : undefined,
  };
}

describe('getVisiblePreviewHistory', () => {
  it('keeps normal bot/user/system messages and preserves order', () => {
    const history: SimulatorMessage[] = [
      msg('1', 'bot', 'Привет'),
      msg('2', 'bot', '↪ Переход в сценарий: Сценарий B', 'system'),
      msg('3', 'user', 'Ок'),
    ];

    const out = getVisiblePreviewHistory(history);
    expect(out.map(x => x.id)).toEqual(['1', '2', '3']);
  });

  it('hides technical debug markers by text fallback', () => {
    const history: SimulatorMessage[] = [
      msg('b', 'bot', 'execute_block: condition_1'),
      msg('c', 'bot', 'leave_block: condition_1'),
      msg('d', 'bot', 'enter_scenario: 42'),
      msg('e', 'bot', 'trace: c1 -> c2'),
      msg('f', 'bot', 'debug payload blockId=abc'),
      msg('g', 'bot', 'debug payload scenarioId=42'),
      msg('ok', 'bot', 'Обычное сообщение'),
    ];

    const out = getVisiblePreviewHistory(history);
    expect(out.map(x => x.id)).toEqual(['ok']);
  });

  it('does not use structural fields for filtering', () => {
    const history: SimulatorMessage[] = [
      {
        id: 's1',
        from: 'bot',
        text: 'Обычный системный текст',
        meta: { variant: 'system', kind: 'go_to_scenario' },
      },
      {
        id: 's2',
        from: 'bot',
        text: 'Обычный error текст',
        meta: { variant: 'error', kind: 'unknown' },
      },
    ];

    const out = getVisiblePreviewHistory(history);
    expect(out.map(x => x.id)).toEqual(['s1', 's2']);
  });
});
