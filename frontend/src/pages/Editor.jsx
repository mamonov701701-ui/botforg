import ReactFlow from 'reactflow';
import 'reactflow/dist/style.css';

const nodes = [
  { id: '1', type: 'input', data: { label: 'Начало' }, position: { x: 250, y: 5 } },
  { id: '2', data: { label: 'Шаг 1' }, position: { x: 100, y: 100 } },
  { id: '3', data: { label: 'Шаг 2' }, position: { x: 400, y: 100 } },
];

const edges = [
  { id: 'e1-2', source: '1', target: '2' },
  { id: 'e2-3', source: '2', target: '3' },
];

export default function Editor() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow nodes={nodes} edges={edges} fitView />
    </div>
  );
}
