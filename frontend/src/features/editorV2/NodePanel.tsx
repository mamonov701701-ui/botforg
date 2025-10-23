import React, { memo } from 'react';
import { CATEGORY_ORDER, NODE_SPECS } from './constants';

type Props = {
  onDragStart: (e: React.DragEvent, type: string) => void;
};

const NodePanel: React.FC<Props> = ({ onDragStart }) => {
  return (
    <div style={{ padding: 12, height: '100%', overflowY: 'auto' }}>
      {CATEGORY_ORDER.map((cat) => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.6, marginBottom: 8 }}>{cat}</div>
          {(NODE_SPECS.filter((s) => s.category === cat)).map((spec) => (
            <div
              key={spec.type}
              draggable
              onDragStart={(e) => onDragStart(e, spec.type)}
              style={{
                background: '#fff',
                border: `2px solid ${spec.borderColor}`,
                borderRadius: 16,
                padding: 10,
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'grab',
              }}
              title={spec.title}
            >
              <span>{spec.icon ?? '🔹'}</span>
              <span>{spec.title}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default memo(NodePanel);































