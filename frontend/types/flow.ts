export type NodeType = 'message' | 'button' | 'input' | 'condition' | 'api' | 'payment';

export type NodeData = {
  type: NodeType;
  label: string;
  config?: {
    // Для payment
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
    // ...другие поля для других типов
  };
};

export type FlowNode = {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
};

export type FlowEdge = {
  id: string;
  source: string;
  target: string;
  type?: string;
  data?: Record<string, any>;
}; 