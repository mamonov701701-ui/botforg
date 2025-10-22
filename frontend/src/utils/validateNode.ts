import { Node } from 'reactflow';

/**
 * Validates that a node follows the strict BotForg data model
 * All user configuration must be in node.data.settings
 */
export function assertNoUserFieldsOutsideSettings(node: Node): void {
  const allowedDataFields = ['blockId', 'title', 'icon', 'color', 'settings'];
  const dataKeys = Object.keys(node.data || {});
  
  const invalidFields = dataKeys.filter(key => !allowedDataFields.includes(key));
  
  if (invalidFields.length > 0) {
    console.error(
      `Node ${node.id} has invalid fields outside settings:`,
      invalidFields,
      node.data
    );
    throw new Error(
      `Invalid node structure: fields ${invalidFields.join(', ')} should be in settings`
    );
  }
  
  // Ensure settings exists and is an object
  if (!node.data.settings || typeof node.data.settings !== 'object') {
    throw new Error(`Node ${node.id} missing or invalid settings object`);
  }
}

/**
 * Validates all nodes in a flow
 * Returns true if all nodes are valid, false otherwise
 */
export function validateAllNodes(nodes: Node[]): boolean {
  try {
    nodes.forEach(assertNoUserFieldsOutsideSettings);
    return true;
  } catch (error) {
    console.error('Node validation failed:', error);
    return false;
  }
}

/**
 * Logs node structure for debugging
 */
export function debugNodeStructure(node: Node): void {
  console.log('Node Structure:', {
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data,
    style: node.style,
  });
}

