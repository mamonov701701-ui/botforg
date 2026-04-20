import React from 'react';
import { Link } from 'react-router-dom';
import { CRM_GUIDE_SECTIONS, type CrmGuideBlock } from '../../content/crmGuideData';

function Block({ block }: { block: CrmGuideBlock }) {
  if (block.type === 'p') {
    return <p className="crm-guide__p">{block.text}</p>;
  }
  if (block.type === 'ul') {
    return (
      <ul className="crm-guide__ul">
        {block.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <ol className="crm-guide__ol">
      {block.items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

export default function CrmKnowledgeGuidePage() {
  return (
    <div className="crm-guide">
      <header className="crm-guide__head">
        <p className="crm-guide__kicker">Справка</p>
        <h1 className="crm-guide__title">CRM в BotForg — полная инструкция</h1>
        <p className="crm-guide__lead">
          Подробное руководство по разделам, режимам данных и работе с контактами. Краткий
          продуктовый обзор также доступен на странице{' '}
          <Link to="/features?tab=crm" className="crm-guide__link">
            Возможности → CRM
          </Link>
          .
        </p>
      </header>

      <nav className="crm-guide__toc" aria-label="Содержание">
        <p className="crm-guide__toc-title">Содержание</p>
        <ol className="crm-guide__toc-list">
          {CRM_GUIDE_SECTIONS.map(s => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="crm-guide__link">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="crm-guide__body">
        {CRM_GUIDE_SECTIONS.map(section => (
          <section key={section.id} id={section.id} className="crm-guide__section">
            <h2 className="crm-guide__h2">{section.title}</h2>
            {section.blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </section>
        ))}
      </div>

      <footer className="crm-guide__foot">
        <Link to="/dashboard/bots" className="crm-guide__back">
          ← К моим ботам
        </Link>
      </footer>

      <style>{`
        .crm-guide {
          max-width: 44rem;
          margin: 0 auto;
          padding: 8px 0 48px;
          color: var(--text);
        }
        .crm-guide__kicker {
          margin: 0 0 8px;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--accent, #f59e0b);
        }
        .crm-guide__title {
          margin: 0 0 12px;
          font-size: clamp(1.35rem, 2.5vw, 1.75rem);
          font-weight: 700;
          line-height: 1.25;
        }
        .crm-guide__lead {
          margin: 0 0 24px;
          font-size: 15px;
          line-height: 1.6;
          color: var(--text-muted);
        }
        .crm-guide__toc {
          margin-bottom: 28px;
          padding: 16px 18px;
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--card, rgba(26, 34, 56, 0.6));
        }
        .crm-guide__toc-title {
          margin: 0 0 10px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
        }
        .crm-guide__toc-list {
          margin: 0;
          padding-left: 1.2rem;
          font-size: 14px;
          line-height: 1.7;
          color: var(--text-muted);
        }
        .crm-guide__section {
          margin-bottom: 2rem;
          scroll-margin-top: 72px;
        }
        .crm-guide__h2 {
          margin: 0 0 12px;
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text);
        }
        .crm-guide__p {
          margin: 0 0 12px;
          font-size: 14px;
          line-height: 1.65;
          color: var(--text-muted);
        }
        .crm-guide__ul,
        .crm-guide__ol {
          margin: 0 0 12px;
          padding-left: 1.25rem;
          font-size: 14px;
          line-height: 1.65;
          color: var(--text-muted);
        }
        .crm-guide__li,
        .crm-guide__ul li,
        .crm-guide__ol li {
          margin: 6px 0;
        }
        .crm-guide__link {
          color: var(--accent, #fbbf24);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .crm-guide__link:hover {
          opacity: 0.92;
        }
        .crm-guide__foot {
          margin-top: 32px;
          padding-top: 20px;
          border-top: 1px solid var(--border);
        }
        .crm-guide__back {
          font-size: 14px;
          font-weight: 500;
          color: var(--accent, #fbbf24);
          text-decoration: none;
        }
        .crm-guide__back:hover {
          text-decoration: underline;
        }
      `}</style>
    </div>
  );
}
