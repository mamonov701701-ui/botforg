import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import { getUnreadCount } from '../api/chat';

export default function Header({ openAuthModal }) {
  const { user } = useAuthStore();
  const { openAuth } = useUiStore();
  const [unreadCount, setUnreadCount] = useState(0);

  const handleAccountClick = e => {
    if (!user) {
      e.preventDefault();
      openAuth('/dashboard');
    }
    // If user exists, Link will navigate normally
  };

  // Загрузка непрочитанных сообщений
  useEffect(() => {
    if (!user) return;

    const loadUnreadCount = async () => {
      try {
        const response = await getUnreadCount();
        setUnreadCount(response.unread_count);
      } catch (error) {
        // Игнорируем ошибки (пользователь может быть не авторизован)
      }
    };

    // Загружаем сразу
    loadUnreadCount();

    // И каждые 30 секунд
    const interval = setInterval(loadUnreadCount, 30000);

    return () => clearInterval(interval);
  }, [user]);

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
            position: 'relative',
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
          {user && unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-8px',
                right: '-12px',
                background: '#ef4444',
                color: 'white',
                borderRadius: '10px',
                padding: '2px 6px',
                fontSize: '11px',
                fontWeight: '600',
                minWidth: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
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
