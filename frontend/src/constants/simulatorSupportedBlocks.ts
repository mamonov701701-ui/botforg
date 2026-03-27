/**
 * Блоки, которые обрабатывает scenarioRunner (предпросмотр).
 * Должны совпадать с getNodeKind в scenarioRunner.ts.
 */
export const SIMULATOR_SUPPORTED_BLOCK_IDS = [
  'start',
  'message',
  'input',
  'condition',
  'action',
  'go_to_scenario',
  'variable',
  'wait',
] as const;

export type SimulatorSupportedBlockId = (typeof SIMULATOR_SUPPORTED_BLOCK_IDS)[number];

const ALLOWED = new Set<string>(SIMULATOR_SUPPORTED_BLOCK_IDS);

export function isSimulatorSupportedBlockId(blockId: string): boolean {
  return ALLOWED.has(blockId);
}
