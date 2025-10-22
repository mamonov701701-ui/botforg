import { Handle, Position, NodeProps } from 'reactflow';
import { Play, MessageSquare, Zap, GitBranch, Cloud, Square } from 'lucide-react';
import { BRAND_AMBER, DANGER_RED } from '@/ui/tokens';

const TYPE_BORDER = {
  default: BRAND_AMBER,
  start:   '#4A90E2',
  message: '#3498DB',
  action:  '#2ECC71',
  condition: '#9B59B6',
  api:     '#00BCD4',
  end:     DANGER_RED,
} as const;

const TYPE_ICON = {
  default: Square,
  start:   Play,
  message: MessageSquare,
  action:  Zap,
  condition: GitBranch,
  api:     Cloud,
  end:     Square,
} as const;

type Data = { type?: keyof typeof TYPE_BORDER; label?: string; subtitle?: string };

export default function NodeCard({ data }: NodeProps<Data>) {
  const type = data?.type ?? 'default';
  const border = TYPE_BORDER[type];
  const Icon = TYPE_ICON[type];

  return (
    <div
      className="node-card"
      style={{
        position: 'relative',
        overflow: 'visible',
        border: `3px solid ${border}`,
        borderRadius: 14,
        background: '#fff',
        width: 240,
        minHeight: 96,
        padding: '14px 14px 12px',
        display: 'grid',
        gridTemplateColumns: '22px 1fr',
        columnGap: 10,
        rowGap: 4,
        boxShadow: '0 6px 18px rgba(0,0,0,.14)',
        color: '#0A1B3D',
      }}
    >
      <Icon size={18} strokeWidth={2.2} color={border} />
      <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{data?.label ?? 'Блок'}</div>
      <div />
      <div style={{ fontSize: 12, opacity: 0.72, lineHeight: 1.1 }}>{data?.subtitle ?? ''}</div>

      {/* 4 пина — строго по центрам сторон. Видимость контролируем в CSS */}
      <Handle id="top"    type="target" position={Position.Top}    style={{ left:'50%', top:0,    transform:'translate(-50%,-50%)' }} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={{ left:'50%', bottom:0, transform:'translate(-50%, 50%)' }} />
      <Handle id="left"   type="target" position={Position.Left}   style={{ top:'50%',  left:0,   transform:'translate(-50%,-50%)' }} />
      <Handle id="right"  type="source" position={Position.Right}  style={{ top:'50%',  right:0,  transform:'translate(50%, -50%)' }} />
    </div>
  );
}