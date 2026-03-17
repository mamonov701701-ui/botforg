import React from 'react';

export default function Footer() {
  return (
    <footer className="text-white py-4">
      <div className="max-w-screen-xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="BotForg" className="h-6 w-6" />
          <span className="font-heading font-bold tracking-wide text-base">BOTFORG</span>
        </div>
        <nav className="flex gap-4 mt-2 md:mt-0">
          <a href="#about" className="hover:text-yellow-400 font-heading transition text-sm">
            О платформе
          </a>
          <a href="#policy" className="hover:text-yellow-400 font-heading transition text-sm">
            Политика
          </a>
        </nav>
        <div className="flex gap-2 items-center mt-2 md:mt-0">
          <span className="opacity-70 font-heading text-sm">Русский интерфейс</span>
        </div>
      </div>
    </footer>
  );
}
