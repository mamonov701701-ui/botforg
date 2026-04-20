import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useParams, Link } from 'react-router-dom';
import {
  ChevronLeft,
  ContactRound,
  ListTree,
  Tags,
  CircleDot,
  LayoutDashboard,
  BookOpen,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getBot, type Bot } from '../../../api/bot';
import { CrmDataScopeProvider, useCrmDataScope } from './CrmDataScopeContext';
import type { CrmShowMode } from './CrmDataScopeContext';

function BotCrmLayoutInner() {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();
  const id = Number(botId);
  const [bot, setBot] = useState<Bot | null>(null);
  const { showMode, setShowMode } = useCrmDataScope();

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    getBot(id)
      .then(setBot)
      .catch(() => setBot(null));
  }, [id]);

  const base = `/dashboard/bots/${id}/crm`;

  if (!Number.isFinite(id)) {
    return (
      <div className="crm-shell" style={{ padding: 24, color: 'var(--text)' }}>
        Некорректный бот
      </div>
    );
  }

  const navItems: { to: string; label: string; icon: React.ElementType }[] = [
    { to: `${base}/overview`, label: 'Обзор', icon: LayoutDashboard },
    { to: `${base}/contacts`, label: 'Контакты', icon: ContactRound },
    { to: `${base}/fields`, label: 'Поля', icon: ListTree },
    { to: `${base}/tags`, label: 'Теги', icon: Tags },
    { to: `${base}/statuses`, label: 'Статусы', icon: CircleDot },
  ];

  const segmentOptions: { value: CrmShowMode; label: string }[] = [
    { value: 'prod', label: 'Реальные' },
    { value: 'dev', label: 'Тестовые' },
    { value: 'all', label: 'Все' },
  ];

  return (
    <div className="crm-shell">
      <button
        type="button"
        className="crm-back"
        onClick={() => navigate(`/dashboard/bots/${id}/overview`)}
      >
        <ChevronLeft size={17} strokeWidth={2} /> К разделам бота
      </button>

      <header className="crm-header-block">
        <div className="crm-header-row">
          <div>
            <h1 className="crm-h1">CRM{bot ? ` · ${bot.title}` : ''}</h1>
            <p className="crm-lead">
              <strong>Контакты</strong> — реальные люди и их данные. <strong>Поля</strong> и{' '}
              <strong>Теги</strong> — справочники: что можно хранить в сценариях; сами значения у
              человека смотрите в списке контактов и в карточке.
            </p>
          </div>
          <div className="crm-help-actions">
            <Link
              to="/dashboard/help/crm"
              className="crm-help-btn"
              title="Полная инструкция по CRM"
            >
              <BookOpen size={16} strokeWidth={2} aria-hidden />
              Как пользоваться CRM
            </Link>
            <Link
              to="/features?tab=crm"
              className="crm-help-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              Краткий обзор на сайте
            </Link>
          </div>
        </div>
      </header>

      <section className="crm-scope" aria-labelledby="crm-show-label">
        <span id="crm-show-label" className="crm-scope-label">
          Показывать
        </span>
        <div className="crm-segment" role="tablist" aria-label="Тип данных">
          {segmentOptions.map(opt => (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={showMode === opt.value}
              className={
                showMode === opt.value
                  ? 'crm-segment__btn crm-segment__btn--active'
                  : 'crm-segment__btn'
              }
              onClick={() => setShowMode(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="crm-scope-hint">
          Реальные — из мессенджеров. Тестовые — из предпросмотра редактора.
        </p>
      </section>

      <nav className="crm-nav" aria-label="Разделы CRM">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to.endsWith('/contacts')}
            className={({ isActive }) =>
              isActive ? 'crm-nav__link crm-nav__link--active' : 'crm-nav__link'
            }
          >
            <Icon size={17} strokeWidth={2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="crm-work">
        <Outlet context={{ botId: id, showMode }} />
      </div>
    </div>
  );
}

export default function BotCrmLayout() {
  return (
    <CrmDataScopeProvider>
      <BotCrmLayoutInner />
    </CrmDataScopeProvider>
  );
}
