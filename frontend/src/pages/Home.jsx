import {
  LayoutDashboard,
  Settings2,
  Workflow,
  BarChart3,
  FileStack,
  Rocket
} from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen font-sans">
      {/* Hero-блок */}
      <section className="max-w-screen-xl mx-auto px-4 py-16 flex flex-col items-center justify-center">
        <div className="bg-white/10 rounded-xl p-10 w-full flex flex-col items-center justify-center text-center text-white">
          <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            Запустите чат-бота за 10 минут —<br />без кода и программистов
          </h1>
          <p className="text-lg md:text-xl mb-8 max-w-2xl">
            Выберите шаблон, настройте блоки в редакторе и начните автоматизировать свой бизнес уже сегодня.
          </p>
          <button className="bg-yellow-400 text-black font-semibold py-4 px-8 rounded-full hover:bg-yellow-300 shadow-xl transition transform hover:scale-105 text-lg">
            Начать бесплатно
          </button>
        </div>
      </section>

      {/* Блок преимуществ */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-8 text-white text-center px-4 py-20 max-w-6xl mx-auto">
        <div className="p-6 rounded-xl bg-white/10 hover:scale-105 hover:shadow-xl transition text-center">
          <LayoutDashboard className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-1 text-white">Шаблоны</h3>
          <p className="text-sm text-gray-300">Готовые решения — просто выберите и запустите</p>
        </div>
        <div className="p-6 rounded-xl bg-white/10 hover:scale-105 hover:shadow-xl transition text-center">
          <Settings2 className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-1 text-white">Без кода</h3>
          <p className="text-sm text-gray-300">Визуальный редактор — только для ботов</p>
        </div>
        <div className="p-6 rounded-xl bg-white/10 hover:scale-105 hover:shadow-xl transition text-center">
          <Workflow className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-1 text-white">Интеграции</h3>
          <p className="text-sm text-gray-300">Telegram, WhatsApp, Google, ЮKassa, Stripe и др.</p>
        </div>
        <div className="p-6 rounded-xl bg-white/10 hover:scale-105 hover:shadow-xl transition text-center">
          <BarChart3 className="w-10 h-10 text-yellow-400 mx-auto mb-3" />
          <h3 className="text-lg font-semibold mb-1 text-white">Аналитика</h3>
          <p className="text-sm text-gray-300">Отслеживайте, как пользователи общаются с ботами</p>
        </div>
      </section>

      {/* Секция визуального редактора */}
      <section className="max-w-screen-xl mx-auto px-4 py-16">
        <div className="bg-white/10 rounded-xl p-10 flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="flex-1 text-white text-center md:text-left">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Визуальный редактор, с которым справится даже новичок</h2>
            <p className="mb-8 text-gray-300 text-lg max-w-xl">
              Перетаскивайте блоки, связывайте сценарии, подключайте оплату и интеграции — всё через понятный интерфейс.
            </p>
            <button className="bg-yellow-400 text-black font-semibold py-4 px-8 rounded-full hover:bg-yellow-300 shadow-xl transition transform hover:scale-105 text-lg">
              Попробовать
            </button>
          </div>
          <div className="flex-1 flex justify-center">
            <div className="mx-auto rounded-2xl shadow-2xl w-full max-w-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center" style={{ height: '400px' }}>
              <span className="text-white text-2xl">Демо редактора</span>
            </div>
          </div>
        </div>
      </section>

      {/* 3 шага до вашего чат-бота */}
      <section className="max-w-screen-xl mx-auto px-4 py-16">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-10">
          Всего 3 шага до вашего чат-бота
        </h2>
        <div className="flex flex-col md:flex-row gap-8 justify-center text-center">
          <div className="bg-white/10 rounded-xl p-6 flex flex-col items-center">
            <FileStack className="w-10 h-10 text-yellow-400 mb-4" />
            <h3 className="text-lg font-semibold text-white">1. Выберите шаблон</h3>
            <p className="text-gray-300 text-sm mt-2">
              Сэкономьте часы — начните с готового решения для вашей ниши
            </p>
          </div>
          <div className="bg-white/10 rounded-xl p-6 flex flex-col items-center">
            <Settings2 className="w-10 h-10 text-yellow-400 mb-4" />
            <h3 className="text-lg font-semibold text-white">2. Настройте блоки</h3>
            <p className="text-gray-300 text-sm mt-2">
              Перетаскивайте и соединяйте — визуально и без кода
            </p>
          </div>
          <div className="bg-white/10 rounded-xl p-6 flex flex-col items-center">
            <Rocket className="w-10 h-10 text-yellow-400 mb-4" />
            <h3 className="text-lg font-semibold text-white">3. Запустите</h3>
            <p className="text-gray-300 text-sm mt-2">
              Подключите Telegram / WhatsApp и начинайте принимать заказы
            </p>
          </div>
        </div>
      </section>
    </div>
  );
} 