import React from 'react';

export default function Header({ openAuthModal }) {
  return (
    <header className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between w-full">
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="BotForg" className="h-20 w-auto" />
        <div>
          <div className="font-heading text-2xl font-bold tracking-wide">BOTFORG</div>
          <div className="text-xs opacity-80">технологии в действии</div>
        </div>
      </div>
      <nav className="flex gap-6 items-center text-base font-heading">
        <a href="#templates" className="text-white hover:underline">Шаблоны</a>
        <a href="#features" className="text-white hover:underline">Возможности</a>
        <a href="#pricing" className="text-white hover:underline">Тарифы</a>
        <button onClick={openAuthModal} className="text-white hover:underline bg-transparent border-0 p-0 m-0 cursor-pointer">Вход</button>
        <a href="/editor" className="bg-yellow-400 text-black font-semibold py-2 px-5 rounded hover:bg-yellow-300 transition ml-4">Редактор</a>
      </nav>
    </header>
  );
} 