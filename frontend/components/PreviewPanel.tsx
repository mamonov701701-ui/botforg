import React, { useState, useRef, useEffect } from 'react';
import { FlowNode, FlowEdge } from '@/types/flow';

interface PreviewPanelProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

const getRootNode = (nodes: FlowNode[]) => {
  return nodes.find(n => n.data?.is_start) || nodes[0];
};

const PreviewPanel: React.FC<PreviewPanelProps> = ({ nodes, edges }) => {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<any[]>([]);
  const [currentNode, setCurrentNode] = useState<FlowNode | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [ended, setEnded] = useState(false);
  const [animating, setAnimating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && log.length > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: 99999, behavior: 'smooth' });
      }, 200);
    }
  }, [log, open]);

  const startPreview = () => {
    const root = getRootNode(nodes);
    setLog([]);
    setCurrentNode(root || null);
    setInputValue('');
    setEnded(false);
    setAnimating(false);
    if (root) {
      setTimeout(() => {
        setLog([{ from: 'bot', text: root.data.label }]);
      }, 100);
    }
  };

  const handleButton = async (label: string) => {
    setAnimating(true);
    setLog(lg => [...lg, { from: 'user', text: label }]);
    await new Promise(res => setTimeout(res, 350));
    goToNext(label);
    setAnimating(false);
  };

  const handleInput = async () => {
    setAnimating(true);
    setLog(lg => [...lg, { from: 'user', text: inputValue }]);
    await new Promise(res => setTimeout(res, 350));
    goToNext();
    setInputValue('');
    setAnimating(false);
  };

  const goToNext = (label?: string) => {
    if (!currentNode) return;
    let nextEdge = edges.find(e => e.source === currentNode.id && (label ? e.data?.label === label : true));
    if (!nextEdge && !label) {
      nextEdge = edges.find(e => e.source === currentNode.id);
    }
    if (!nextEdge) {
      setEnded(true);
      setCurrentNode(null);
      setLog(lg => [...lg, { from: 'bot', text: 'Конец шаблона' }]);
      return;
    }
    const nextNode = nodes.find(n => n.id === nextEdge.target);
    if (!nextNode) {
      setEnded(true);
      setCurrentNode(null);
      setLog(lg => [...lg, { from: 'bot', text: 'Ошибка: блок не найден' }]);
      return;
    }
    setCurrentNode(nextNode);
    setLog(lg => [...lg, { from: 'bot', text: nextNode.data.label }]);
  };

  const getButtons = () => {
    if (!currentNode) return [];
    if (currentNode.type === 'button' && edges.filter(e => e.source === currentNode.id).length) {
      return edges.filter(e => e.source === currentNode.id && e.data?.label).map(e => e.data.label);
    }
    return [];
  };

  const isInput = currentNode && currentNode.type === 'input';

  return (
    <div className="w-full border-t bg-white">
      <button
        className="px-4 py-2 text-sm bg-gray-100 border-b w-full text-left"
        onClick={() => setOpen((v) => !v)}
        title="Показать/скрыть предпросмотр"
      >
        {open ? 'Скрыть предпросмотр' : 'Показать предпросмотр'}
      </button>
      {open && (
        <div className="p-4 flex flex-col h-96">
          <div className="flex justify-between items-center mb-2">
            <div className="font-bold">Предпросмотр шаблона</div>
            <button
              className="text-xs bg-blue-600 text-white px-3 py-1 rounded"
              onClick={startPreview}
              title="Начать заново"
            >Начать заново</button>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto bg-gray-50 rounded p-2 mb-2">
            {log.map((msg, i) => (
              <div key={i} className={`flex ${msg.from === 'bot' ? 'justify-start' : 'justify-end'} mb-1`}>
                <div className={`px-4 py-2 rounded-2xl max-w-[70%] shadow-md transition-all duration-200 ${msg.from === 'bot' ? 'bg-gradient-to-br from-gray-200 to-gray-100 text-gray-900 border border-gray-300' : 'bg-gradient-to-br from-blue-500 to-blue-400 text-white border border-blue-400'}`} style={{wordBreak:'break-word'}}>
                  {msg.text}
                </div>
              </div>
            ))}
            {/* payment preview */}
            {!ended && currentNode && currentNode.type === 'payment' && (
              <div className="flex justify-center my-4">
                <div className="bg-yellow-100 border border-yellow-400 text-yellow-800 rounded px-4 py-3 text-center">
                  <div className="font-bold mb-1">Оплата</div>
                  <div>Сумма: <b>{currentNode.data.config?.amount || 0} {currentNode.data.config?.currency || 'RUB'}</b></div>
                  <div className="text-xs text-gray-600">{currentNode.data.config?.description}</div>
                  <div className="mt-2 text-xs text-gray-500">(В реальном боте здесь будет кнопка оплаты)</div>
                </div>
              </div>
            )}
          </div>
          {!ended && currentNode && (
            <div className="mt-2">
              {getButtons().length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {getButtons().map((btn, i) => (
                    <button
                      key={i}
                      className="bg-blue-600 text-white px-4 py-1 rounded mb-1 shadow hover:bg-blue-700 transition"
                      onClick={() => handleButton(btn)}
                      disabled={animating}
                      title={animating ? 'Подождите...' : btn}
                    >{btn}</button>
                  ))}
                </div>
              )}
              {isInput && (
                <form
                  onSubmit={e => { e.preventDefault(); handleInput(); }}
                  className="flex gap-2 mt-2"
                >
                  <input
                    type="text"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    className="border rounded px-2 py-1 flex-1 shadow"
                    placeholder="Введите текст..."
                    disabled={ended || animating}
                  />
                  <button
                    type="submit"
                    className="bg-blue-600 text-white px-4 py-1 rounded shadow"
                    disabled={!inputValue || animating}
                    title={animating ? 'Подождите...' : 'Отправить'}
                  >Отправить</button>
                </form>
              )}
            </div>
          )}
          {ended && (
            <div className="text-center text-gray-500 mt-4">Конец шаблона</div>
          )}
        </div>
      )}
    </div>
  );
};

export default PreviewPanel; 