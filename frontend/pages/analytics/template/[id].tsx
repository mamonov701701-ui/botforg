import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '@/api/client';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

function exportToCSV(data: any[], filename: string) {
  if (!data.length) return;
  const csv = [
    Object.keys(data[0]).join(','),
    ...data.map((row) => Object.values(row).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
}

export default function TemplateAnalyticsPage() {
  const router = useRouter();
  const { id } = router.query;
  const [data, setData] = useState<any>(null);
  const [blockStats, setBlockStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.get(`/analytics/template/${id}`),
      api.get(`/analytics/stats/${id}`),
    ])
      .then(([tpl, stats]) => {
        setData(tpl.data);
        setBlockStats(stats.data);
      })
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8">Загрузка...</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!data) return null;

  const blockLabels = Object.values(blockStats).map((b: any) => b.label);
  const blockCounts = Object.values(blockStats).map((b: any) => b.count);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Аналитика: {data.name}</h1>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-50 p-4 rounded shadow text-center">
          <div className="text-2xl font-bold">{data.launches}</div>
          <div className="text-xs text-gray-500 mt-1">Запусков</div>
        </div>
        <div className="bg-gray-50 p-4 rounded shadow text-center">
          <div className="text-2xl font-bold">{data.completions}</div>
          <div className="text-xs text-gray-500 mt-1">Завершений</div>
        </div>
        <div className="bg-gray-50 p-4 rounded shadow text-center">
          <div className="text-2xl font-bold">{data.payments_count}</div>
          <div className="text-xs text-gray-500 mt-1">Оплат</div>
        </div>
        <div className="bg-gray-50 p-4 rounded shadow text-center">
          <div className="text-2xl font-bold">{data.payments_sum} ₽</div>
          <div className="text-xs text-gray-500 mt-1">Доход</div>
        </div>
      </div>
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-2">График прохождения по блокам</h2>
        <Bar
          data={{
            labels: blockLabels,
            datasets: [
              {
                label: 'Переходов',
                data: blockCounts,
                backgroundColor: '#2563eb',
              },
            ],
          }}
          options={{
            responsive: true,
            plugins: { legend: { display: false }, title: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
          }}
        />
      </div>
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Топ точек выхода</h2>
        <ul className="list-disc pl-6">
          {data.top_exits.map(([nodeId, count]: [string, number]) => (
            <li key={nodeId} className="mb-1">{blockStats[nodeId]?.label || nodeId}: <b>{count}</b></li>
          ))}
        </ul>
      </div>
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-2">Оплаты</h2>
        <button
          className="mb-2 bg-blue-600 text-white px-4 py-1 rounded text-xs"
          onClick={() => exportToCSV(data.payments, `payments-template-${id}.csv`)}
        >Экспорт оплат в CSV</button>
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">ID</th>
              <th className="p-2 border">Сумма</th>
              <th className="p-2 border">Валюта</th>
              <th className="p-2 border">Статус</th>
              <th className="p-2 border">Дата</th>
            </tr>
          </thead>
          <tbody>
            {data.payments.map((p: any) => (
              <tr key={p.id}>
                <td className="p-2 border">{p.id}</td>
                <td className="p-2 border">{p.amount}</td>
                <td className="p-2 border">{p.currency}</td>
                <td className="p-2 border">{p.status}</td>
                <td className="p-2 border">{new Date(p.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
} 