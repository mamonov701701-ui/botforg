export const CANONICAL_BLOCK_CODES = [
  'start',
  'message',
  'input',
  'condition',
  'set_variable',
  'end',
] as const;
export const LEGACY_BLOCK_ALIASES: Record<string, string> = {
  variable: 'set_variable',
  button: 'message',
  action: 'action',
};
export const CONDITION_HANDLES = ['condition_yes', 'condition_no'] as const;
export type BlockConnectionContract = {
  incomingMax: number | null;
  outgoingMax: number | null;
  terminal: boolean;
};

export const BLOCK_CONNECTION_CONTRACT: Record<string, BlockConnectionContract> = {
  start: { incomingMax: 0, outgoingMax: 1, terminal: false },
  message: { incomingMax: null, outgoingMax: null, terminal: false },
  input: { incomingMax: null, outgoingMax: null, terminal: false },
  condition: { incomingMax: null, outgoingMax: 2, terminal: false },
  set_variable: { incomingMax: null, outgoingMax: 1, terminal: false },
  end: { incomingMax: null, outgoingMax: 0, terminal: true },
} as const;
export function normalizeBlockCode(code: unknown): string | undefined {
  const value = String(code ?? '')
    .trim()
    .toLowerCase();
  return (CANONICAL_BLOCK_CODES as readonly string[]).includes(value)
    ? value
    : LEGACY_BLOCK_ALIASES[value];
}

export type ScenarioFormat = 'canonical' | 'legacy' | 'mixed_unsafe';
type ContractNode = { data?: Record<string, unknown>; type?: unknown };

function canonicalBlockId(node: ContractNode): string {
  return typeof node.data?.blockId === 'string' ? node.data.blockId.trim().toLowerCase() : '';
}

export function getNodeBlockCode(node: ContractNode | undefined): string {
  if (!node) return '';
  return (
    canonicalBlockId(node) ||
    String(node.data?.type ?? node.type ?? '')
      .trim()
      .toLowerCase()
  );
}

export function classifyScenarioNodes(nodes: readonly ContractNode[]): ScenarioFormat {
  if (nodes.length === 0) return 'legacy';
  let canonical = false;
  let legacy = false;
  for (const node of nodes) {
    if (canonicalBlockId(node)) canonical = true;
    else legacy = true;
  }
  if (canonical && legacy) return 'mixed_unsafe';
  return canonical ? 'canonical' : 'legacy';
}

export function discoverStartNode<T extends ContractNode>(
  nodes: readonly T[]
): {
  node: T | null;
  diagnostic?: 'missing_start' | 'duplicate_start' | 'mixed_unsafe';
} {
  const format = classifyScenarioNodes(nodes);
  if (format === 'mixed_unsafe') return { node: null, diagnostic: 'mixed_unsafe' };
  const starts = nodes.filter(node => canonicalBlockId(node) === 'start');
  if (format === 'canonical') {
    if (starts.length === 1) return { node: starts[0] };
    return { node: null, diagnostic: starts.length === 0 ? 'missing_start' : 'duplicate_start' };
  }
  const legacyStart = nodes.find(
    node => node.data?.is_start === true || getNodeBlockCode(node) === 'start'
  );
  return { node: legacyStart ?? nodes[0] ?? null };
}

export function connectionContractViolation(
  sourceCode: string,
  targetCode: string,
  existingOutgoingCount: number
): 'end_outgoing' | 'start_incoming' | 'start_outgoing' | undefined {
  const source = BLOCK_CONNECTION_CONTRACT[sourceCode as keyof typeof BLOCK_CONNECTION_CONTRACT];
  const target = BLOCK_CONNECTION_CONTRACT[targetCode as keyof typeof BLOCK_CONNECTION_CONTRACT];
  if (source?.terminal || source?.outgoingMax === 0) return 'end_outgoing';
  if (target?.incomingMax === 0) return 'start_incoming';
  if (source?.outgoingMax != null && existingOutgoingCount >= source.outgoingMax) {
    return sourceCode === 'start' ? 'start_outgoing' : undefined;
  }
  return undefined;
}
