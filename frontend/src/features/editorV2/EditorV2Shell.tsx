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
  const borderColor = data?.color || '#2f6dff';

  // Get validation status
  const validation = useValidationStore(state => state.getNodeValidation(id));
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
          <Handle
            id="bottom"
            type="source"
            position={Position.Bottom}
            isConnectable={true}
            style={{
              background: '#00ff00',
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
      ) : (
        /* Для остальных блоков - 4 Handle (со всех сторон) - source и target */
        <>
          {/* Top - входящие соединения */}
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

          {/* Right - исходящие соединения */}
          <Handle
            id="right"
            type="source"
            position={Position.Right}
            isConnectable={true}
            style={{
              background: '#00ff00',
              width: 19.4,
              height: 19.4,
              border: '3px solid #fff',
              right: -9.7,
              zIndex: 10000,
              transition: 'all 0.2s ease',
            }}
            className="react-flow__handle-visible"
          />

          {/* Bottom - исходящие соединения */}
          <Handle
            id="bottom"
            type="source"
            position={Position.Bottom}
            isConnectable={true}
            style={{
              background: '#00ff00',
              width: 19.4,
              height: 19.4,
              border: '3px solid #fff',
              bottom: -9.7,
              zIndex: 10000,
              transition: 'all 0.2s ease',
            }}
            className="react-flow__handle-visible"
          />

          {/* Left - входящие соединения */}
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

  // КРИТИЧНО: nodes и edges через useNodesState и useEdgesState для правильной работы ReactFlow
  // React Flow управляет своим внутренним state, Zustand используется ТОЛЬКО для добавления новых блоков
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState([]);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState([]);

  // Ref для отслеживания последних ID из Zustand (для добавления новых узлов)
  const lastZustandNodeIdsRef = useRef<Set<string>>(new Set());
  const lastZustandEdgeIdsRef = useRef<Set<string>>(new Set());

  // ОДНОСТОРОННЯЯ синхронизация: Zustand -> React Flow (только для НОВЫХ узлов)
  useEffect(() => {
    const currentZustandIds = new Set(zustandNodes.map(n => n.id));
    const lastIds = lastZustandNodeIdsRef.current;

    // Находим НОВЫЕ узлы, которых не было раньше в Zustand
    const newNodes = zustandNodes.filter(n => !lastIds.has(n.id));

    if (newNodes.length > 0) {
      // Добавляем только новые узлы, которых ЕЩЁ НЕТ в React Flow
      setNodes(currentNodes => {
        const currentNodeIds = new Set(currentNodes.map(n => n.id));
        const trulyNewNodes = newNodes.filter(n => !currentNodeIds.has(n.id));
        if (trulyNewNodes.length === 0) return currentNodes;
        return [...currentNodes, ...trulyNewNodes];
      });
    }

    // Обновляем ref для следующего сравнения
    lastZustandNodeIdsRef.current = currentZustandIds;
  }, [zustandNodes, setNodes]);

  // ОДНОСТОРОННЯЯ синхронизация edges: Zustand -> React Flow (только для НОВЫХ edges)
  useEffect(() => {
    const currentZustandIds = new Set(zustandEdges.map(e => e.id));
    const lastIds = lastZustandEdgeIdsRef.current;

    // Находим НОВЫЕ edges, которых не было раньше в Zustand
    const newEdges = zustandEdges.filter(e => !lastIds.has(e.id));

    if (newEdges.length > 0) {
      // Добавляем только новые edges, которых ЕЩЁ НЕТ в React Flow
      setEdges(currentEdges => {
        const currentEdgeIds = new Set(currentEdges.map(e => e.id));
        const trulyNewEdges = newEdges.filter(e => !currentEdgeIds.has(e.id));
        if (trulyNewEdges.length === 0) return currentEdges;
        return [...currentEdges, ...trulyNewEdges];
      });
    }

    lastZustandEdgeIdsRef.current = currentZustandIds;
  }, [zustandEdges, setEdges]);

  // Обработчики изменений для ReactFlow - БЕЗ синхронизации обратно в Zustand
  // Zustand используется только как "входная точка" для добавления блоков
  const onNodesChange = useCallback(
    (changes: any) => {
      onNodesChangeInternal(changes);
      // НЕ синхронизируем обратно в Zustand - React Flow управляет position/dimensions
    },
    [onNodesChangeInternal]
  );

  const onEdgesChange = useCallback(
    (changes: any) => {
      onEdgesChangeInternal(changes);
      // НЕ синхронизируем обратно в Zustand
    },
    [onEdgesChangeInternal]
  );

  const { setAllValidationResults } = useValidationStore();
  const invalidNodesCount = useValidationStore(state => {
    const results = Array.from(state.validationResults.values());
    return results.filter(r => !r.isValid).length;
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>(undefined);
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
  const [isExportConfirmOpen, setIsExportConfirmOpen] = useState(false);
  const [isBlockLibraryOpen, setIsBlockLibraryOpen] = useState(false);
  const { setViewport, screenToFlowPosition, getViewport, fitView } = useReactFlow();
  const reactFlowWrapper = React.useRef<HTMLDivElement>(null);

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

  // Validate all nodes
  const runValidation = useCallback(() => {
    const results = validateAllNodesWithSchema(nodes, catalog);
    setAllValidationResults(results);
    return results;
  }, [nodes, catalog, setAllValidationResults]);

  // Auto-validate on nodes change
  useEffect(() => {
    runValidation();
  }, [nodes, runValidation]);

  const selectedNode = useMemo(
    () => nodes.find(n => n.id === selectedNodeId),
    [nodes, selectedNodeId]
  );

  // Node changes are now handled directly by BlockSettingsPanel

  const handleDeleteNode = useCallback(() => {
    if (!selectedNodeId) return;
    const nodeToDelete = nodes.find(n => n.id === selectedNodeId);
    const nodeTitle = nodeToDelete?.data?.title || 'Блок';

    // Удаляем узел и связанные edges из React Flow
    setNodes(ns => ns.filter(n => n.id !== selectedNodeId));
    setEdges(es => es.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId));

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

  // Установка начального viewport ОДИН раз при монтировании
  useEffect(() => {
    setViewport({ x: 0, y: 0, zoom: 0.6 }, { duration: 0 });
  }, [setViewport]);

  // Синхронизация изменений с scenarioStore
  useEffect(() => {
    // При изменении nodes/edges синхронизируем с scenarioStore
    syncFromEditor();
  }, [zustandNodes, zustandEdges, syncFromEditor]);

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
    // Удаляем только из React Flow (не из Zustand)
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
      const newEdge = {
        ...params,
        id: `${params.source}-${params.target}`,
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

      // Добавляем ТОЛЬКО в React Flow (не в Zustand, чтобы избежать дубликатов)
      // Zustand edges используются только для загрузки/сохранения сценария
      setEdges(eds => addEdge(newEdge, eds));

      showToast('Соединение создано', 'success');
    },
    [setEdges, showToast, handleDeleteEdge]
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
  const onNodeClick = useCallback((_: any, node: any) => {
    setSelectedNodeId(node.id);
    setIsPanelVisible(true);
  }, []);

  const onEdgeClick = useCallback((_: any, edge: any) => {
    // Не удаляем сразу - только выделяем, удаление через корзину в CustomEdge
  }, []);

  // Клик по пустому месту - снять выделение
  const onPaneClick = useCallback(() => {
    setSelectedNodeId(undefined);
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
            <button
              onClick={() => {
                setIsPanelVisible(false);
                setSelectedNodeId(undefined);
              }}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                background: '#1f2937',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: '12px',
                zIndex: 10,
              }}
            >
              ✕ Закрыть
            </button>
            <BlockSettingsPanel
              selectedNode={selectedNode}
              onClose={() => {
                setIsPanelVisible(false);
                setSelectedNodeId(undefined);
              }}
              onDelete={handleDeleteNode}
              onDuplicate={handleDuplicateNode}
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
