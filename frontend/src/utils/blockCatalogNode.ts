import type { BlockCatalogItem } from '../types/blocks';

export function catalogBlockRuntimeId(block: BlockCatalogItem): string {
  return block.runtimeBlockId || block.id;
}

export function customBlockNodeSnapshot(block: BlockCatalogItem): Record<string, unknown> {
  if (block.source !== 'custom') return {};
  return {
    customBlockVersionId: block.blockVersionId,
    customBlockStableId: block.stableBlockId,
    customBlockVersion: block.version,
    customBlockTitle: block.title,
    customBlockPassport: block.passport,
    customBlockUserGuide: block.userGuide,
  };
}

export function catalogBlockDefaultSettings(block: BlockCatalogItem): Record<string, unknown> {
  return Object.fromEntries(
    (block.configSchema || []).map(field => [field.name, field.default ?? ''])
  );
}
