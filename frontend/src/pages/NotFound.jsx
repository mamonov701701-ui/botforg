import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-16">
      <h1 className="text-4xl font-heading font-bold mb-6">Страница не найдена</h1>
      <Link
        to="/"
        className="bg-primary text-dark rounded-xl px-6 py-3 font-heading font-bold text-lg shadow hover:brightness-110 transition"
      >
        Вернуться на главную
      </Link>
    </div>
  );
}
