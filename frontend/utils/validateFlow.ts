/**
 * Flow validation utilities
 */

import type { FlowNode, FlowEdge } from '@/types/editor';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateFlow(nodes: FlowNode[], edges: FlowEdge[]): ValidationResult {
  const errors: string[] = [];

  // Check if there are nodes
  if (!nodes || nodes.length === 0) {
    errors.push('Flow must have at least one node');
  }

  // Check for duplicate node IDs
  const nodeIds = new Set<string>();
  nodes.forEach(node => {
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate node ID: ${node.id}`);
    }
    nodeIds.add(node.id);
  });

  // Check if all edges reference valid nodes
  edges.forEach(edge => {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge references non-existent source node: ${edge.source}`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge references non-existent target node: ${edge.target}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
