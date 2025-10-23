import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import NodePanel from '../../components/NodePanel';
import FlowEditor from '../../components/FlowEditor';
import NodeSettings from '../../components/NodeSettings';
import PreviewPanel from '../../components/PreviewPanel';
import { getTemplateContent, saveTemplateContent, publishTemplate } from '../../api/templates';
import { FlowNode, FlowEdge } from '../../types/flow';
import { validateFlow } from '../../utils/validateFlow';
import Link from 'next/link';

const EditTemplatePage: React.FC = () => {
  const router = useRouter();
  const { id } = router.query;
  const idStr = Array.isArray(id) ? id[0] : id;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [initialNodes, setInitialNodes] = useState<FlowNode[]>([]);
  const [initialEdges, setInitialEdges] = useState<FlowEdge[]>([]);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const isDirty =
    JSON.stringify(nodes) !== JSON.stringify(initialNodes) ||
    JSON.stringify(edges) !== JSON.stringify(initialEdges);
  const mountedRef = useRef(false);
  const [errorIds, setErrorIds] = useState<{ nodes: string[]; edges: string[] }>({
    nodes: [],
    edges: [],
  });
  const [toast, setToast] = useState<string | null>(null);
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  const [isPublic, setIsPublic] = useState<boolean | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [pubToast, setPubToast] = useState<string | null>(null);

  useEffect(() => {
    if (!idStr) return;
    setLoading(true);
    getTemplateContent(idStr)
      .then((tpl: any) => {
        let content = tpl.content || {};
        const nodesIn = Array.isArray(content.nodes) ? (content.nodes as FlowNode[]) : [];
        const edgesIn = Array.isArray(content.edges) ? (content.edges as FlowEdge[]) : [];

        let nextNodes = [...nodesIn];
        // Ensure/start node exists and placed top-left
        let startIndex = nextNodes.findIndex((n: any) => n.type === 'start');
        if (startIndex === -1) {
          nextNodes.unshift({
            id: `start_${Date.now()}`,
            type: 'start' as any,
            position: { x: 50, y: 50 },
            data: { type: 'start' as any, label: 'Начало' },
          });
        } else {
          const s = nextNodes[startIndex];
          const nearCenter =
            !s.position || (Math.abs(s.position.x ?? 0) < 150 && Math.abs(s.position.y ?? 0) < 150);
          if (nearCenter) {
            nextNodes[startIndex] = { ...s, position: { x: 50, y: 50 } };
          }
          if (!s.data?.label) {
            nextNodes[startIndex] = {
              ...nextNodes[startIndex],
              data: { ...s.data, label: 'Начало' },
            } as any;
          }
        }

        setInitialNodes(nextNodes);
        setInitialEdges(edgesIn);
        setNodes(nextNodes);
        setEdges(edgesIn);
        setIsPublic(tpl.is_public);
      })
      .catch(() => setError('Ошибка загрузки шаблона'))
      .finally(() => setLoading(false));
  }, [idStr]);

  // Защита от потери изменений
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Автосохранение
  useEffect(() => {
    if (!idStr) return;
    if (!isDirty) return;
    const timer = setInterval(async () => {
      try {
        await saveTemplateContent(idStr!, { nodes, edges });
        setInitialNodes(nodes);
        setInitialEdges(edges);
        setLastAutoSave(new Date());
      } catch {}
    }, 30000);
    return () => clearInterval(timer);
  }, [idStr, nodes, edges, isDirty]);

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    setToast(null);
    setErrorIds({ nodes: [], edges: [] });
    const validation = validateFlow(nodes, edges);
    if (!validation.valid) {
      setSaveStatus('error');
      setToast(validation.errors[0] || 'Validation failed');
      setSaving(false);
      return;
    }
    try {
      await saveTemplateContent(idStr!, { nodes, edges });
      setInitialNodes(nodes);
      setInitialEdges(edges);
      setSaveStatus('success');
      setToast('Шаблон успешно сохранён');
    } catch {
      setSaveStatus('error');
      setToast('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const data = JSON.stringify({ nodes, edges }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `template-${id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handlePublish = async (val: boolean) => {
    setPublishing(true);
    setPubToast(null);
    try {
      await publishTemplate(idStr!, { is_public: val });
      setIsPublic(val);
      setPubToast(val ? 'Шаблон опубликован!' : 'Публикация снята');
    } catch {
      setPubToast('Ошибка публикации');
    } finally {
      setPublishing(false);
      setTimeout(() => setPubToast(null), 2000);
    }
  };

  // Выбор и редактирование блока
  const selectedNode = nodes.find(n => n.id === selectedNodeId) || null;
  const handleUpdateNode = (id: string, data: any) => {
    setNodes(nodes.map(n => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)));
  };

  if (loading) return <div>Загрузка...</div>;
  if (error) return <div className="text-red-600 p-4">{error}</div>;

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b bg-white z-20">
        <div className="text-xl font-bold">Редактор шаблона #{id}</div>
        <div className="flex items-center gap-4">
          <button
            className={`px-4 py-2 rounded text-white ${
              isDirty ? 'bg-blue-600' : 'bg-gray-400'
            } disabled:opacity-50`}
            onClick={handleSave}
            disabled={!isDirty || saving}
            title="Сохранить шаблон (Ctrl+S)"
          >
            {saving ? 'Сохраняю...' : 'Сохранить'}
          </button>
          <button
            className="px-4 py-2 rounded bg-green-600 text-white"
            onClick={handleExport}
            title="Экспортировать шаблон в .json"
          >
            Экспорт
          </button>
          {lastAutoSave && (
            <span className="text-xs text-gray-500">
              Автосохранено: {lastAutoSave.toLocaleTimeString()}
            </span>
          )}
        </div>
        {saveStatus === 'success' && <span className="ml-4 text-green-600">Сохранено!</span>}
        {saveStatus === 'error' && <span className="ml-4 text-red-600">Ошибка сохранения</span>}
      </div>
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-6 py-2 rounded shadow-lg z-50 animate-fade-in">
          {toast}
        </div>
      )}
      <div className="flex gap-4 mt-6 items-center">
        {isPublic !== null && (
          <button
            className={`px-4 py-2 rounded text-white ${isPublic ? 'bg-gray-500' : 'bg-blue-600'}`}
            onClick={() => handlePublish(!isPublic)}
            disabled={publishing}
            title={
              isPublic
                ? 'Снять с публикации. Шаблон исчезнет из витрины.'
                : 'Опубликовать. Шаблон появится в витрине и будет доступен другим пользователям.'
            }
          >
            {isPublic ? '🙈 Снять с публикации' : '📢 Опубликовать'}
          </button>
        )}
        {pubToast && <span className="ml-2 text-green-600 text-sm">{pubToast}</span>}
        <Link href="/templates" className="ml-auto text-blue-600 underline">
          ← К витрине
        </Link>
      </div>
      <div className="flex-1 grid grid-cols-12 gap-0 h-0 min-h-0">
        <div className="col-span-2 border-r bg-white min-h-0 overflow-y-auto">
          <NodePanel />
        </div>
        <div className="col-span-8 min-h-0 relative">
          <FlowEditor
            nodes={nodes}
            setNodes={setNodes}
            edges={edges}
            setEdges={setEdges}
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
            errorNodeIds={errorIds.nodes}
            errorEdgeIds={errorIds.edges}
          />
          <div className="absolute top-2 right-2 w-72 bg-white border rounded shadow-lg z-10">
            <NodeSettings node={selectedNode} onUpdate={handleUpdateNode} />
          </div>
        </div>
        <div className="col-span-2 border-l bg-white min-h-0 overflow-y-auto">
          {/* Можно добавить дополнительные панели */}
        </div>
      </div>
      <PreviewPanel nodes={nodes} edges={edges} />
    </div>
  );
};

export default EditTemplatePage;
