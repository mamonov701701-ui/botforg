import React from 'react';
import { Handle, Position } from 'reactflow';

export interface CustomBlockNodeRoute {
  key: string;
  label: string;
}

const HEADER_HEIGHT = 52;
const ROUTES_OFFSET = 24;
const ROUTE_ROW_HEIGHT = 32;
const NODE_VERTICAL_PADDING = 32;
const OUTPUT_HANDLE_RIGHT = -24;

export function customBlockNodeLayout(outputCount: number): {
  headerHeight: number;
  routesOffset: number;
  routeRowHeight: number;
  minHeight: number;
  outputHandleRight: number;
  titleMaxLines: number;
} {
  const count = Math.max(0, Math.min(32, Math.trunc(outputCount)));
  return {
    headerHeight: HEADER_HEIGHT,
    routesOffset: count > 0 ? ROUTES_OFFSET : 0,
    routeRowHeight: ROUTE_ROW_HEIGHT,
    outputHandleRight: OUTPUT_HANDLE_RIGHT,
    titleMaxLines: 2,
    minHeight: Math.max(
      72,
      NODE_VERTICAL_PADDING +
        HEADER_HEIGHT +
        (count > 0 ? ROUTES_OFFSET : 0) +
        count * ROUTE_ROW_HEIGHT
    ),
  };
}

interface Props {
  title: string;
  icon?: string;
  inputCount: 0 | 1;
  routes: CustomBlockNodeRoute[];
}

/** Keeps the immutable custom block title and its versioned output routes in separate zones. */
export const CustomBlockNodeContent: React.FC<Props> = ({ title, icon, inputCount, routes }) => {
  const layout = customBlockNodeLayout(routes.length);
  return (
    <div
      data-testid="custom-block-node-layout"
      style={{ display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0 }}
    >
      {inputCount === 1 ? (
        <Handle
          id="top"
          type="target"
          position={Position.Top}
          isConnectable={true}
          style={{
            background: '#00ff00',
            width: 19.4,
            height: 19.4,
            border: '3px solid #fff',
            top: -9.7,
            zIndex: 10000,
          }}
          className="react-flow__handle-visible"
        />
      ) : null}

      <div
        data-testid="custom-block-title-zone"
        style={{
          height: layout.headerHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: icon ? 12 : 0,
          width: '100%',
          minWidth: 0,
          padding: '0 8px',
          boxSizing: 'border-box',
        }}
      >
        {icon ? <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>{icon}</span> : null}
        <div
          style={{
            fontWeight: 800,
            fontSize: 18,
            lineHeight: 1.3,
            textAlign: 'center',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: layout.titleMaxLines,
            overflow: 'hidden',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
            whiteSpace: 'normal',
            flex: 1,
            minWidth: 0,
          }}
          title={title}
        >
          {title}
        </div>
      </div>

      {routes.length > 0 ? (
        <div
          data-testid="custom-block-routes-zone"
          style={{
            marginTop: layout.routesOffset / 2,
            paddingTop: layout.routesOffset / 2,
            borderTop: '2px solid rgba(124, 58, 237, 0.15)',
            marginLeft: -18,
            marginRight: -18,
            width: 'calc(100% + 36px)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {routes.map(route => (
            <div
              key={route.key}
              data-route-key={route.key}
              title={route.label}
              style={{
                position: 'relative',
                height: layout.routeRowHeight,
                minHeight: layout.routeRowHeight,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                padding: '0 24px 0 12px',
                boxSizing: 'border-box',
                color: '#6d28d9',
                fontSize: 12,
                fontWeight: 600,
                overflow: 'visible',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {route.label}
              </span>
              <Handle
                id={route.key}
                type="source"
                position={Position.Right}
                isConnectable={true}
                title={`${route.label} (${route.key})`}
                style={{
                  top: '50%',
                  right: layout.outputHandleRight,
                  transform: 'translateY(-50%)',
                  background: '#7c3aed',
                  width: 19.4,
                  height: 19.4,
                  border: '3px solid #fff',
                  zIndex: 10001,
                  position: 'absolute',
                }}
                className="react-flow__handle-visible"
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
