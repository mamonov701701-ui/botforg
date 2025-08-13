import { FlowNode, FlowEdge } from '@/types/flow';

export type FlowValidationError = {
  type: 'node' | 'edge';
  id: string;
  message: string;
};

export function validateFlow(nodes: FlowNode[], edges: FlowEdge[]): FlowValidationError[] {
  const errors: FlowValidationError[] = [];
  if (!nodes.length) {
    errors.push({ type: 'node', id: '', message: 'Нет ни одного блока' });
  }
  // Дублирующиеся id
  const nodeIds = nodes.map(n => n.id);
  const edgeIds = edges.map(e => e.id);
  const nodeIdSet = new Set(nodeIds);
  const edgeIdSet = new Set(edgeIds);
  if (nodeIdSet.size !== nodeIds.length) {
    const dups = nodeIds.filter((id, i) => nodeIds.indexOf(id) !== i);
    dups.forEach(id => errors.push({ type: 'node', id, message: 'Дублирующийся id блока' }));
  }
  if (edgeIdSet.size !== edgeIds.length) {
    const dups = edgeIds.filter((id, i) => edgeIds.indexOf(id) !== i);
    dups.forEach(id => errors.push({ type: 'edge', id, message: 'Дублирующийся id связи' }));
  }
  // Нет label
  nodes.forEach(n => {
    if (!n.data.label || !n.data.label.trim()) {
      errors.push({ type: 'node', id: n.id, message: 'Пустое название блока' });
    }
  });
  // Висячие стрелки
  edges.forEach(e => {
    if (!nodeIds.includes(e.source) || !nodeIds.includes(e.target)) {
      errors.push({ type: 'edge', id: e.id, message: 'Связь с несуществующим блоком' });
    }
  });
  // У каждого блока (кроме конечных) есть хотя бы один исходящий edge
  nodes.forEach(n => {
    const outgoing = edges.filter(e => e.source === n.id);
    const incoming = edges.filter(e => e.target === n.id);
    if (outgoing.length === 0 && incoming.length > 0) {
      // Конечный блок — ок
      return;
    }
    if (outgoing.length === 0 && incoming.length === 0 && nodes.length > 1) {
      errors.push({ type: 'node', id: n.id, message: 'Блок не связан ни с одним другим' });
    }
    if (outgoing.length === 0 && incoming.length > 0 && nodes.length > 1) {
      // Конечный блок — ок
      return;
    }
    if (outgoing.length === 0 && nodes.length > 1) {
      errors.push({ type: 'node', id: n.id, message: 'Нет исходящих переходов' });
    }
  });
  return errors;
} 