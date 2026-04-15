import type { Node } from 'reactflow';

export interface XYPosition {
  x: number;
  y: number;
}

interface PlacementOptions {
  selectedNode?: Node;
  nodes: Node[];
  fallbackCenter: XYPosition;
}

const GRID_STEP = 40;
const NODE_WIDTH = 260;
const NODE_HEIGHT = 160;
const MIN_DISTANCE_X = NODE_WIDTH + 20;
const MIN_DISTANCE_Y = NODE_HEIGHT + 20;

function toGrid(value: number): number {
  return Math.round(value / GRID_STEP) * GRID_STEP;
}

function isPositionOccupied(position: XYPosition, nodes: Node[]): boolean {
  return nodes.some(node => {
    const dx = Math.abs((node.position?.x ?? 0) - position.x);
    const dy = Math.abs((node.position?.y ?? 0) - position.y);
    return dx < MIN_DISTANCE_X && dy < MIN_DISTANCE_Y;
  });
}

function findNearestFreePosition(preferred: XYPosition, nodes: Node[]): XYPosition {
  const origin = { x: toGrid(preferred.x), y: toGrid(preferred.y) };
  if (!isPositionOccupied(origin, nodes)) return origin;

  const maxRadius = 10;
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        const candidate = {
          x: origin.x + dx * GRID_STEP,
          y: origin.y + dy * GRID_STEP,
        };
        if (!isPositionOccupied(candidate, nodes)) {
          return candidate;
        }
      }
    }
  }

  return {
    x: origin.x + maxRadius * GRID_STEP,
    y: origin.y + maxRadius * GRID_STEP,
  };
}

function getAutoChainAnchor(selectedNode?: Node): XYPosition | null {
  if (!selectedNode) return null;
  const blockId = String(selectedNode.data?.blockId || '').toLowerCase();
  const x = selectedNode.position?.x ?? 0;
  const y = selectedNode.position?.y ?? 0;

  if (blockId === 'condition') {
    return { x: x + 360, y: y };
  }
  if (blockId === 'input') {
    return { x: x + 320, y: y + 120 };
  }
  return { x: x + 320, y };
}

export function resolveNewNodePosition(options: PlacementOptions): XYPosition {
  const preferred = getAutoChainAnchor(options.selectedNode) ?? options.fallbackCenter;
  return findNearestFreePosition(preferred, options.nodes);
}
