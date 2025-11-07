import React from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';

export default function Header({ openAuthModal }) {
  const { user } = useAuthStore();
  const { openAuth } = useUiStore();

  const handleAccountClick = e => {
    if (!user) {
      e.preventDefault();
      openAuth('/dashboard');
    }
    // If user exists, Link will navigate normally
  };

  return (
    <header
      className="max-w-7xl mx-auto px-4 flex items-center justify-between w-full"
      style={{ position: 'relative', zIndex: 100, height: 'fit-content' }}
    >
      <div className="flex items-center gap-3">
        <Link to="/">
          <img src="/logo.png" alt="BotForg" className="h-20 w-auto" />
        </Link>
        <div>
          <div className="font-heading text-2xl font-bold tracking-wide text-white">BOTFORG</div>
          <div className="text-xs opacity-80 text-white">технологии в действии</div>
        </div>
      </div>
      <nav
        className="flex gap-6 items-center text-base font-heading"
        style={{ position: 'relative', zIndex: 100 }}
      >
        <Link
          to="/bf-agent"
          className="nav-link"
          style={{
            color: '#ffffff',
            textDecoration: 'none',
            fontWeight: 'normal',
            transition: 'all 0.2s',
            display: 'inline-block',
          }}
          onMouseEnter={e => {
            e.target.style.color = '#FFC107';
            e.target.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={e => {
            e.target.style.color = '#ffffff';
            e.target.style.transform = 'scale(1)';
          }}
        >
          BF агент
        </Link>
        <Link
          to="/templates"
          className="nav-link"
          style={{
            color: '#ffffff',
            textDecoration: 'none',
            fontWeight: 'normal',
            transition: 'all 0.2s',
            display: 'inline-block',
          }}
          onMouseEnter={e => {
            e.target.style.color = '#FFC107';
            e.target.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={e => {
            e.target.style.color = '#ffffff';
            e.target.style.transform = 'scale(1)';
          }}
        >
          Шаблоны
        </Link>
        <Link
          to="/features"
          className="nav-link"
          style={{
            color: '#ffffff',
            textDecoration: 'none',
            fontWeight: 'normal',
            transition: 'all 0.2s',
            display: 'inline-block',
          }}
          onMouseEnter={e => {
            e.target.style.color = '#FFC107';
            e.target.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={e => {
            e.target.style.color = '#ffffff';
            e.target.style.transform = 'scale(1)';
          }}
        >
          Возможности
        </Link>
        <Link
          to="/pricing"
          className="nav-link"
          style={{
            color: '#ffffff',
            textDecoration: 'none',
            fontWeight: 'normal',
            transition: 'all 0.2s',
            display: 'inline-block',
          }}
          onMouseEnter={e => {
            e.target.style.color = '#FFC107';
            e.target.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={e => {
            e.target.style.color = '#ffffff';
            e.target.style.transform = 'scale(1)';
          }}
        >
          Тарифы
        </Link>
        <Link
          to="/dashboard"
          onClick={handleAccountClick}
          className="nav-link"
          style={{
            color: '#ffffff',
            textDecoration: 'none',
            fontWeight: 'normal',
            transition: 'all 0.2s',
            display: 'inline-block',
          }}
          onMouseEnter={e => {
            e.target.style.color = '#FFC107';
            e.target.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={e => {
            e.target.style.color = '#ffffff';
            e.target.style.transform = 'scale(1)';
          }}
        >
          Личный кабинет
        </Link>
        <Link
          to="/editor/1"
          className="bg-yellow-400 hover:bg-yellow-300 font-semibold py-2 px-5 rounded transition ml-4"
          style={{
            color: '#000',
            textDecoration: 'none',
            display: 'inline-block',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          Редактор
        </Link>
      </nav>
    </header>
  );
}
