import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/api/client';

export default function AnalyticsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/analytics/templates')
      .then(res => setData(res.data))
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8">Загрузка...</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Аналитика по шаблонам</h1>
      <table className="w-full border text-sm mb-8">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border">Название</th>
            <th className="p-2 border">Запуски</th>
            <th className="p-2 border">Завершения</th>
            <th className="p-2 border">Оплаты</th>
            <th className="p-2 border">Доход</th>
            <th className="p-2 border"></th>
          </tr>
        </thead>
        <tbody>
          {data.map((tpl) => (
            <tr key={tpl.id}>
              <td className="p-2 border">{tpl.name}</td>
              <td className="p-2 border text-center">{tpl.launches}</td>
              <td className="p-2 border text-center">{tpl.completions}</td>
              <td className="p-2 border text-center">{tpl.payments_count}</td>
              <td className="p-2 border text-center">{tpl.payments_sum} ₽</td>
              <td className="p-2 border text-center">
                <Link href={`/analytics/template/${tpl.id}`} className="text-blue-600 underline">Детали</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
} 