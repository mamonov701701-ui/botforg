import React, { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  ConnectionMode,
  MarkerType,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Connection,
  Edge,
  Node,
  useReactFlow,
  Handle,
  Position,
  ConnectionLineComponentProps,
  getBezierPath,
  useEdgesState,
  useNodesState,
  NodeChange,
  EdgeChange,
} from 'reactflow';
import { nanoid } from 'nanoid';
import 'reactflow/dist/style.css';
import './flow.css';
import EditorControls from './EditorControls';
import Toolbar from './Toolbar';
import BlockSettingsPanel from './BlockSettingsPanel';
import CustomEdge from './CustomEdge';
import ToastContainer from './ToastContainer';
import { useEditorStore } from '../../stores/editorStore';
import { useScenarioStore } from '../../stores/scenarioStore';
import { BlockCatalogItem } from '../../types/blocks';
import { validateAllNodes, debugNodeStructure } from '../../utils/validateNode';
import { canAccessBlock, getAccessDeniedMessage, logAccessDenied } from '../../utils/accessControl';
import { useValidationStore } from '../../stores/validationStore';
import { validateAllNodesWithSchema, hasValidationErrors } from '../../utils/schemaValidation';
import ValidationModal from './ValidationModal';
import ExportConfirmModal from './ExportConfirmModal';
import BlockLibraryModal from './BlockLibraryModal';

// Connection line component - временная линия при создании соединения
const ConnectionLine = ({
  fromX,
  fromY,
  toX,
  toY,
  fromPosition,
  toPosition,
}: ConnectionLineComponentProps) => {
  // Координаты уже в правильном пространстве viewport, используем getBezierPath
  const [edgePath] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
  });

  return (
    <g className="react-flow__connection" data-connection-line="true">
      <path
        d={edgePath}
        className="connection-line-path"
        stroke="#FFB300"
        strokeWidth={4}
        fill="none"
        strokeDasharray="5,5"
        style={{
          animation: 'dashdraw 0.5s linear infinite',
        }}
      />
    </g>
  );
};

// КРИТИЧНО: CustomNode должен быть определен ВНЕ компонента InnerEditor,
// чтобы не пересоздаваться при каждом рендере
const CustomNode = React.memo(({ data, id, selected }: any) => {
  const title = data?.title ?? 'Блок';
  const isStartNode = data?.blockId === 'start';
  const isMessageNode = data?.blockId === 'message';
  const borderColor = data?.color || '#2f6dff';

  // Получаем кнопки для блока message
  const buttons = isMessageNode && data?.settings?.buttons ? data.settings.buttons : [];
  const hasButtons = buttons.length > 0;

  // Get validation status - мемоизированный селектор
  // Используем useMemo чтобы селектор не пересоздавался
  const validationSelector = useMemo(
    () => (state: { getNodeValidation: (id: string) => any }) => state.getNodeValidation(id),
    [id]
  );
  const validation = useValidationStore(validationSelector);
  const isInvalid = validation && !validation.isValid;

  return (
    <div
      style={{
        background: '#fff',
        border: `4px solid ${isInvalid ? '#ef4444' : borderColor}`,
        borderRadius: 32,
        padding: '16px 20px',
        minWidth: 264,
        maxWidth: 400,
        minHeight: 72,
        color: '#000',
        position: 'relative',
        boxShadow: selected
          ? borderColor && borderColor.length === 7
            ? `0 8px 24px rgba(${parseInt(borderColor.slice(1, 3), 16)}, ${parseInt(borderColor.slice(3, 5), 16)}, ${parseInt(borderColor.slice(5, 7), 16)}, 0.4)`
            : '0 8px 24px rgba(47, 109, 255, 0.4)'
          : '0 4px 12px rgba(0, 0, 0, 0.15)',
        transition: 'all 0.2s ease',
        transform: selected ? 'scale(1.02)' : 'scale(1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'visible' /* Разрешаем handles выходить за границы */,
        boxSizing: 'border-box',
        zIndex: 1,
        pointerEvents: 'all' /* Разрешаем события для блока и handles */,
        /* Убираем isolation: 'isolate' чтобы handles могли быть выше границы */
      }}
    >
      {/* Для стартового блока - только 2 Handle (сверху и снизу) */}
      {isStartNode ? (
        <>
          {/* Top - входящий (зелёный) */}
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
              transition: 'all 0.2s ease',
            }}
            className="react-flow__handle-visible"
          />
          {/* Bottom - исходящий (оранжевый) */}
          <Handle
            id="bottom"
            type="source"
            position={Position.Bottom}
            isConnectable={true}
            style={{
              background: '#FFB300',
              width: 19.4,
              height: 19.4,
              border: '3px solid #fff',
              bottom: -9.7,
              zIndex: 10000,
              transition: 'all 0.2s ease',
            }}
            className="react-flow__handle-visible"
          />
        </>
      ) : isMessageNode && hasButtons ? (
        /* Для блока message с кнопками - только входной хэндл сверху,
           выходы будут от самих кнопок */
        <>
          {/* Top - входящий (зелёный) */}
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
              transition: 'all 0.2s ease',
            }}
            className="react-flow__handle-visible"
          />
        </>
      ) : (
        /* Для остальных блоков - 4 Handle (со всех сторон)
           Зелёный = входящий (target), Оранжевый = исходящий (source) */
        <>
          {/* Top - входящий (зелёный) */}
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
              transition: 'all 0.2s ease',
            }}
            className="react-flow__handle-visible"
          />

          {/* Right - исходящий (оранжевый) */}
          <Handle
            id="right"
            type="source"
            position={Position.Right}
            isConnectable={true}
            style={{
              background: '#FFB300',
              width: 19.4,
              height: 19.4,
              border: '3px solid #fff',
              right: -9.7,
              zIndex: 10000,
              transition: 'all 0.2s ease',
            }}
            className="react-flow__handle-visible"
          />

          {/* Bottom - исходящий (оранжевый) */}
          <Handle
            id="bottom"
            type="source"
            position={Position.Bottom}
            isConnectable={true}
            style={{
              background: '#FFB300',
              width: 19.4,
              height: 19.4,
              border: '3px solid #fff',
              bottom: -9.7,
              zIndex: 10000,
              transition: 'all 0.2s ease',
            }}
            className="react-flow__handle-visible"
          />

          {/* Left - входящий (зелёный) */}
          <Handle
            id="left"
            type="target"
            position={Position.Left}
            isConnectable={true}
            style={{
              background: '#00ff00',
              width: 19.4,
              height: 19.4,
              border: '3px solid #fff',
              left: -9.7,
              zIndex: 10000,
              transition: 'all 0.2s ease',
            }}
            className="react-flow__handle-visible"
          />
        </>
      )}

      {/* Validation error badge */}
      {isInvalid && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            background: '#ef4444',
            borderRadius: '50%',
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
          }}
          title={`Заполните обязательные поля: ${validation.missingFields.join(', ')}`}
        >
          ⚠️
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: data?.icon ? 12 : 0,
          width: '100%',
          padding: '0 8px',
          boxSizing: 'border-box',
        }}
      >
        {/* Иконка блока */}
        {data?.icon && (
          <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>{data.icon}</span>
        )}
        <div
          style={{
            fontWeight: 800,
            fontSize: '18px',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
            lineHeight: 1.3,
          }}
          title={title}
        >
          {title}
        </div>
      </div>

      {/* Превью медиа для блока message - сначала медиа */}
      {isMessageNode &&
        data?.settings?.mediaList &&
        Array.isArray(data.settings.mediaList) &&
        data.settings.mediaList.length > 0 && (
          <div
            style={{
              marginTop: 8,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              justifyContent: 'center',
              alignItems: 'center',
              maxWidth: '100%',
            }}
          >
            {data.settings.mediaList.map((mediaItem: any, index: number) => {
              const mediaType = mediaItem?.type || 'image';
              const mediaUrl = mediaItem?.url || '';

              if (!mediaUrl) return null;

              if (mediaType === 'image' || mediaType === 'gif') {
                return (
                  <img
                    key={index}
                    src={mediaUrl}
                    alt={`Медиа ${index + 1}`}
                    style={{
                      maxWidth: '200px',
                      maxHeight: '100px',
                      width: 'auto',
                      height: 'auto',
                      objectFit: 'contain',
                      borderRadius: 6,
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                    }}
                    onError={e => {
                      // Если изображение не загрузилось, показываем иконку
                      e.currentTarget.style.display = 'none';
                      const parent = e.currentTarget.parentElement;
                      if (parent && !parent.querySelector(`.media-fallback-icon-${index}`)) {
                        const icon = document.createElement('div');
                        icon.className = `media-fallback-icon-${index}`;
                        icon.style.cssText =
                          'max-width: 200px; max-height: 100px; width: auto; height: auto; display: flex; align-items: center; justify-content: center; font-size: 32px; color: #3b82f6; background: rgba(59, 130, 246, 0.1); border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3);';
                        icon.textContent = '🖼️';
                        parent.appendChild(icon);
                      }
                    }}
                  />
                );
              }

              if (mediaType === 'video') {
                return (
                  <div
                    key={index}
                    style={{
                      width: 200,
                      height: 100,
                      borderRadius: 6,
                      background: 'rgba(59, 130, 246, 0.2)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 32,
                      color: '#3b82f6',
                    }}
                  >
                    ▶
                  </div>
                );
              }

              return null;
            })}
          </div>
        )}

      {/* Preview текста сообщения - под миниатюрой */}
      {isMessageNode && data?.settings?.text && (
        <div
          style={{
            marginTop:
              data?.settings?.mediaList &&
              Array.isArray(data.settings.mediaList) &&
              data.settings.mediaList.length > 0
                ? 8
                : 6,
            fontSize: 12,
            color: '#1f2937',
            lineHeight: 1.5,
            maxHeight: '48px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            wordBreak: 'break-word',
            opacity: 0.85,
            fontWeight: 400,
          }}
          title={data.settings.text}
        >
          {data.settings.text}
        </div>
      )}

      {/* Кнопки для блока message с хэндлами на границе блока */}
      {hasButtons && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: '2px solid rgba(0, 0, 0, 0.08)',
            marginLeft: -18,
            marginRight: -18,
            paddingLeft: 0,
            paddingRight: 0,
            width: 'calc(100% + 36px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            position: 'relative',
          }}
        >
          {buttons.slice(0, 5).map((button: any, index: number) => (
            <div
              key={index}
              style={{
                position: 'relative',
                display: 'block',
                width: '100%',
                minWidth: 0,
                background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
                border: 'none',
                borderRadius: '10px',
                padding: '12px 20px',
                fontSize: 14,
                fontWeight: 600,
                color: '#ffffff',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.1)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'center',
                opacity: 1,
                boxSizing: 'border-box',
                zIndex: 1,
                pointerEvents: 'auto',
              }}
              title={button.label || `Кнопка ${index + 1}`}
              onMouseEnter={e => {
                e.currentTarget.style.background =
                  'linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)';
                e.currentTarget.style.boxShadow =
                  '0 4px 8px rgba(0, 0, 0, 0.2), 0 2px 4px rgba(37, 99, 235, 0.4)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background =
                  'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)';
                e.currentTarget.style.boxShadow =
                  '0 2px 4px rgba(0, 0, 0, 0.15), 0 1px 2px rgba(0, 0, 0, 0.1)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  display: 'block',
                }}
              >
                {button.label || `Кнопка ${index + 1}`}
              </span>

              {/* Хэндл для каждой кнопки - на ПРАВОЙ ГРАНИЦЕ БЛОКА NODE */}
              <Handle
                id={`button_${index}`}
                type="source"
                position={Position.Right}
                isConnectable={true}
                style={{
                  background: '#FFB300',
                  width: 19.4,
                  height: 19.4,
                  border: '3px solid #fff',
                  right: -11.7,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  zIndex: 10001,
                  position: 'absolute',
                  boxShadow: '0 2px 6px rgba(255, 179, 0, 0.5)',
                  cursor: 'crosshair',
                }}
                className="react-flow__handle-visible"
              />
            </div>
          ))}
          {buttons.length > 5 && (
            <div
              style={{
                fontSize: 11,
                color: '#6b7280',
                textAlign: 'center',
                padding: '4px 0',
                fontWeight: 500,
              }}
            >
              +{buttons.length - 5} ещё
            </div>
          )}
        </div>
      )}
      {/* Visual shows icon + title, no settings content */}
    </div>
  );
});

// Устанавливаем displayName для отладки
CustomNode.displayName = 'CustomNode';

function InnerEditor() {
  const {
    nodes: zustandNodes,
    edges: zustandEdges,
    setNodes: setZustandNodes,
    setEdges: setZustandEdges,
    catalog,
    plan,
    role,
    showToast,
    loadCatalog,
  } = useEditorStore();

  // Scenario store для работы со сценариями
  const syncFromEditor = useScenarioStore(state => state.syncFromEditor);
  const scenarios = useScenarioStore(state => state.scenarios);

  // КРИТИЧНО: nodes и edges через useNodesState и useEdgesState для правильной работы ReactFlow
  // React Flow управляет своим внутренним state, Zustand используется ТОЛЬКО для добавления новых блоков
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState([]);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState([]);

  // Ref для отслеживания последних ID из Zustand (для добавления новых узлов)
  const lastZustandNodeIdsRef = useRef<Set<string>>(new Set());
  const lastZustandEdgeIdsRef = useRef<Set<string>>(new Set());

  // Синхронизация nodes: Zustand -> React Flow
  // При загрузке сценария полностью заменяем nodes, при изменениях добавляем только новые
  useEffect(() => {
    // Пропускаем синхронизацию при начальной загрузке (она обрабатывается отдельным useEffect)
    if (isInitialLoadRef.current) {
      return;
    }

    const currentZustandIds = new Set(zustandNodes.map(n => n.id));
    const lastIds = lastZustandNodeIdsRef.current;

    setNodes(currentNodes => {
      const currentNodeIds = new Set(currentNodes.map(n => n.id));
      const zustandNodeIds = new Set(zustandNodes.map(n => n.id));

      // Если React Flow пустой, а Zustand не пустой - полная загрузка
      if (currentNodes.length === 0 && zustandNodes.length > 0) {
        // Принудительно исправляем видимость после загрузки
        const fixVisibility = () => {
          zustandNodes.forEach(node => {
            const nodeElement = document.querySelector(`[data-id="${node.id}"]`) as HTMLElement;
            if (nodeElement) {
              nodeElement.style.setProperty('visibility', 'visible', 'important');
              nodeElement.style.setProperty('opacity', '1', 'important');
              nodeElement.style.setProperty('display', 'block', 'important');
              const innerDiv = nodeElement.querySelector('div:first-child') as HTMLElement;
              if (innerDiv) {
                innerDiv.style.setProperty('visibility', 'visible', 'important');
                innerDiv.style.setProperty('opacity', '1', 'important');
                innerDiv.style.setProperty('display', 'flex', 'important');
              }
            }
          });
        };
        setTimeout(fixVisibility, 50);
        setTimeout(fixVisibility, 100);
        setTimeout(fixVisibility, 200);
        setTimeout(fixVisibility, 500);
        return zustandNodes;
      }

      // Если есть значительные различия - полная синхронизация (например, при загрузке сценария)
      const hasSignificantDiff =
        currentNodes.length !== zustandNodes.length ||
        currentNodeIds.size !== zustandNodeIds.size ||
        Array.from(zustandNodeIds).some(id => !currentNodeIds.has(id)) ||
        // Проверяем, изменились ли позиции или настройки существующих узлов
        zustandNodes.some(zNode => {
          const current = currentNodes.find(n => n.id === zNode.id);
          if (!current) return false;
          return (
            Math.abs(current.position.x - zNode.position.x) > 1 ||
            Math.abs(current.position.y - zNode.position.y) > 1 ||
            JSON.stringify(current.data?.settings || {}) !==
              JSON.stringify(zNode.data?.settings || {})
          );
        });

      if (hasSignificantDiff) {
        // Полная синхронизация: заменяем все nodes
        // Принудительно исправляем видимость после синхронизации
        const fixVisibility = () => {
          zustandNodes.forEach(node => {
            const nodeElement = document.querySelector(`[data-id="${node.id}"]`) as HTMLElement;
            if (nodeElement) {
              nodeElement.style.setProperty('visibility', 'visible', 'important');
              nodeElement.style.setProperty('opacity', '1', 'important');
              nodeElement.style.setProperty('display', 'block', 'important');
              const innerDiv = nodeElement.querySelector('div:first-child') as HTMLElement;
              if (innerDiv) {
                innerDiv.style.setProperty('visibility', 'visible', 'important');
                innerDiv.style.setProperty('opacity', '1', 'important');
                innerDiv.style.setProperty('display', 'flex', 'important');
              }
            }
          });
        };
        setTimeout(fixVisibility, 50);
        setTimeout(fixVisibility, 100);
        setTimeout(fixVisibility, 200);
        setTimeout(fixVisibility, 500);
        return zustandNodes;
      }

      // Иначе добавляем только новые nodes
      const newNodes = zustandNodes.filter(n => !lastIds.has(n.id) && !currentNodeIds.has(n.id));
      if (newNodes.length > 0) {
        // Принудительно исправляем видимость новых nodes
        const fixVisibility = () => {
          newNodes.forEach(node => {
            const nodeElement = document.querySelector(`[data-id="${node.id}"]`) as HTMLElement;
            if (nodeElement) {
              nodeElement.style.setProperty('visibility', 'visible', 'important');
              nodeElement.style.setProperty('opacity', '1', 'important');
              nodeElement.style.setProperty('display', 'block', 'important');
              const innerDiv = nodeElement.querySelector('div:first-child') as HTMLElement;
              if (innerDiv) {
                innerDiv.style.setProperty('visibility', 'visible', 'important');
                innerDiv.style.setProperty('opacity', '1', 'important');
                innerDiv.style.setProperty('display', 'flex', 'important');
              }
            }
          });
        };
        setTimeout(fixVisibility, 50);
        setTimeout(fixVisibility, 100);
        setTimeout(fixVisibility, 200);
        return [...currentNodes, ...newNodes];
      }

      return currentNodes;
    });

    // Обновляем ref для следующего сравнения
    lastZustandNodeIdsRef.current = currentZustandIds;
  }, [zustandNodes, setNodes]);

  // Функция для валидации edge - проверяет, существуют ли source и target handles
  const validateEdge = useCallback((edge: Edge, allNodes: Node[]): boolean => {
    const sourceNode = allNodes.find(n => n.id === edge.source);
    const targetNode = allNodes.find(n => n.id === edge.target);

    if (!sourceNode || !targetNode) {
      return false; // Узлы не найдены
    }

    // Если есть sourceHandle, проверяем, что он существует в sourceNode
    if (edge.sourceHandle) {
      // Для message блоков с кнопками - проверяем, что кнопка существует
      if (edge.sourceHandle.startsWith('button_')) {
        const buttonIndex = parseInt(edge.sourceHandle.replace('button_', ''));
        const buttons = sourceNode.data?.settings?.buttons || [];
        if (isNaN(buttonIndex) || buttonIndex < 0 || buttonIndex >= buttons.length) {
          return false; // Кнопка не существует
        }
      } else {
        // Для обычных handles - проверяем стандартные id (top, right, bottom, left)
        const validSourceHandles = ['top', 'right', 'bottom', 'left'];
        if (!validSourceHandles.includes(edge.sourceHandle)) {
          return false; // Неизвестный sourceHandle
        }
      }
    }

    // Если есть targetHandle, проверяем, что он существует в targetNode
    if (edge.targetHandle) {
      const validTargetHandles = ['top', 'right', 'bottom', 'left'];
      if (!validTargetHandles.includes(edge.targetHandle)) {
        return false; // Неизвестный targetHandle
      }
    }

    return true;
  }, []);

  // Синхронизация edges: Zustand -> React Flow
  // При загрузке сценария полностью заменяем edges, при изменениях добавляем только новые
  useEffect(() => {
    const currentZustandIds = new Set(zustandEdges.map(e => e.id));
    const lastIds = lastZustandEdgeIdsRef.current;

    // Если это начальная загрузка (edges пустые) или Zustand edges сильно отличаются - полная синхронизация
    setEdges(currentEdges => {
      const currentEdgeIds = new Set(currentEdges.map(e => e.id));
      const zustandEdgeIds = new Set(zustandEdges.map(e => e.id));

      // Валидируем и фильтруем edges перед загрузкой
      const validatedEdges = zustandEdges.filter(e => validateEdge(e, nodes));

      // Если React Flow пустой, а Zustand не пустой - полная загрузка
      if (currentEdges.length === 0 && validatedEdges.length > 0) {
        // Добавляем data.onDelete для всех валидных edges из Zustand
        return validatedEdges.map(e => ({
          ...e,
          data: {
            ...e.data,
            onDelete: handleDeleteEdgeRef.current,
          },
        }));
      }

      // Если есть значительные различия - полная синхронизация
      const hasSignificantDiff =
        currentEdgeIds.size !== zustandEdgeIds.size ||
        Array.from(zustandEdgeIds).some(id => !currentEdgeIds.has(id));

      if (hasSignificantDiff) {
        // Полная синхронизация: заменяем все edges только валидными
        return validatedEdges.map(e => ({
          ...e,
          data: {
            ...e.data,
            onDelete: handleDeleteEdgeRef.current,
          },
        }));
      }

      // Иначе добавляем только новые валидные edges
      const newEdges = validatedEdges.filter(e => !lastIds.has(e.id) && !currentEdgeIds.has(e.id));
      if (newEdges.length > 0) {
        const edgesWithDelete = newEdges.map(e => ({
          ...e,
          data: {
            ...e.data,
            onDelete: handleDeleteEdgeRef.current,
          },
        }));
        return [...currentEdges, ...edgesWithDelete];
      }

      return currentEdges;
    });

    lastZustandEdgeIdsRef.current = currentZustandIds;
  }, [zustandEdges, setEdges, nodes, validateEdge]);

  // Обработчики изменений для ReactFlow с синхронизацией обратно в Zustand
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Фильтруем изменения dimensions, которые могут вызывать лишние ре-рендеры
      const filteredChanges = changes.filter(change => {
        // Пропускаем изменения dimensions если размеры не изменились значительно
        if (change.type === 'dimensions' && 'dimensions' in change) {
          return true; // Оставляем, ReactFlow нужны dimensions
        }
        return true;
      });

      if (filteredChanges.length > 0) {
        onNodesChangeInternal(filteredChanges);
      }
    },
    [onNodesChangeInternal]
  );

  // Синхронизация nodes из React Flow в Zustand при изменении
  // Используем useRef для отслеживания предыдущего состояния, чтобы избежать бесконечных циклов
  const prevNodesRef = useRef<string>('');
  const isInitializingRef = useRef<boolean>(true);

  useEffect(() => {
    // Пропускаем синхронизацию при начальной инициализации
    if (isInitializingRef.current) {
      isInitializingRef.current = false;
      return;
    }

    // Пропускаем синхронизацию если nodes пустые и это начальная загрузка
    if (nodes.length === 0 && zustandNodes.length === 0) {
      return;
    }

    // Создаем строку для сравнения (только важные поля: id, position, data.settings)
    const nodesKey = nodes
      .map(n => {
        const settings = n.data?.settings || {};
        return `${n.id}:${Math.round(n.position.x)}:${Math.round(n.position.y)}:${JSON.stringify(settings)}`;
      })
      .sort()
      .join('|');

    // Синхронизируем только если nodes действительно изменились
    if (nodesKey !== prevNodesRef.current) {
      prevNodesRef.current = nodesKey;
      // Синхронизируем nodes из React Flow в Zustand (без внутренних полей React Flow)
      const nodesToSync = nodes.map(({ selected, dragging, ...rest }) => rest);
      setZustandNodes(nodesToSync);
    }
  }, [nodes, setZustandNodes]);

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChangeInternal(changes);
    },
    [onEdgesChangeInternal]
  );

  // Синхронизация edges из React Flow в Zustand при изменении
  // Используем useRef для отслеживания предыдущего состояния, чтобы избежать бесконечных циклов
  const prevEdgesRef = useRef<string>('');

  useEffect(() => {
    // Пропускаем синхронизацию если edges пустые и это начальная загрузка
    if (edges.length === 0 && zustandEdges.length === 0) {
      return;
    }

    // Создаем строку для сравнения (только важные поля)
    const edgesKey = edges
      .map(e => `${e.id}:${e.source}:${e.target}:${e.sourceHandle || ''}:${e.targetHandle || ''}`)
      .sort()
      .join('|');

    // Синхронизируем только если edges действительно изменились
    if (edgesKey !== prevEdgesRef.current) {
      prevEdgesRef.current = edgesKey;
      // Синхронизируем edges из React Flow в Zustand (без data.onDelete, чтобы избежать циклических ссылок)
      const edgesToSync = edges.map(({ data, ...rest }) => rest);
      setZustandEdges(edgesToSync);
    }
  }, [edges, setZustandEdges]);

  const { setAllValidationResults } = useValidationStore();
  const invalidNodesCount = useValidationStore(state => {
    const results = Array.from(state.validationResults.values());
    return results.filter(r => !r.isValid).length;
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined);
  const [isPanelVisible, setIsPanelVisible] = useState(false);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [isExportConfirmOpen, setIsExportConfirmOpen] = useState(false);
  const [isBlockLibraryOpen, setIsBlockLibraryOpen] = useState(false);
  const { setViewport, screenToFlowPosition, getViewport, fitView } = useReactFlow();
  const reactFlowWrapper = React.useRef<HTMLDivElement>(null);

  // Ref для debounce валидации
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Ref для отслеживания, идёт ли начальная загрузка
  const isInitialLoadRef = useRef(true);

  // КРИТИЧНО: Следим за видимостью узлов и восстанавливаем её, если React Flow скрывает
  React.useEffect(() => {
    const fixNodeVisibility = (node: HTMLElement) => {
      // Проверяем и inline стили, и computed стили
      const inlineVisibility = node.style.getPropertyValue('visibility');
      const computedVisibility = window.getComputedStyle(node).visibility;

      if (inlineVisibility === 'hidden' || computedVisibility === 'hidden') {
        // Принудительно устанавливаем через setProperty с important
        node.style.setProperty('visibility', 'visible', 'important');
        node.style.setProperty('opacity', '1', 'important');
        node.style.setProperty('display', 'block', 'important');

        // Удаляем inline стиль если он есть (принудительно)
        if (inlineVisibility === 'hidden') {
          node.style.removeProperty('visibility');
          // Затем устанавливаем заново с important
          node.style.setProperty('visibility', 'visible', 'important');
        }

        // Также для внутреннего div
        const innerDiv = node.firstElementChild as HTMLElement;
        if (innerDiv && innerDiv.tagName === 'DIV') {
          innerDiv.style.setProperty('visibility', 'visible', 'important');
          innerDiv.style.setProperty('opacity', '1', 'important');
          innerDiv.style.setProperty('display', 'flex', 'important');
        }
      }
    };

    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        // Обрабатываем изменения атрибутов
        if (mutation.type === 'attributes') {
          const target = mutation.target as HTMLElement;
          if (target.classList.contains('react-flow__node')) {
            fixNodeVisibility(target);
          }
        }

        // Обрабатываем добавление новых узлов
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node instanceof HTMLElement) {
              if (node.classList.contains('react-flow__node')) {
                fixNodeVisibility(node);
              }
              // Также проверяем дочерние узлы
              const childNodes = node.querySelectorAll('.react-flow__node');
              childNodes.forEach(childNode => {
                fixNodeVisibility(childNode as HTMLElement);
              });
            }
          });
        }
      });
    });

    const pane = document.querySelector('.react-flow__pane');
    if (pane) {
      observer.observe(pane, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      });

      // Функция для проверки всех узлов
      const checkAllNodes = () => {
        const allNodes = pane.querySelectorAll('.react-flow__node');
        allNodes.forEach(node => {
          fixNodeVisibility(node as HTMLElement);
        });
      };

      // Также проверяем все существующие узлы сразу
      checkAllNodes();

      // Проверка через requestAnimationFrame для максимально быстрого реагирования
      let rafId: number | null = null;
      const scheduleCheck = () => {
        if (rafId !== null) return; // Уже запланирована проверка

        rafId = requestAnimationFrame(() => {
          checkAllNodes();
          rafId = null;
        });
      };

      // Периодическая проверка для гарантии (на случай если что-то пропустили)
      const interval = setInterval(() => {
        checkAllNodes();
      }, 50); // Уменьшил интервал с 100ms до 50ms для более частых проверок

      // Дополнительно проверяем через requestAnimationFrame при изменениях
      const rafObserver = new MutationObserver(() => {
        scheduleCheck();
      });
      rafObserver.observe(pane, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style'],
      });

      return () => {
        observer.disconnect();
        rafObserver.disconnect();
        clearInterval(interval);
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
        }
      };
    }
  }, []);

  // КРИТИЧНО: Максимально агрессивно убираем контур selection box
  React.useEffect(() => {
    // ОТКЛЮЧЕНО - конфликтует с connection line
    if (true) return;

    const removeSelectionBox = () => {
      // 1. Находим и УДАЛЯЕМ все элементы nodesselection
      const selectionBoxes = document.querySelectorAll(
        '.react-flow__nodesselection, .react-flow__nodesselection-rect, [class*="nodesselection"], [class*="selection"]:not(.react-flow__node-selected):not(.react-flow__edge.selected)'
      );
      selectionBoxes.forEach(el => {
        if (el instanceof HTMLElement || el instanceof SVGElement) {
          el.remove();
        }
      });

      // 2. Находим ВСЕ SVG в pane/viewport и проверяем их содержимое
      const allSvgs = document.querySelectorAll(
        '.react-flow__pane svg, .react-flow__viewport svg, .react-flow__renderer svg'
      );
      allSvgs.forEach(svg => {
        if (svg instanceof SVGElement) {
          const svgClass = svg.getAttribute('class') || '';
          const isBackground =
            svg.classList.contains('react-flow__background') || svgClass.includes('background');
          const isEdge = svg.closest('.react-flow__edge');
          const isSelection =
            svgClass.includes('nodesselection') ||
            svgClass.includes('selection') ||
            svg.classList.contains('react-flow__nodesselection');

          // Удаляем все SVG, которые явно являются selection box
          if (isSelection && !isBackground && !isEdge) {
            svg.remove();
            return;
          }

          // Проверяем все rect/path/line внутри SVG
          const shapes = svg.querySelectorAll(
            'rect, path, line, polygon, polyline, circle, ellipse'
          );
          shapes.forEach(shape => {
            if (shape instanceof SVGElement) {
              const stroke = (shape.getAttribute('stroke') || '').trim();
              const fill = (shape.getAttribute('fill') || '').trim();
              const style = shape.getAttribute('style') || '';

              // Пропускаем background элементы
              if (isBackground) return;
              if (shape.closest('.react-flow__background')) return;
              if (shape.closest('.react-flow__edge')) return;
              // КРИТИЧНО: Пропускаем connection line
              if (shape.closest('.react-flow__connection')) return;
              if (shape.getAttribute('data-connection-line') === 'true') return;
              if (shape.closest('[data-connection-line="true"]')) return;

              // КРИТИЧНО: Пропускаем элементы connection line по цвету
              if (
                stroke &&
                (stroke.toLowerCase() === '#ffc107' || stroke.toLowerCase() === 'rgb(255, 193, 7)')
              )
                return;

              // Удаляем любой элемент с цветным stroke/fill (кроме прозрачного или background цветов)
              if (
                stroke &&
                stroke !== 'none' &&
                !stroke.includes('rgba(255, 255, 255, 0.18)') &&
                !stroke.includes('transparent') &&
                stroke !== '#fff' &&
                stroke !== '#ffffff'
              ) {
                shape.remove();
              } else if (
                style.includes('stroke') &&
                !style.includes('none') &&
                !style.includes('rgba(255, 255, 255, 0.18)')
              ) {
                // Проверяем inline стили
                shape.remove();
              }
            }
          });
        }
      });

      // 3. Находим все rect с любыми контурами (более агрессивно)
      const allRects = document.querySelectorAll(
        '.react-flow__pane rect, .react-flow__viewport rect, .react-flow__renderer rect'
      );
      allRects.forEach(rect => {
        if (rect instanceof SVGElement) {
          const parentSvg = rect.closest('svg');
          if (!parentSvg) return;

          const isBackground = parentSvg.classList.contains('react-flow__background');
          const isEdge = rect.closest('.react-flow__edge');

          if (isBackground || isEdge) return;

          const stroke = (rect.getAttribute('stroke') || '').trim();
          const style = rect.getAttribute('style') || '';

          // Удаляем любой rect с цветным контуром
          if (
            (stroke &&
              stroke !== 'none' &&
              !stroke.includes('rgba(255, 255, 255, 0.18)') &&
              stroke !== '#fff') ||
            (style.includes('stroke') &&
              !style.includes('none') &&
              !style.includes('rgba(255, 255, 255, 0.18)'))
          ) {
            rect.remove();
          }
        }
      });
    };

    // Запускаем сразу несколько раз для надежности
    removeSelectionBox();
    setTimeout(removeSelectionBox, 0);
    setTimeout(removeSelectionBox, 10);

    // Используем requestAnimationFrame, но не в бесконечном цикле
    let rafId: number;
    let lastCheck = 0;
    const removeLoop = () => {
      const now = Date.now();
      // Проверяем максимум каждые 16ms (60fps)
      if (now - lastCheck >= 16) {
        removeSelectionBox();
        lastCheck = now;
      }
      rafId = requestAnimationFrame(removeLoop);
    };
    rafId = requestAnimationFrame(removeLoop);

    // MutationObserver для моментального удаления
    const observer = new MutationObserver(() => {
      removeSelectionBox();
    });

    const pane = document.querySelector('.react-flow__pane');
    if (pane) {
      observer.observe(pane, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'stroke', 'fill'],
      });
    }

    // Также интервал для перестраховки
    const interval = setInterval(removeSelectionBox, 50);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      clearInterval(interval);
    };
  }, []);

  // Убеждаемся, что ReactFlow получает размеры после монтирования
  useEffect(() => {
    if (reactFlowWrapper.current) {
      const resizeObserver = new ResizeObserver(() => {
        // НЕ вызываем fitView - это создает автомасштабирование
        // React Flow сам обрабатывает изменения размера
      });

      resizeObserver.observe(reactFlowWrapper.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, []);

  // Validate all nodes - стабильная функция без зависимости от nodes
  const runValidation = useCallback(
    (nodesToValidate?: Node[]) => {
      const targetNodes = nodesToValidate ?? nodes;
      // Передаём scenarios для валидации блоков go_to_scenario
      const results = validateAllNodesWithSchema(targetNodes, catalog, scenarios);
      setAllValidationResults(results);
      return results;
    },
    [catalog, setAllValidationResults, scenarios]
  );

  // Auto-validate on nodes change с debounce чтобы избежать бесконечного цикла
  useEffect(() => {
    // Пропускаем начальную загрузку чтобы избежать лишних рендеров
    if (isInitialLoadRef.current && nodes.length === 0) {
      return;
    }
    isInitialLoadRef.current = false;

    // Очищаем предыдущий timeout
    if (validationTimeoutRef.current) {
      clearTimeout(validationTimeoutRef.current);
    }

    // Debounce валидацию на 100ms чтобы избежать каскадных обновлений
    validationTimeoutRef.current = setTimeout(() => {
      runValidation(nodes);
    }, 100);

    return () => {
      if (validationTimeoutRef.current) {
        clearTimeout(validationTimeoutRef.current);
      }
    };
  }, [nodes.length]); // Зависим только от длины, не от самих nodes

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return undefined;
    // Сначала ищем в текущих nodes
    const node = nodes.find(n => n.id === selectedNodeId);
    if (node) return node;
    // Если не нашли, ищем в zustandNodes (на случай если nodes еще не синхронизированы)
    const zustandNode = zustandNodes.find(n => n.id === selectedNodeId);
    return zustandNode;
  }, [nodes, selectedNodeId, zustandNodes]);

  // Node changes are now handled directly by BlockSettingsPanel

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    const nodeToDelete = nodes.find(n => n.id === selectedNodeId);
    const nodeTitle = nodeToDelete?.data?.title || 'Блок';

    // Удаляем узел и связанные edges из React Flow
    setNodes(ns => ns.filter(n => n.id !== selectedNodeId));
    setEdges(es => {
      const filtered = es.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId);
      // Синхронизируем с Zustand сразу при удалении узла
      setZustandEdges(filtered);
      return filtered;
    });

    // Также удаляем из Zustand для синхронизации ref
    setZustandNodes(ns => ns.filter(n => n.id !== selectedNodeId));
    lastZustandNodeIdsRef.current.delete(selectedNodeId);

    setSelectedNodeId(undefined);
    setIsPanelVisible(false);
    showToast(`Блок "${nodeTitle}" удалён`, 'success');
  }, [selectedNodeId, nodes, setNodes, setEdges, setZustandNodes, showToast]);

  const handleDuplicateNode = useCallback(() => {
    if (!selectedNode) return;
    const newNode = {
      ...selectedNode,
      id: nanoid(),
      position: {
        x: selectedNode.position.x + 50,
        y: selectedNode.position.y + 50,
      },
      data: {
        ...selectedNode.data,
        label: `${selectedNode.data.title || 'Блок'} (копия)`,
      },
      selected: false, // Новая копия не выделена
    };
    setZustandNodes(ns => [...ns, newNode]);
    showToast(`Блок "${selectedNode.data.title || 'Блок'}" продублирован`, 'success');
  }, [selectedNode, setZustandNodes, showToast]);

  // Export function - определяется сначала
  const performExport = useCallback(
    (edgesToExport: Edge[]) => {
      const exportData = {
        meta: {
          created_at: new Date().toISOString(),
          plan: plan,
          role: role,
          node_count: nodes.length,
          edge_count: edgesToExport.length,
          version: '1.0',
        },
        nodes: nodes,
        edges: edgesToExport,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `botforg-flow-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      showToast('Сценарий экспортирован', 'success');
      setIsExportConfirmOpen(false);
    },
    [nodes, plan, role, showToast]
  );

  // Export with validation - использует performExport
  const handleExport = useCallback(() => {
    const validationResults = runValidation();

    if (hasValidationErrors(validationResults)) {
      setIsExportConfirmOpen(true);
      return;
    }

    performExport(edges);
  }, [runValidation, performExport, edges]);

  const handleSave = useCallback(() => {
    // TODO: Реализовать сохранение сценария через API
    // Пока просто показываем уведомление
    showToast('Сценарий сохранён', 'success');
    console.log('Saving scenario:', { nodes, edges });
  }, [nodes, edges]);

  // Keyboard shortcuts - теперь selectedNode и функции определены
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Игнорируем, если пользователь вводит текст в input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Delete - удалить выбранный узел
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          e.preventDefault();
          handleDeleteNode();
        }
      }

      // Escape - закрыть панель/модальные окна
      if (e.key === 'Escape') {
        if (isValidationModalOpen) {
          setIsValidationModalOpen(false);
        } else if (isExportConfirmOpen) {
          setIsExportConfirmOpen(false);
        } else if (isPanelVisible && selectedNodeId) {
          setIsPanelVisible(false);
          setSelectedNodeId(undefined);
        }
      }

      // Ctrl+D или Cmd+D - дублировать узел (только на Mac/Windows)
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        if (selectedNodeId && selectedNode) {
          e.preventDefault();
          handleDuplicateNode();
        }
      }

      // Ctrl+S или Cmd+S - экспорт (предотвращаем сохранение страницы)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleExport();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    selectedNodeId,
    selectedNode,
    isValidationModalOpen,
    isExportConfirmOpen,
    isPanelVisible,
    handleDeleteNode,
    handleDuplicateNode,
    handleExport,
  ]);

  // onNodesChange и onEdgesChange уже определены выше с обертками для логирования

  // Загрузка каталога блоков при монтировании редактора
  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Инициализация nodes и edges из Zustand при монтировании компонента
  useEffect(() => {
    // Инициализация nodes - загружаем все сразу при первой загрузке
    if (isInitialLoadRef.current && zustandNodes.length > 0 && nodes.length === 0) {
      setNodes(zustandNodes);
      lastZustandNodeIdsRef.current = new Set(zustandNodes.map(n => n.id));

      // Принудительно исправляем видимость всех nodes после загрузки
      // Используем несколько попыток с задержками, так как React Flow может устанавливать стили асинхронно
      const fixVisibility = (attempt = 0) => {
        if (attempt > 10) return; // Максимум 10 попыток

        zustandNodes.forEach(node => {
          const nodeElement = document.querySelector(`[data-id="${node.id}"]`) as HTMLElement;
          if (nodeElement) {
            // Всегда устанавливаем видимость, независимо от текущего состояния
            nodeElement.style.setProperty('visibility', 'visible', 'important');
            nodeElement.style.setProperty('opacity', '1', 'important');
            nodeElement.style.setProperty('display', 'block', 'important');

            const innerDiv = nodeElement.querySelector('div:first-child') as HTMLElement;
            if (innerDiv) {
              innerDiv.style.setProperty('visibility', 'visible', 'important');
              innerDiv.style.setProperty('opacity', '1', 'important');
              innerDiv.style.setProperty('display', 'flex', 'important');
            }
          }
        });

        // Повторяем исправление с задержками
        if (attempt < 10) {
          setTimeout(() => fixVisibility(attempt + 1), 50 * (attempt + 1));
        }
      };

      // Начинаем исправление видимости сразу и с задержками
      setTimeout(() => fixVisibility(0), 50);
      setTimeout(() => fixVisibility(0), 100);
      setTimeout(() => fixVisibility(0), 200);
      setTimeout(() => fixVisibility(0), 500);
      setTimeout(() => fixVisibility(0), 1000);

      isInitialLoadRef.current = false;
    }

    // Инициализация edges
    if (zustandEdges.length > 0 && edges.length === 0 && handleDeleteEdgeRef.current) {
      // При первой загрузке загружаем edges из Zustand
      const edgesWithDelete = zustandEdges.map(e => ({
        ...e,
        data: {
          ...e.data,
          onDelete: handleDeleteEdgeRef.current,
        },
      }));
      setEdges(edgesWithDelete);
      lastZustandEdgeIdsRef.current = new Set(zustandEdges.map(e => e.id));
    }
  }, [zustandNodes, zustandEdges, nodes.length, edges.length, setNodes, setEdges]);

  // Установка начального viewport ОДИН раз при монтировании
  useEffect(() => {
    setViewport({ x: 0, y: 0, zoom: 0.6 }, { duration: 0 });
  }, [setViewport]);

  // Постоянное исправление видимости всех nodes - следим за всеми nodes и исправляем видимость
  useEffect(() => {
    if (nodes.length === 0) return;

    // Исправляем видимость всех nodes при каждом изменении
    const fixAllNodesVisibility = () => {
      nodes.forEach(node => {
        const nodeElement = document.querySelector(`[data-id="${node.id}"]`) as HTMLElement;
        if (nodeElement) {
          // Всегда устанавливаем видимость для всех nodes
          nodeElement.style.setProperty('visibility', 'visible', 'important');
          nodeElement.style.setProperty('opacity', '1', 'important');
          nodeElement.style.setProperty('display', 'block', 'important');

          const innerDiv = nodeElement.querySelector('div:first-child') as HTMLElement;
          if (innerDiv) {
            innerDiv.style.setProperty('visibility', 'visible', 'important');
            innerDiv.style.setProperty('opacity', '1', 'important');
            innerDiv.style.setProperty('display', 'flex', 'important');
          }
        }
      });
    };

    // Исправляем сразу и с задержками
    fixAllNodesVisibility();
    const timeout1 = setTimeout(fixAllNodesVisibility, 50);
    const timeout2 = setTimeout(fixAllNodesVisibility, 100);
    const timeout3 = setTimeout(fixAllNodesVisibility, 200);
    const timeout4 = setTimeout(fixAllNodesVisibility, 500);

    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
      clearTimeout(timeout4);
    };
  }, [nodes]); // Зависим от самих nodes, чтобы исправлять при каждом изменении

  // Ref для debounce синхронизации со scenarioStore
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Синхронизация изменений с scenarioStore (с debounce)
  // Используем useRef для отслеживания предыдущего состояния nodes и edges
  const prevZustandNodesRef = useRef<string>('');
  const prevZustandEdgesRef = useRef<string>('');

  useEffect(() => {
    // Пропускаем если нет данных
    if (zustandNodes.length === 0 && zustandEdges.length === 0) {
      return;
    }

    // Создаем ключи для сравнения (позиции, настройки, edges)
    const nodesKey = zustandNodes
      .map(
        n =>
          `${n.id}:${Math.round(n.position.x)}:${Math.round(n.position.y)}:${JSON.stringify(n.data?.settings || {})}`
      )
      .sort()
      .join('|');
    const edgesKey = zustandEdges
      .map(e => `${e.id}:${e.source}:${e.target}:${e.sourceHandle || ''}:${e.targetHandle || ''}`)
      .sort()
      .join('|');

    // Проверяем, изменились ли nodes или edges
    const nodesChanged = nodesKey !== prevZustandNodesRef.current;
    const edgesChanged = edgesKey !== prevZustandEdgesRef.current;

    if (nodesChanged || edgesChanged) {
      prevZustandNodesRef.current = nodesKey;
      prevZustandEdgesRef.current = edgesKey;

      // Очищаем предыдущий timeout
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }

      // Debounce синхронизацию на 200ms
      syncTimeoutRef.current = setTimeout(() => {
        syncFromEditor();
      }, 200);
    }

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [zustandNodes, zustandEdges, syncFromEditor]); // Зависим от самих nodes и edges

  // Типы узлов и рёбер
  const nodeTypes = useMemo(
    () => ({
      default: CustomNode,
      start: CustomNode,
      message: CustomNode,
    }),
    []
  );

  const edgeTypes = useMemo(
    () => ({
      default: CustomEdge,
    }),
    []
  );

  // Стабильная ссылка на функцию удаления через useRef для избежания бесконечного цикла
  const handleDeleteEdgeRef = React.useRef<(edgeId: string) => void>();

  handleDeleteEdgeRef.current = (edgeId: string) => {
    // Удаляем из React Flow (синхронизация с Zustand произойдет через useEffect)
    setEdges(eds => eds.filter(e => e.id !== edgeId));
    showToast('Соединение удалено', 'success');
  };

  // Удаление edge - стабильная обертка
  const handleDeleteEdge = useCallback((edgeId: string) => {
    handleDeleteEdgeRef.current?.(edgeId);
  }, []);

  // Создание соединения
  const onConnect = useCallback(
    (params: Connection) => {
      // Валидация параметров соединения
      if (!params.source || !params.target) {
        console.warn('Invalid connection params:', params);
        return;
      }

      // ID включает source, sourceHandle, target, targetHandle для поддержки множественных соединений
      // между разными Handle одних и тех же блоков
      const edgeId = `${params.source}_${params.sourceHandle || 'default'}-${params.target}_${params.targetHandle || 'default'}`;

      // Проверяем, не существует ли уже такое соединение
      const existingEdge = edges.find(e => e.id === edgeId);
      if (existingEdge) {
        showToast('Такое соединение уже существует', 'warning');
        return;
      }

      // Запрещаем самосоединение (соединение блока с самим собой)
      if (params.source === params.target) {
        showToast('Нельзя соединить блок с самим собой', 'warning');
        return;
      }

      const newEdge: Edge = {
        id: edgeId,
        source: params.source,
        target: params.target,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
        type: 'default',
        animated: false,
        data: {
          onDelete: handleDeleteEdge,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 30,
          height: 30,
          color: '#FFB300',
        },
        style: {
          stroke: '#FFB300',
          strokeWidth: 4,
        },
      };

      // Добавляем в React Flow (синхронизация с Zustand произойдет через useEffect)
      setEdges(eds => [...eds, newEdge]);

      showToast('Соединение создано', 'success');
    },
    [edges, setEdges, showToast, handleDeleteEdge]
  );

  // Handle drag over canvas - улучшаем визуальную обратную связь
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';

    // Добавляем визуальную индикацию возможности drop
    const target = e.currentTarget as HTMLElement;
    const pane = target.closest('.react-flow__pane') as HTMLElement;
    if (pane && !pane.classList.contains('drag-over')) {
      pane.classList.add('drag-over');
    }
  }, []);

  // Обработчик конца drag операции
  const onDragLeave = useCallback((e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    const pane = target.closest('.react-flow__pane') as HTMLElement;
    if (pane) {
      pane.classList.remove('drag-over');
    }
  }, []);

  // Helper function to add block at position
  const addBlockAtPosition = useCallback(
    (block: BlockCatalogItem, position: { x: number; y: number }) => {
      // Get current plan and role from store
      const { plan, role } = useEditorStore.getState();

      // Check access - validate before creating node
      if (!canAccessBlock(block, plan, role)) {
        // Log denied attempt for analytics
        logAccessDenied(block, plan, role, 'add');

        // Show warning toast
        const message = getAccessDeniedMessage(block, plan, role);
        showToast(message, 'warning');

        // Cancel operation
        return;
      }

      // Access granted - proceed with creating node
      const newNode: Node = {
        id: nanoid(),
        type: 'default',
        position,
        data: {
          blockId: block.id,
          title: block.title,
          icon: block.icon,
          color: block.color,
          settings: {}, // All user config goes here
        },
        style: {
          borderColor: block.color,
        },
      };

      // Debug: log the created node structure
      debugNodeStructure(newNode);

      // Добавляем новый узел в массив Zustand
      setZustandNodes(nds => [...nds, newNode]);
      showToast(`Блок "${block.title}" добавлен`, 'success');

      // КРИТИЧНО: Принудительно делаем узел видимым (через несколько попыток, т.к. React Flow может перезаписывать стили)
      const ensureNodeVisible = (attempts = 0) => {
        const nodeElement = document.querySelector(`[data-id="${newNode.id}"]`) as HTMLElement;
        if (nodeElement) {
          // Принудительно устанавливаем видимость через CSS variables и inline стили
          nodeElement.style.setProperty('visibility', 'visible', 'important');
          nodeElement.style.setProperty('opacity', '1', 'important');
          nodeElement.style.setProperty('display', 'block', 'important');

          // Также устанавливаем для внутреннего div
          const innerDiv = nodeElement.firstElementChild as HTMLElement;
          if (innerDiv && innerDiv.tagName === 'DIV') {
            innerDiv.style.setProperty('visibility', 'visible', 'important');
            innerDiv.style.setProperty('opacity', '1', 'important');
            innerDiv.style.setProperty('display', 'flex', 'important');
          }

          // Если узел все еще скрыт и у нас есть попытки - повторяем
          const computedVisibility = window.getComputedStyle(nodeElement).visibility;
          if (computedVisibility === 'hidden' && attempts < 20) {
            setTimeout(() => ensureNodeVisible(attempts + 1), 50);
          }
        } else if (attempts < 20) {
          // Узел еще не появился в DOM - повторяем
          setTimeout(() => ensureNodeVisible(attempts + 1), 50);
        }
      };

      // Запускаем сразу и через задержки (более частые проверки для надежности)
      ensureNodeVisible();
      setTimeout(() => ensureNodeVisible(), 10);
      setTimeout(() => ensureNodeVisible(), 50);
      setTimeout(() => ensureNodeVisible(), 100);
      setTimeout(() => ensureNodeVisible(), 200);
      setTimeout(() => ensureNodeVisible(), 300);
      setTimeout(() => ensureNodeVisible(), 500);
      setTimeout(() => ensureNodeVisible(), 800);
      setTimeout(() => ensureNodeVisible(), 1200);
      setTimeout(() => ensureNodeVisible(), 2000);
    },
    [setZustandNodes, showToast]
  );

  // Handle drop block from library (legacy drag-n-drop support)
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      const blockData = e.dataTransfer.getData('application/block');
      if (!blockData) return;

      try {
        const block: BlockCatalogItem = JSON.parse(blockData);

        // Get position from drop event
        const position = screenToFlowPosition({
          x: e.clientX,
          y: e.clientY,
        });

        addBlockAtPosition(block, position);

        // Убираем класс drag-over после успешного drop
        const pane = document.querySelector('.react-flow__pane');
        if (pane) {
          pane.classList.remove('drag-over');
        }
      } catch (error) {
        console.error('Error dropping block:', error);
        useEditorStore.getState().showToast('Ошибка при добавлении блока', 'error');
      }
    },
    [screenToFlowPosition, addBlockAtPosition]
  );

  // Handle add block from modal
  const handleAddBlockFromModal = useCallback(
    (block: BlockCatalogItem, position?: { x: number; y: number }) => {
      // Use provided position or calculate from viewport center
      let finalPosition: { x: number; y: number };

      if (position) {
        finalPosition = position;
      } else if (selectedNode) {
        // If node is selected, add near it
        finalPosition = {
          x: selectedNode.position.x + 300,
          y: selectedNode.position.y + 150,
        };
      } else if (nodes.length > 0) {
        // If there are existing nodes, add to the right of the last one
        const lastNode = nodes[nodes.length - 1];
        finalPosition = {
          x: lastNode.position.x + 300,
          y: lastNode.position.y,
        };
      } else {
        // No nodes exist - use center of the flow (considering viewport)
        const viewport = getViewport();
        // Calculate center in flow coordinates
        const paneElement = reactFlowWrapper.current?.querySelector('.react-flow__pane');
        if (paneElement) {
          const rect = paneElement.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
          finalPosition = screenToFlowPosition({
            x: centerX,
            y: centerY,
          });
        } else {
          // Fallback: use center accounting for viewport pan and zoom
          finalPosition = screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
          });
        }
      }

      addBlockAtPosition(block, finalPosition);

      // НЕ используем fitView - это вызывает автомасштабирование
      setTimeout(() => {
        const newNodes = useEditorStore.getState().nodes;
        const addedNode = newNodes[newNodes.length - 1];
        if (addedNode) {
          // Просто убеждаемся что узел видим
          const nodeElement = document.querySelector(`[data-id="${addedNode.id}"]`) as HTMLElement;
          if (nodeElement) {
            nodeElement.style.setProperty('visibility', 'visible', 'important');
            nodeElement.style.setProperty('opacity', '1', 'important');
            nodeElement.style.setProperty('display', 'block', 'important');

            const innerDiv = nodeElement.firstElementChild as HTMLElement;
            if (innerDiv && innerDiv.tagName === 'DIV') {
              innerDiv.style.setProperty('visibility', 'visible', 'important');
              innerDiv.style.setProperty('opacity', '1', 'important');
              innerDiv.style.setProperty('display', 'flex', 'important');
            }
          }
        }
      }, 100);
    },
    [selectedNode, nodes, screenToFlowPosition, getViewport, addBlockAtPosition, reactFlowWrapper]
  );

  // Обработчики кликов
  const onNodeClick = useCallback((event: any, node: any) => {
    // Предотвращаем всплытие события, чтобы onPaneClick не сработал
    event?.stopPropagation?.();
    setSelectedNodeId(node.id);
    setIsPanelVisible(true);
  }, []);

  const onEdgeClick = useCallback((_: any, edge: any) => {
    // Не удаляем сразу - только выделяем, удаление через корзину в CustomEdge
  }, []);

  // Клик по пустому месту - снять выделение (но не закрывать панель при drag)
  const isDraggingRef = useRef<boolean>(false);
  const onPaneClick = useCallback((event: React.MouseEvent) => {
    // Не закрываем панель если идет drag
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      return;
    }
    // Закрываем панель только при клике на пустое место (не на node)
    // Проверяем, что клик был именно на pane, а не на node или его дочерние элементы
    const target = event.target as HTMLElement;
    const isNodeClick = target.closest('.react-flow__node');
    if (!isNodeClick) {
      setSelectedNodeId(undefined);
      setIsPanelVisible(false);
    }
  }, []);

  // Отслеживаем начало и конец drag
  const onNodeDragStart = useCallback(() => {
    isDraggingRef.current = true;
  }, []);

  const onNodeDragStop = useCallback(() => {
    // Небольшая задержка перед сбросом флага, чтобы onPaneClick не сработал
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 100);
  }, []);

  // Import with validation
  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = JSON.parse(e.target?.result as string);

          // Validate file structure
          if (!data.nodes || !Array.isArray(data.nodes)) {
            showToast('Некорректный формат файла: отсутствует nodes', 'error');
            return;
          }

          if (!data.edges || !Array.isArray(data.edges)) {
            showToast('Некорректный формат файла: отсутствует edges', 'error');
            return;
          }

          // Validate each node has settings
          const invalidNodes = data.nodes.filter(
            (n: Node) => !n.data || !n.data.settings || typeof n.data.settings !== 'object'
          );

          if (invalidNodes.length > 0) {
            showToast(
              `Некорректная структура узлов: ${invalidNodes.length} узлов без settings`,
              'error'
            );
            return;
          }

          // Import data
          setZustandNodes(data.nodes);
          setZustandEdges(data.edges);
          setSelectedNodeId(undefined);

          // Run validation
          runValidation();

          showToast('Сценарий импортирован', 'success');
        } catch (error) {
          console.error('Import error:', error);
          showToast('Файл повреждён или неверный формат', 'error');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [setZustandNodes, setZustandEdges, showToast, runValidation]);

  // Show validation modal
  const handleValidate = useCallback(() => {
    runValidation();
    setIsValidationModalOpen(true);
  }, [runValidation]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        position: 'relative',
        zIndex: 0,
        overflow: 'hidden',
        background: '#0a1b2a', // Убеждаемся что фон есть
      }}
    >
      {/* Toast notifications */}
      <ToastContainer />

      {/* Validation Modal */}
      <ValidationModal
        isOpen={isValidationModalOpen}
        onClose={() => setIsValidationModalOpen(false)}
      />

      {/* Export Confirmation Modal */}
      <ExportConfirmModal
        isOpen={isExportConfirmOpen}
        errorCount={invalidNodesCount}
        onConfirm={() => performExport(edges)}
        onCancel={() => setIsExportConfirmOpen(false)}
      />

      {/* Top controls bar */}
      <EditorControls
        onExport={handleExport}
        onSave={handleSave}
        onOpenBlockLibrary={() => setIsBlockLibraryOpen(true)}
      />

      {/* Block Library Modal */}
      <BlockLibraryModal
        isOpen={isBlockLibraryOpen}
        onClose={() => setIsBlockLibraryOpen(false)}
        onAddBlock={handleAddBlockFromModal}
      />

      {/* Main content area */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isPanelVisible && selectedNode ? '1fr 360px' : '1fr',
          flex: 1,
          overflow: 'hidden',
          minHeight: 0,
          minWidth: 0,
          position: 'relative',
          width: '100%',
          height: 0, // Важно для grid в flex контейнере
        }}
      >
        {/* Основная область редактора */}
        <main
          ref={reactFlowWrapper}
          style={{
            width: '100%',
            height: '100%',
            minHeight: 0,
            minWidth: 0,
            maxHeight: '100%',
            position: 'relative',
            overflow: 'hidden',
            zIndex: 0,
            background: '#0a1b2a', // Фон под всем контентом
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <svg style={{ position: 'absolute', width: 0, height: 0, zIndex: 1 }}>
            <defs>
              {/* Янтарный маркер стрелки для обычного состояния */}
              <marker
                id="arrow-marker-amber"
                viewBox="0 0 20 20"
                refX="10"
                refY="10"
                markerWidth="30"
                markerHeight="30"
                orient="auto"
              >
                <path d="M 2 4 L 10 10 L 2 16 L 2 10 Z" fill="#FFB300" stroke="none" />
              </marker>
              {/* Красный маркер стрелки для выбранного состояния */}
              <marker
                id="arrow-marker-red"
                viewBox="0 0 20 20"
                refX="10"
                refY="10"
                markerWidth="30"
                markerHeight="30"
                orient="auto"
              >
                <path d="M 2 4 L 10 10 L 2 16 L 2 10 Z" fill="#ef4444" stroke="none" />
              </marker>
              {/* Светло-янтарный маркер для hover */}
              <marker
                id="arrow-marker-hover"
                viewBox="0 0 20 20"
                refX="10"
                refY="10"
                markerWidth="30"
                markerHeight="30"
                orient="auto"
              >
                <path d="M 2 4 L 10 10 L 2 16 L 2 10 Z" fill="#FFD54F" stroke="none" />
              </marker>
            </defs>
          </svg>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragLeave={onDragLeave}
            // Интерактивность
            nodesDraggable={true}
            nodesConnectable={true}
            elementsSelectable={true}
            // Панорамирование: ЛКМ на пустом месте ИЛИ с зажатым пробелом
            panOnDrag={true}
            panOnScroll={true}
            zoomOnScroll={true}
            zoomOnPinch={true}
            panActivationKeyCode="Space" // Пробел для принудительного панорамирования
            // КРИТИЧНО: Отключаем selection box полностью
            selectNodesOnDrag={false}
            selectionOnDrag={false}
            // Отключаем клавишу для selection (по умолчанию Shift, null отключает)
            selectionKeyCode={null}
            // Отключаем выделение через выделение области
            preventScrolling={false}
            // Настройки зума и начальный viewport
            minZoom={0.3}
            maxZoom={1.5}
            defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
            // Режим соединения
            connectionMode={ConnectionMode.Loose}
            connectOnClick={true}
            connectionLineComponent={ConnectionLine}
            // Настройки рёбер по умолчанию
            defaultEdgeOptions={{
              type: 'default',
              animated: false,
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 30,
                height: 30,
                color: '#FFB300',
              },
              style: { stroke: '#FFB300', strokeWidth: 4 },
            }}
            // Скрываем атрибуцию
            proOptions={{ hideAttribution: true }}
            // Стили - обязательно указываем размеры в пикселях для ReactFlow
            style={{
              width: '100%',
              height: '100%',
              minWidth: 0,
              minHeight: 0,
            }}
          >
            {/* Empty state - показываем, когда нет узлов */}
            {nodes.length === 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  zIndex: 10,
                  pointerEvents: 'none',
                  color: '#9ca3af',
                }}
              >
                <div
                  style={{
                    fontSize: 64,
                    marginBottom: 16,
                    opacity: 0.5,
                  }}
                >
                  🎨
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: '#fff',
                    marginBottom: 8,
                  }}
                >
                  Начните создавать сценарий
                </div>
                <div
                  style={{
                    fontSize: 14,
                    opacity: 0.7,
                    maxWidth: 400,
                    lineHeight: 1.6,
                  }}
                >
                  Нажмите кнопку "Добавить блок" в верхней панели,
                  <br />
                  или используйте кнопку "Импорт" для загрузки готового сценария
                </div>
              </div>
            )}

            {/* Фон с сеткой - должен быть первым для правильного z-index */}
            <Background
              variant={BackgroundVariant.Dots}
              gap={24}
              size={3.75}
              color="rgba(255, 255, 255, 0.18)"
            />

            {/* Элементы управления */}
            <Controls
              position="bottom-left"
              showZoom={true}
              showFitView={true}
              showInteractive={true}
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}
            />

            {/* Мини-карта */}
            <MiniMap
              position="bottom-right"
              nodeColor={(node: Node) => {
                const type = node.data?.type || 'default';
                const colors = {
                  start: '#4A90E2',
                  message: '#3498DB',
                  action: '#2ECC71',
                  condition: '#9B59B6',
                  api: '#00BCD4',
                  end: '#FF3B30',
                  default: '#2f6dff',
                };
                return colors[type as keyof typeof colors] || '#2f6dff';
              }}
              nodeStrokeWidth={3}
              nodeBorderRadius={8}
              maskColor="rgba(0, 0, 0, 0.1)"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
              }}
            />
          </ReactFlow>
        </main>

        {/* Правая панель настроек - показывается только при выборе узла */}
        {isPanelVisible && selectedNode && (
          <aside
            style={{
              borderLeft: '1px solid #1f2937',
              backgroundColor: '#0a1b2a',
              position: 'relative',
              overflow: 'hidden',
              height: '100%',
            }}
          >
            <BlockSettingsPanel
              selectedNode={selectedNode}
              onClose={() => {
                setIsPanelVisible(false);
                setSelectedNodeId(undefined);
              }}
              onDelete={handleDeleteNode}
              onDuplicate={handleDuplicateNode}
              onUpdateNode={(nodeId, updates) => {
                // Обновляем в React Flow
                setNodes(nodes => {
                  const updated = nodes.map(n => (n.id === nodeId ? { ...n, ...updates } : n));
                  // Синхронизируем с Zustand
                  setZustandNodes(updated);
                  return updated;
                });
              }}
            />
          </aside>
        )}
      </div>
    </div>
  );
}

export default function EditorV2Shell() {
  // Используем useEffect для принудительной установки размеров после монтирования
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (containerRef.current) {
      // Принудительно устанавливаем размеры
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        console.warn('EditorV2Shell container has zero size:', rect);
        // Попробуем установить минимальные размеры
        containerRef.current.style.minHeight = '600px';
        containerRef.current.style.minWidth = '800px';
      }
    }
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <ReactFlowProvider>
        <InnerEditor />
      </ReactFlowProvider>
    </div>
  );
}
