import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import { getUnreadCount } from '../api/chat';
import '../layouts/site-layout.css';

const NAV_ITEMS = [
  { to: '/bf-agent', label: 'BF агент' },
  { to: '/market', label: 'Маркет' },
  { to: '/features', label: 'Возможности' },
  { to: '/pricing', label: 'Тарифы' },
  { to: '/dashboard', label: 'Личный кабинет', account: true },
  { to: '/editor', label: 'Редактор', cta: true },
];

export default function Header(_props) {
  const { user } = useAuthStore();
  const { openAuth } = useUiStore();
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleAccountClick = e => {
    if (!user) {
      e.preventDefault();
      openAuth('/dashboard');
    }
    setMobileOpen(false);
  };

  useEffect(() => {
    if (!user) return;

    const loadUnreadCount = async () => {
      try {
        const response = await getUnreadCount();
        setUnreadCount(response.unread_count);
      } catch (error) {
        // ignore
      }
    };

    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = e => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  const renderLink = (item, opts = {}) => {
    const { mobile } = opts;
    if (item.cta) {
      return (
        <Link
          key={item.to}
          to={item.to}
          className={
            mobile
              ? 'site-header-mobile-link site-header-mobile-link--cta'
              : 'bg-yellow-400 hover:bg-yellow-300 font-semibold py-2 px-5 rounded transition ml-4'
          }
          style={
            mobile
              ? undefined
              : {
                  color: '#000',
                  textDecoration: 'none',
                  display: 'inline-block',
                  transition: 'all 0.2s',
                }
          }
          onClick={() => setMobileOpen(false)}
        >
          {item.label}
        </Link>
      );
    }

    return (
      <Link
        key={item.to}
        to={item.to}
        onClick={item.account ? handleAccountClick : () => setMobileOpen(false)}
        className={mobile ? 'site-header-mobile-link' : 'nav-link'}
        style={
          mobile
            ? undefined
            : {
                color: '#ffffff',
                textDecoration: 'none',
                fontWeight: 'normal',
                transition: 'all 0.2s',
                display: 'inline-block',
                position: item.account ? 'relative' : undefined,
              }
        }
        onMouseEnter={
          mobile
            ? undefined
            : e => {
                e.target.style.color = '#FFC107';
                e.target.style.transform = 'scale(1.1)';
              }
        }
        onMouseLeave={
          mobile
            ? undefined
            : e => {
                e.target.style.color = '#ffffff';
                e.target.style.transform = 'scale(1)';
              }
        }
      >
        {item.label}
        {item.account && user && unreadCount > 0 && (
          <span
            style={{
              position: mobile ? 'static' : 'absolute',
              top: mobile ? undefined : '-8px',
              right: mobile ? undefined : '-12px',
              marginLeft: mobile ? 8 : undefined,
              background: '#ef4444',
              color: 'white',
              borderRadius: '10px',
              padding: '2px 6px',
              fontSize: '11px',
              fontWeight: '600',
              minWidth: '20px',
              height: '20px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Link>
    );
  };

  return (
    <header
      className="site-header-inner max-w-7xl mx-auto px-4 flex items-center justify-between w-full"
      style={{ position: 'relative', zIndex: 100, height: 'fit-content' }}
      data-testid="site-header"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Link to="/" onClick={() => setMobileOpen(false)}>
          <img src="/logo.png" alt="BotForg" className="h-20 w-auto site-header-logo" />
        </Link>
        <div className="site-header-brand min-w-0">
          <div className="font-heading text-2xl font-bold tracking-wide text-white truncate">
            BOTFORG
          </div>
          <div className="text-xs opacity-80 text-white site-header-tagline">
            технологии в действии
          </div>
        </div>
      </div>

      <nav
        className="site-header-nav-desktop flex gap-6 items-center text-base font-heading"
        style={{ position: 'relative', zIndex: 100 }}
        data-testid="site-header-nav-desktop"
      >
        {NAV_ITEMS.map(item => renderLink(item))}
      </nav>

      <button
        type="button"
        className="site-header-menu-toggle"
        data-testid="site-header-menu-toggle"
        aria-expanded={mobileOpen}
        aria-controls="site-header-mobile-panel"
        onClick={() => setMobileOpen(o => !o)}
      >
        {mobileOpen ? 'Закрыть' : 'Меню'}
      </button>

      {mobileOpen ? (
        <div
          className="site-header-mobile-backdrop"
          data-testid="site-header-mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <div
        id="site-header-mobile-panel"
        className={`site-header-mobile-panel${mobileOpen ? ' is-open' : ''}`}
        data-testid="site-header-mobile-panel"
        hidden={!mobileOpen}
      >
        <nav className="site-header-mobile-nav" aria-label="Основная навигация">
          {NAV_ITEMS.map(item => renderLink(item, { mobile: true }))}
        </nav>
      </div>
    </header>
  );
}
