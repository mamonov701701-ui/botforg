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

export function resolveNodeCatalogBlock(
  catalog: BlockCatalogItem[],
  nodeData: Record<string, any> | undefined
): BlockCatalogItem | undefined {
  if (!nodeData) return undefined;
  const versionId = Number(nodeData.customBlockVersionId);
  if (Number.isInteger(versionId) && versionId > 0) {
    const exact = catalog.find(
      block => block.source === 'custom' && Number(block.blockVersionId) === versionId
    );
    if (exact) return exact;

    const passport = nodeData.customBlockPassport;
    const stableBlockId = String(nodeData.customBlockStableId || passport?.stable_block_id || '');
    const version = Number(nodeData.customBlockVersion || passport?.version);
    if (!passport || !stableBlockId || !Number.isInteger(version) || version < 1) return undefined;
    const configSchema = Array.isArray(passport.config_schema)
      ? passport.config_schema
      : Array.isArray(passport.parameters)
        ? passport.parameters
        : [];
    return {
      id: `custom:${stableBlockId}:v${version}`,
      title: String(nodeData.customBlockTitle || passport.title_ru || 'Пользовательский блок'),
      category: 'custom',
      description: String(passport.description || ''),
      icon: String(nodeData.icon || '🧩'),
      color: String(nodeData.color || '#7c3aed'),
      planAccess: ['free', 'pro', 'enterprise'],
      permissions: ['owner', 'admin', 'manager_template', 'developer', 'support', 'viewer'],
      configSchema,
      source: 'custom',
      stableBlockId,
      blockVersionId: versionId,
      version,
      runtimeBlockId: String(nodeData.blockId || 'custom'),
      passport,
      userGuide: nodeData.customBlockUserGuide || {},
    };
  }
  return catalog.find(block => block.id === nodeData.blockId);
}

export function catalogBlockDefaultSettings(block: BlockCatalogItem): Record<string, unknown> {
  return Object.fromEntries(
    (block.configSchema || []).map(field => [field.name, field.default ?? ''])
  );
}
