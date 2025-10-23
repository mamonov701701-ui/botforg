import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import api from '@/api/client';
import Link from 'next/link';
import TemplateReviews from '@/components/TemplateReviews';

export default function TemplatePreviewPage() {
  const router = useRouter();
  const { id } = router.query;
  const [tpl, setTpl] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copying, setCopying] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [shareToast, setShareToast] = useState('');
  const [bonus, setBonus] = useState(0);
  const [useBonus, setUseBonus] = useState(false);
  const [usedBonus, setUsedBonus] = useState(0);
  const [paidReal, setPaidReal] = useState(0);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get(`/marketplace/template/${id}`)
      .then(res => {
        setTpl(res.data);
        // setIsPublic(res.data.is_public); // This line was not in the new_code, so it's removed.
      })
      .catch(() => setError('Ошибка загрузки'))
      .finally(() => setLoading(false));
    // Получить бонусы
    api.get('/referrals/me').then(res => setBonus(res.data.available_balance || 0));
  }, [id]);

  const handleCopy = async () => {
    setCopying(true);
    try {
      const res = await api.post(`/marketplace/template/${id}/copy`);
      setCopiedId(res.data.id);
      setTimeout(() => router.push(`/edit-template/${res.data.id}`), 1000);
    } catch {
      setError('Ошибка копирования');
    } finally {
      setCopying(false);
    }
  };

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      const body = useBonus ? { use_bonus: 1 } : {};
      const res = await api.post(`/marketplace/template/${id}/purchase`, body);
      setTpl({ ...tpl, purchased: true });
      setUsedBonus(res.used_bonus || 0);
      setPaidReal(res.paid_real || 0);
    } catch {
      setError('Ошибка покупки');
    } finally {
      setPurchasing(false);
    }
  };

  const handleShare = () => {
    const ref = tpl?.my_user_id || tpl?.author || 'me';
    const url = `${window.location.origin}/template/${tpl.id}?ref=${ref}`;
    navigator.clipboard.writeText(url);
    setShareToast('Ссылка скопирована!');
    setTimeout(() => setShareToast(''), 2000);
  };

  if (loading) return <div className="p-8">Загрузка...</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!tpl) return null;

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">{tpl.name}</h1>
      <div className="text-gray-500 mb-4">{tpl.description}</div>
      <div className="flex gap-2 mb-4">
        <span className="bg-gray-100 text-xs px-2 py-1 rounded">{tpl.category}</span>
        {tpl.tags.map((tag: string) => (
          <span key={tag} className="bg-blue-100 text-xs px-2 py-1 rounded">
            {tag}
          </span>
        ))}
      </div>
      <div className="mb-4 flex items-center gap-4">
        <span className="text-yellow-500">★</span>
        <span className="text-xs">{tpl.average_rating || 0}</span>
        <span className="ml-auto font-bold text-base">
          {tpl.price ? tpl.price + ' ₽' : 'Бесплатно'}
        </span>
      </div>
      <div className="mb-6">
        <h2 className="font-semibold mb-2">Блоки шаблона</h2>
        <div className="space-y-2">
          {tpl.price && tpl.price > 0 && !tpl.purchased ? (
            <div className="text-gray-400 italic">
              Структура шаблона скрыта. Купите шаблон для просмотра всех блоков.
            </div>
          ) : (
            tpl.blocks.map((block: any, i: number) => (
              <div key={block.id || i} className="border rounded px-3 py-2 bg-gray-50">
                <b>{block.data.label}</b>{' '}
                <span className="text-xs text-gray-500">[{block.type}]</span>
                {block.data.config?.description && (
                  <div className="text-xs text-gray-600 mt-1">{block.data.config.description}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
      <TemplateReviews
        templateId={tpl.id}
        canReview={tpl.purchased || !tpl.price || tpl.price === 0}
      />
      <div className="flex gap-4 mt-6 items-center">
        {tpl.price && tpl.price > 0 ? (
          tpl.purchased ? (
            <button className="bg-gray-200 text-gray-700 px-4 py-2 rounded" disabled>
              Куплено
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="text-sm text-gray-600 mb-1">
                Доступно бонусов: <b>{bonus} ₽</b>
              </div>
              <label className="flex items-center gap-2 mb-1">
                <input
                  type="checkbox"
                  checked={useBonus}
                  onChange={e => setUseBonus(e.target.checked)}
                />{' '}
                Использовать бонусы
              </label>
              <div className="text-xs text-gray-500 mb-1">
                Цена: <b>{tpl.price} ₽</b>
                {useBonus && (
                  <>
                    {' '}
                    → Списано бонусами: <b>{Math.min(bonus, tpl.price)} ₽</b> → К оплате:{' '}
                    <b>{Math.max(0, tpl.price - bonus)} ₽</b>
                  </>
                )}
              </div>
              <button
                className="bg-green-600 text-white px-4 py-2 rounded"
                onClick={handlePurchase}
                disabled={purchasing}
              >
                {purchasing ? 'Покупка...' : 'Купить'}
              </button>
              {usedBonus > 0 && (
                <div className="text-green-700 text-xs mt-1">
                  Списано бонусами: {usedBonus} ₽, оплачено: {paidReal} ₽
                </div>
              )}
            </div>
          )
        ) : (
          <button
            className="bg-blue-600 text-white px-4 py-2 rounded"
            onClick={handleCopy}
            disabled={copying}
          >
            {copiedId ? 'Скопировано!' : copying ? 'Копирование...' : 'Копировать'}
          </button>
        )}
        <button
          className="bg-gray-100 text-gray-700 px-4 py-2 rounded border"
          onClick={handleShare}
          title="Поделиться реферальной ссылкой"
        >
          🔗 Поделиться
        </button>
        {shareToast && <span className="text-green-600 text-sm ml-2">{shareToast}</span>}
        <Link href="/templates" className="ml-auto text-blue-600 underline">
          ← К витрине
        </Link>
      </div>
    </div>
  );
}
