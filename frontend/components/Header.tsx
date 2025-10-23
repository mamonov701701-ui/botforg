import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/api/client';

export default function Header() {
  const [bonus, setBonus] = useState<number | null>(null);

  const fetchBonus = () => {
    api.get('/user/balance').then(res => setBonus(res.data.available_bonus));
  };

  useEffect(() => {
    fetchBonus();
    // Можно подписаться на событие "bonus-updated" для автообновления
    window.addEventListener('bonus-updated', fetchBonus);
    return () => window.removeEventListener('bonus-updated', fetchBonus);
  }, []);

  return (
    <header className="w-full bg-white border-b flex items-center px-6 py-3 gap-6">
      <Link href="/" className="font-bold text-xl text-blue-700">
        BotForg
      </Link>
      <nav className="flex gap-4 ml-auto items-center">
        <Link href="/templates" className="text-sm text-gray-700 hover:underline">
          Маркетплейс
        </Link>
        <Link href="/analytics" className="text-sm text-gray-700 hover:underline">
          Аналитика
        </Link>
        <Link href="/referrals" className="text-sm text-gray-700 hover:underline">
          Рефералы
        </Link>
        {bonus !== null && (
          <Link
            href="/referrals"
            className="ml-4 flex items-center gap-1 text-green-700 font-semibold text-sm hover:underline"
            title="Доступно для покупок шаблонов"
          >
            <span className="text-lg">💰</span> {bonus} ₽
          </Link>
        )}
        <Link href="/account" className="ml-4 text-gray-700 hover:underline">
          Профиль
        </Link>
      </nav>
    </header>
  );
}
