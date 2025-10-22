import React, { useEffect, useState } from 'react';
import api from '@/api/client';

export default function ReferralsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copyToast, setCopyToast] = useState('');
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    api.get('/referrals/me')
      .then(res => {
        setData(res.data);
        // Попробуем получить userId из первой рефки или из auth (если есть)
        if (res.data.referrals.length > 0) setUserId(res.data.referrals[0].user_id);
      })
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false));
    // Можно получить userId из auth/me, если есть
  }, []);

  const handleCopy = () => {
    // userId должен быть id текущего пользователя
    const id = userId || 'YOUR_ID';
    const url = `${window.location.origin}/templates?ref=${id}`;
    navigator.clipboard.writeText(url);
    setCopyToast('Ссылка скопирована!');
    setTimeout(() => setCopyToast(''), 2000);
  };

  if (loading) return <div className="p-8">Загрузка...</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!data) return null;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Реферальный кабинет</h1>
      <div className="bg-yellow-50 border border-yellow-200 rounded p-4 mb-6 flex items-center gap-6">
        <div>
          <div className="text-lg font-semibold mb-1">💰 Вы заработали: <span className="text-green-700 font-bold">{data.total_earned} ₽</span></div>
          <div className="text-sm text-gray-600">Доступно: <span className="font-bold">{data.available_balance} ₽</span></div>
        </div>
        <button
          className="ml-auto bg-blue-600 text-white px-4 py-2 rounded text-sm"
          onClick={handleCopy}
        >Скопировать свою реферальную ссылку</button>
        {copyToast && <span className="ml-2 text-green-600 text-sm">{copyToast}</span>}
      </div>
      <div className="mb-4 text-gray-500 text-sm">Бонусы можно использовать при покупке шаблонов (скоро)</div>
      <h2 className="font-semibold mb-2">Приглашённые</h2>
      {data.referrals.length === 0 ? (
        <div className="text-gray-400">Вы пока никого не пригласили</div>
      ) : (
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">Приглашённый</th>
              <th className="p-2 border">Шаблон</th>
              <th className="p-2 border">Дата</th>
              <th className="p-2 border">Бонус</th>
            </tr>
          </thead>
          <tbody>
            {data.referrals.map((r: any, i: number) => (
              <tr key={i}>
                <td className="p-2 border">{r.user_email}</td>
                <td className="p-2 border">{r.template_title}</td>
                <td className="p-2 border">{new Date(r.date).toLocaleDateString()}</td>
                <td className="p-2 border">💸 {r.reward_amount} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
} 