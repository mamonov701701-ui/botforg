import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import Header from '../components/Header';
import Footer from '../components/Footer';

import '../index.css';
import './site-layout.css';
import '../styles/background.css';

export default function SiteLayout() {
  const { pathname } = useLocation();
  const isEditor = pathname.startsWith('/editor');

  return (
    // ЕДИНЫЙ ФОН СТРАНИЦЫ ДЛЯ ВСЕГО САЙТА (включая header/footer)
    <div className="site-shell bg-circuit">
      <header className="site-header">
        <Header />
      </header>
      <main className="site-main">
        {/* Только блок редактора затемняем — без фоновой картинки */}
        <div className={isEditor ? 'page-content-slot editor-surface' : 'page-content-slot'}>
          <Outlet />
        </div>
      </main>
      <footer className="site-footer">
        <Footer />
      </footer>
    </div>
  );
}
