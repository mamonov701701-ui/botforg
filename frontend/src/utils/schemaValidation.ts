import { Node } from 'reactflow';
import { BlockCatalogItem, BlockConfigField } from '../types/blocks';

export interface ValidationResult {
  nodeId: string;
  isValid: boolean;
  missingFields: string[];
  blockTitle?: string;
}

/**
 * Validates a single node's settings against its block's configSchema
 */
export function validateNodeSettings(
  node: Node,
  block: BlockCatalogItem | undefined
): ValidationResult {
  if (!block) {
    return {
      nodeId: node.id,
      isValid: false,
      missingFields: ['Block definition not found'],
      blockTitle: node.data.title
    };
  }

  const missingFields: string[] = [];
  const settings = node.data.settings || {};

  // Check each required field from configSchema
  if (block.configSchema) {
    block.configSchema.forEach((field: BlockConfigField) => {
      if (field.required) {
        const value = settings[field.name];
        // Check for empty values (null, undefined, empty string, empty array)
        if (value === null || value === undefined || value === '') {
          missingFields.push(field.label);
        } else if (Array.isArray(value) && value.length === 0) {
          missingFields.push(field.label);
        }
      }
    });
  }

  return {
    nodeId: node.id,
    isValid: missingFields.length === 0,
    missingFields,
    blockTitle: block.title
  };
}

/**
 * Validates all nodes in a flow against the catalog
 */
export function validateAllNodesWithSchema(
  nodes: Node[],
  catalog: BlockCatalogItem[]
): ValidationResult[] {
  return nodes.map(node => {
    const block = catalog.find(b => b.id === node.data.blockId);
    return validateNodeSettings(node, block);
  });
}

/**
 * Checks if any validation results contain errors
 */
export function hasValidationErrors(results: ValidationResult[]): boolean {
  return results.some(r => !r.isValid);
}

