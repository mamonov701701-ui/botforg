import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as scenarioAPI from '@/api/scenarios';
import { useScenarioStore } from '@/stores/scenarioStore';

vi.mock('@/api/scenarios', () => ({
  __esModule: true,
  ...vi.importActual<any>('@/api/scenarios'),
  updateScenario: vi.fn().mockResolvedValue({
    id: 1,
    name: 'Test',
    icon: 'X',
    content: { nodes: [], edges: [] },
  }),
}));

describe('scenarioStore synchronization and autosave', () => {
  beforeEach(() => {
    // сбрасываем состояние стора перед каждым тестом
    useScenarioStore.setState(
      {
        currentBotId: 1,
        scenarios: [],
        currentScenarioId: 1,
        currentState: {
          id: 1,
          name: 'Test',
          icon: 'X',
          nodes: [],
          edges: [],
          isDirty: false,
          hasValidationErrors: false,
        },
      } as any,
      true
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    (scenarioAPI.updateScenario as any).mockClear();
  });

  it('importFromJson updates currentState and marks scenario dirty', () => {
    const store = useScenarioStore.getState();
    const nodes = [{ id: 'n1', type: 'default', position: { x: 0, y: 0 }, data: {} } as any];
    const edges: any[] = [];

    store.importFromJson(nodes as any, edges as any);

    const updated = useScenarioStore.getState().currentState!;
    expect(updated.nodes).toEqual(nodes);
    expect(updated.edges).toEqual(edges);
    expect(updated.isDirty).toBe(true);
  });

  it('autosave triggers after debounce when enabled', async () => {
    vi.useFakeTimers();

    const store = useScenarioStore.getState();
    store.enableAutoSave();

    const nodes = [{ id: 'n1', type: 'default', position: { x: 0, y: 0 }, data: {} } as any];
    const edges: any[] = [];

    store.importFromJson(nodes as any, edges as any);

    // до истечения 5 секунд запрос не отправляется
    vi.advanceTimersByTime(4900);
    expect(scenarioAPI.updateScenario as any).not.toHaveBeenCalled();

    // после истечения debounce автосейв вызывает updateScenario
    vi.advanceTimersByTime(200);
    await Promise.resolve(); // дождаться завершения промисов

    expect(scenarioAPI.updateScenario).toHaveBeenCalledTimes(1);

    const finalState = useScenarioStore.getState().currentState!;
    expect(finalState.isDirty).toBe(false);
  });
});
