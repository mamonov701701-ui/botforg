import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { NODE_SPECS } from './constants';

type Data = { label: string; borderColor?: string };

const CustomNode: React.FC<NodeProps<Data>> = ({ data, type }) => {
  const label = data?.label ?? 'Блок';
  const spec = NODE_SPECS.find(s => s.type === (type as string));
  const color = data?.borderColor || spec?.borderColor || '#2f6dff';
  return (
    <div
      className="rounded-md px-3 py-2 min-w-[160px] flex items-center gap-2"
      style={{ boxShadow: 'none', background: '#fff', border: `2px solid ${color}` }}
    >
      <span className="w-4 h-4 rounded-sm" style={{ background: color }} />
      <div className="text-sm text-gray-800 font-medium truncate" title={label}>{label}</div>
      <Handle type="target" position={Position.Left} className="w-2 h-2 !bg-gray-600" />
      <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-gray-600" />
    </div>
  );
};

export default CustomNode;


