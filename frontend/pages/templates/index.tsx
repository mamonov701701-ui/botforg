import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/api/client';

export default function TemplatesMarketplace() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [sort, setSort] = useState('new');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const load = () => {
    setLoading(true);
    const queryParams = new URLSearchParams();
    if (search) queryParams.append('search', search);
    if (category) queryParams.append('category', category);
    if (price) queryParams.append('price', price);
    if (sort) queryParams.append('sort', sort);
    queryParams.append('page', page.toString());
    queryParams.append('page_size', pageSize.toString());
    
    api.get(`/marketplace/templates?${queryParams.toString()}`)
      .then((res: any) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, category, price, sort, page]);

  function StarRating({ value, count }: { value: number, count: number }) {
    return (
      <span className="flex items-center gap-1" title={count > 0 ? `${count} отзывов` : 'Нет отзывов'}>
        {count > 0 ? <span className="text-yellow-500 text-base">★</span> : <span className="text-gray-300 text-base">★</span>}
        <span className="text-gray-800 text-sm font-semibold">{count > 0 ? value.toFixed(1) : '—'}</span>
        {count > 0 && <span className="text-gray-500 text-xs">({count})</span>}
      </span>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Маркетплейс шаблонов</h1>
      <div className="flex flex-wrap gap-4 mb-6 items-end">
        <input
          type="text"
          placeholder="Поиск..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="border rounded px-3 py-2 text-sm"
        />
        <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} className="border rounded px-2 py-2 text-sm">
          <option value="">Все категории</option>
          <option value="bots">Боты</option>
          <option value="shop">Магазины</option>
          <option value="quiz">Квизы</option>
        </select>
        <select value={price} onChange={e => { setPrice(e.target.value); setPage(1); }} className="border rounded px-2 py-2 text-sm">
          <option value="">Все</option>
          <option value="free">Бесплатные</option>
          <option value="paid">Платные</option>
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} className="border rounded px-2 py-2 text-sm">
          <option value="new">Сначала новые</option>
          <option value="price">По цене</option>
          <option value="rating">По рейтингу</option>
        </select>
      </div>
      {loading ? (
        <div>Загрузка...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 mb-8">
            {items.map((tpl) => (
              <div key={tpl.id} className="border rounded-lg p-4 bg-white shadow flex flex-col">
                <div className="font-bold text-lg mb-1 flex items-center gap-2">
                  {tpl.name}
                  <StarRating value={tpl.average_rating || 0} count={tpl.rating_count || 0} />
                </div>
                <div className="text-gray-500 text-sm mb-2 line-clamp-2">{tpl.description}</div>
                <div className="flex gap-2 flex-wrap mb-2">
                  <span className="bg-gray-100 text-xs px-2 py-1 rounded">{tpl.category}</span>
                  {tpl.tags.map((tag: string) => (
                    <span key={tag} className="bg-blue-100 text-xs px-2 py-1 rounded">{tag}</span>
                  ))}
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-yellow-500">★</span>
                  <span className="text-xs">{tpl.average_rating || 0}</span>
                  <span className="ml-auto font-bold text-base">{tpl.price ? tpl.price + ' ₽' : 'Бесплатно'}</span>
                </div>
                <div className="flex gap-2 mt-auto">
                  <Link href={`/template/${tpl.id}`} className="bg-blue-600 text-white px-3 py-1 rounded text-xs">Смотреть</Link>
                  {tpl.price && tpl.price > 0 ? (
                    <button className="bg-green-600 text-white px-3 py-1 rounded text-xs">Купить</button>
                  ) : (
                    <button className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs">Копировать</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 justify-center">
            {Array.from({ length: Math.ceil(total / pageSize) }, (_, i) => (
              <button
                key={i}
                className={`px-3 py-1 rounded ${page === i + 1 ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
                onClick={() => setPage(i + 1)}
              >{i + 1}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
} 