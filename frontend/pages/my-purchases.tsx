import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useEffect, useState } from 'react';
import { getMyPurchases } from '@/api/purchases';
import Link from 'next/link';

const CATEGORIES = [
  { value: '', label: 'Все категории' },
  { value: 'shop', label: 'Магазин' },
  { value: 'quiz', label: 'Квиз' },
  { value: 'restaurant', label: 'Ресторан' },
  // ...добавьте свои категории
];

export default function MyPurchasesPage() {
  const { user, loading } = useRequireAuth();
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loadingPurchases, setLoadingPurchases] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadPurchases = async () => {
    setLoadingPurchases(true);
    setError('');
    try {
      const params: any = {};
      if (category) params.category = category;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const data = await getMyPurchases(params);
      setPurchases(data);
    } catch {
      setError('Ошибка загрузки покупок');
    } finally {
      setLoadingPurchases(false);
    }
  };

  useEffect(() => {
    loadPurchases();
    // eslint-disable-next-line
  }, [category, dateFrom, dateTo]);

  if (loading || loadingPurchases) return <div>Загрузка...</div>;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Мои покупки</h1>
      <div className="flex gap-4 mb-4 items-end">
        <div>
          <label className="block text-sm mb-1">Категория</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="border rounded px-2 py-1"
          >
            {CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm mb-1">С даты</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="border rounded px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">По дату</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="border rounded px-2 py-1"
          />
        </div>
      </div>
      <div className="mb-4 text-sm text-gray-600">Всего: {purchases.length}</div>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {purchases.length === 0 ? (
        <div>У вас пока нет купленных шаблонов.</div>
      ) : (
        <ul className="space-y-3">
          {purchases.map((p: any) => (
            <li key={p.id} className="border p-3 rounded flex justify-between items-center">
              <div>
                <div className="font-semibold">{p.template?.name}</div>
                <div className="text-xs text-gray-500">Категория: {p.template?.category}</div>
                <div className="text-xs text-gray-500">
                  Куплен: {new Date(p.created_at).toLocaleDateString()}
                </div>
                <div className="text-xs mt-1 text-gray-700">{p.template?.description}</div>
              </div>
              <Link
                href={`/template/${p.template?.id}`}
                className="px-3 py-1 bg-blue-600 text-white rounded text-xs"
              >
                Перейти к шаблону
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
