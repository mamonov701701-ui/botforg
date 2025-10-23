/**
 * Shared editor types for ReactFlow nodes and edges
 * Compatible with @reactflow/core v11+
 */

import type { Node, Edge } from 'reactflow';

// Base node data structure
export interface BaseNodeData {
  id?: string;
  label: string;
  type: string;
  subtitle?: string;
  borderColor?: string;
  isError?: boolean;
  [key: string]: any;
}

// Base edge data structure
export interface BaseEdgeData {
  label?: string;
  onDelete?: (id: string) => void;
  [key: string]: any;
}

// Typed ReactFlow Node and Edge
export type EditorNode<T extends BaseNodeData = BaseNodeData> = Node<T>;
export type EditorEdge<T extends BaseEdgeData = BaseEdgeData> = Edge<T>;

// Legacy flow types (for compatibility)
export type NodeType =
  | 'message'
  | 'button'
  | 'input'
  | 'condition'
  | 'api'
  | 'payment'
  | 'start'
  | 'default';

export interface FlowNodeData extends BaseNodeData {
  type: NodeType;
  config?: {
    // For payment
    amount?: number;
    currency?: string;
    description?: string;
    success_node_id?: string;
    fail_node_id?: string;
    provider_token?: string;
    payload?: string;
    title?: string;
    photo_url?: string;
    provider?: 'telegram' | 'stripe' | 'cloudpayments';
    success_url?: string;
    fail_url?: string;
    // Other config fields for other node types
    [key: string]: any;
  };
}

export interface FlowNode extends Node<FlowNodeData> {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowEdge extends Edge<BaseEdgeData> {
  id: string;
  source: string;
  target: string;
  type?: string;
  data?: BaseEdgeData;
}

// EditorV2 types
export interface V2NodeData extends BaseNodeData {
  label: string;
}

export interface V2Node extends Node<V2NodeData> {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: V2NodeData;
}

export interface V2Edge extends Edge<BaseEdgeData> {
  id: string;
  source: string;
  target: string;
  markerEnd?: any;
}

// Node specification for editor palette
export interface NodeSpec {
  type: string;
  title: string;
  category: string;
  icon?: string;
  borderColor: string;
}
