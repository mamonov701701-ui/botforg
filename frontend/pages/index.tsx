import React from 'react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 font-['Roboto']">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 border-b bg-white">
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-blue-900 font-['Poppins']">BF</span>
          <span className="font-bold text-blue-900 font-['Poppins']">BotForg</span>
        </div>
        <nav className="flex gap-6 items-center text-sm">
          <Link href="#features" className="hover:underline">Возможности</Link>
          <Link href="#pricing" className="hover:underline">Тарифы</Link>
          <Link href="/templates" className="hover:underline">Витрина</Link>
          <Link href="/login" className="hover:underline">Войти</Link>
          <Link href="/register" className="ml-4 px-5 py-2 rounded bg-yellow-400 text-blue-900 font-bold hover:bg-yellow-300 transition">Начать бесплатно</Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="flex flex-col md:flex-row items-center justify-between px-8 py-16 max-w-6xl mx-auto gap-12">
        <div className="flex-1">
          <h1 className="text-4xl md:text-5xl font-bold font-['Poppins'] text-blue-900 mb-4">BotForg — Технологии в действии</h1>
          <div className="text-lg text-gray-700 mb-8">Создавайте чат-ботов с оплатой, аналитикой и шаблонами без кода</div>
          <div className="flex gap-4 mb-8">
            <Link href="/register" className="px-6 py-3 rounded bg-yellow-400 text-blue-900 font-bold text-lg hover:bg-yellow-300 transition">Создать бота</Link>
            <Link href="/demo" className="px-6 py-3 rounded border border-blue-900 text-blue-900 font-bold text-lg hover:bg-blue-50 transition">Смотреть демо</Link>
          </div>
        </div>
        <div className="flex-1 flex justify-center">
          <img src="/static/editor-mockup.png" alt="Редактор BotForg" className="rounded-xl shadow-xl w-full max-w-md border" />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-gray-50 py-16">
        <div className="max-w-6xl mx-auto px-8">
          <h2 className="text-2xl font-bold font-['Poppins'] text-blue-900 mb-8">Возможности платформы</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center">
              <span className="text-4xl mb-2">🧩</span>
              <div className="font-semibold mb-1">Визуальный редактор сценариев</div>
              <div className="text-gray-600 text-sm">Создавайте логику бота без кода — drag&drop, блоки, условия, интеграции.</div>
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-4xl mb-2">💬</span>
              <div className="font-semibold mb-1">Telegram и WhatsApp</div>
              <div className="text-gray-600 text-sm">Запускайте ботов в популярных мессенджерах. Поддержка оплат, кнопок, медиа.</div>
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-4xl mb-2">🛒</span>
              <div className="font-semibold mb-1">Готовые шаблоны и маркетплейс</div>
              <div className="text-gray-600 text-sm">Быстрый старт с готовыми решениями. Витрина, копирование, монетизация.</div>
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-4xl mb-2">🔗</span>
              <div className="font-semibold mb-1">Интеграции: оплаты, API, аналитика</div>
              <div className="text-gray-600 text-sm">Подключайте платежи, внешние сервисы, получайте аналитику по сценариям.</div>
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-4xl mb-2">🎁</span>
              <div className="font-semibold mb-1">Реферальная система и бонусы</div>
              <div className="text-gray-600 text-sm">Делитесь шаблонами, получайте бонусы за приглашения и покупки по вашим ссылкам.</div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 max-w-6xl mx-auto px-8">
        <h2 className="text-2xl font-bold font-['Poppins'] text-blue-900 mb-8">Как это работает</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center">
          <div>
            <div className="text-4xl mb-2">📝</div>
            <div className="font-semibold mb-1">1. Зарегистрируйтесь</div>
            <div className="text-gray-600 text-sm">Создайте аккаунт за 1 минуту</div>
          </div>
          <div>
            <div className="text-4xl mb-2">📦</div>
            <div className="font-semibold mb-1">2. Создайте шаблон</div>
            <div className="text-gray-600 text-sm">Выберите готовый сценарий или начните с нуля</div>
          </div>
          <div>
            <div className="text-4xl mb-2">🤖</div>
            <div className="font-semibold mb-1">3. Подключите Telegram-бота</div>
            <div className="text-gray-600 text-sm">Интеграция за пару кликов</div>
          </div>
          <div>
            <div className="text-4xl mb-2">💸</div>
            <div className="font-semibold mb-1">4. Получайте оплаты и аналитику</div>
            <div className="text-gray-600 text-sm">Монетизируйте сценарии, отслеживайте результаты</div>
          </div>
        </div>
      </section>

      {/* Screenshots / Examples */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-6xl mx-auto px-8">
          <h2 className="text-2xl font-bold font-['Poppins'] text-blue-900 mb-8">Примеры интерфейса</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <img src="/static/editor-mockup.png" alt="Редактор шаблонов" className="rounded-xl shadow border" />
            <img src="/static/marketplace-mockup.png" alt="Витрина шаблонов" className="rounded-xl shadow border" />
            <img src="/static/analytics-mockup.png" alt="Аналитика" className="rounded-xl shadow border" />
            <img src="/static/telegram-mockup.png" alt="Telegram-бот" className="rounded-xl shadow border" />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 max-w-6xl mx-auto px-8">
        <h2 className="text-2xl font-bold font-['Poppins'] text-blue-900 mb-8">Тарифы</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="border rounded-xl p-6 bg-white shadow flex flex-col items-center">
            <div className="font-bold text-lg mb-2">Бесплатный</div>
            <div className="text-3xl font-bold text-blue-900 mb-2">0 ₽</div>
            <ul className="text-gray-600 text-sm mb-4 list-disc pl-4">
              <li>1 бот</li>
              <li>Ограниченный маркетплейс</li>
              <li>Базовая аналитика</li>
            </ul>
            <Link href="/register" className="mt-auto px-4 py-2 rounded bg-yellow-400 text-blue-900 font-bold hover:bg-yellow-300 transition">Начать</Link>
          </div>
          <div className="border-2 border-yellow-400 rounded-xl p-6 bg-white shadow flex flex-col items-center">
            <div className="font-bold text-lg mb-2">Бизнес</div>
            <div className="text-3xl font-bold text-blue-900 mb-2">990 ₽/мес</div>
            <ul className="text-gray-600 text-sm mb-4 list-disc pl-4">
              <li>До 10 ботов</li>
              <li>Премиум шаблоны</li>
              <li>Расширенная аналитика</li>
              <li>Поддержка</li>
            </ul>
            <Link href="/register" className="mt-auto px-4 py-2 rounded bg-yellow-400 text-blue-900 font-bold hover:bg-yellow-300 transition">Попробовать</Link>
          </div>
          <div className="border rounded-xl p-6 bg-white shadow flex flex-col items-center">
            <div className="font-bold text-lg mb-2">Премиум</div>
            <div className="text-3xl font-bold text-blue-900 mb-2">2990 ₽/мес</div>
            <ul className="text-gray-600 text-sm mb-4 list-disc pl-4">
              <li>Безлимит ботов</li>
              <li>Все шаблоны и интеграции</li>
              <li>API-доступ</li>
              <li>Личный менеджер</li>
            </ul>
            <Link href="/register" className="mt-auto px-4 py-2 rounded bg-yellow-400 text-blue-900 font-bold hover:bg-yellow-300 transition">Выбрать</Link>
          </div>
        </div>
        <div className="text-center mt-6">
          <Link href="/pricing" className="text-blue-700 underline">Смотреть все тарифы</Link>
        </div>
      </section>

      {/* Reviews */}
      <section className="py-16 max-w-4xl mx-auto px-8">
        <h2 className="text-2xl font-bold font-['Poppins'] text-blue-900 mb-6">Отзывы</h2>
        <div className="text-gray-500 text-center italic">Отзывы скоро появятся — присоединяйтесь к первым пользователям!</div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-yellow-400 text-center">
        <h2 className="text-3xl font-bold font-['Poppins'] text-blue-900 mb-4">Начни свой первый сценарий уже сегодня</h2>
        <Link href="/register" className="px-8 py-4 rounded bg-blue-900 text-yellow-400 font-bold text-lg hover:bg-blue-800 transition">Создать бесплатно</Link>
      </section>

      {/* Footer */}
      <footer className="bg-blue-900 text-white py-8 px-8 mt-8">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2 mb-2 md:mb-0">
            <span className="text-xl font-bold font-['Poppins']">BF</span>
            <span className="font-bold font-['Poppins']">BotForg</span>
          </div>
          <nav className="flex gap-6 text-sm mb-2 md:mb-0">
            <Link href="/about" className="hover:underline">О платформе</Link>
            <Link href="/support" className="hover:underline">Поддержка</Link>
            <Link href="/docs" className="hover:underline">Документация</Link>
            <a href="https://t.me/botforg" className="hover:underline" target="_blank" rel="noopener noreferrer">Telegram-канал</a>
            <Link href="/policy" className="hover:underline">Политика</Link>
            <Link href="/terms" className="hover:underline">Пользовательское соглашение</Link>
          </nav>
          <div className="text-xs text-gray-300">© BotForg, 2025</div>
        </div>
      </footer>
    </div>
  );
} 