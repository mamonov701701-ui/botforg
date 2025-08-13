import React from 'react';

export default function Footer() {
  return (
    <footer className="text-white py-8">
      <div className="max-w-screen-xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="BotForg" className="h-8 w-8" />
          <span className="font-heading font-bold tracking-wide text-lg">BOTFORG</span>
        </div>
        <nav className="flex gap-6 mt-4 md:mt-0">
          <a href="#about" className="hover:text-yellow-400 font-heading transition">О платформе</a>
          <a href="#policy" className="hover:text-yellow-400 font-heading transition">Политика</a>
        </nav>
        <div className="flex gap-2 items-center mt-4 md:mt-0">
          <span className="opacity-70 font-heading">русский</span>
          <span className="mx-1">/</span>
          <a href="#en" className="hover:text-yellow-400 font-heading transition">English</a>
        </div>
      </div>
    </footer>
  );
} 