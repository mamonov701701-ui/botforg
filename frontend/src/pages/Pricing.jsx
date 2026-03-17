import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Check, Zap, Users, Code } from 'lucide-react';
import { getPlans } from '../api/plans';
import { useAuthStore } from '../stores/authStore';
import './Pricing.css';

const FALLBACK_PLANS = [
  {
    id: 1,
    code: 'free',
    name: 'Free',
    limits: { max_bots: 1, can_publish: false, can_use_analytics: false, max_team_members: 0 },
  },
  {
    id: 2,
    code: 'pro',
    name: 'Pro',
    limits: { max_bots: 5, can_publish: true, can_use_analytics: true, max_team_members: 3 },
  },
  {
    id: 3,
    code: 'team',
    name: 'Team',
    limits: { max_bots: 20, can_publish: true, can_use_analytics: true, max_team_members: 10 },
  },
  {
    id: 4,
    code: 'developer',
    name: 'Developer',
    limits: {
      max_bots: 10,
      can_publish: true,
      can_use_analytics: true,
      max_team_members: 5,
      can_publish_templates: true,
      can_sell_templates: true,
      can_view_marketplace_stats: true,
    },
  },
];

const BUSINESS_PLAN_CODES = ['free', 'pro', 'team'];
const DEVELOPER_PLAN_CODE = 'developer';

const BUSINESS_FEATURES = {
  free: ['1 бот', 'Создание сценариев', 'Базовый редактор'],
  pro: ['5 ботов', 'Публикация сценариев', 'Аналитика', '3 участника команды'],
  team: ['20 ботов', 'Публикация сценариев', 'Аналитика', '10 участников команды'],
};

const DEVELOPER_FEATURES = [
  'Публикация шаблонов в маркетплейсе',
  'Продажа шаблонов (скоро)',
  'Статистика по установкам',
  'Приоритетная поддержка (плейсхолдер)',
];

function PlanCard({ plan, features, isCurrent, icon: Icon }) {
  return (
    <div
      className={`pricing-card ${isCurrent ? 'pricing-card--current' : ''}`}
      data-plan={plan.code}
    >
      {isCurrent && <span className="pricing-card__badge">Ваш тариф</span>}
      <div className="pricing-card__icon">
        <Icon size={28} />
      </div>
      <h3 className="pricing-card__title">{plan.name}</h3>
      <ul className="pricing-card__features">
        {features.map((f, i) => (
          <li key={i}>
            <Check size={18} className="pricing-card__check" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeveloperCard({ plan, isCurrent }) {
  return (
    <div
      className={`pricing-card pricing-card--developer ${isCurrent ? 'pricing-card--current' : ''}`}
      data-plan={plan.code}
    >
      {isCurrent && <span className="pricing-card__badge">Ваш тариф</span>}
      <div className="pricing-card__icon pricing-card__icon--developer">
        <Code size={28} />
      </div>
      <h3 className="pricing-card__title">Developer</h3>
      <p className="pricing-card__subtitle">Для разработчиков и студий</p>
      <ul className="pricing-card__features">
        {DEVELOPER_FEATURES.map((f, i) => (
          <li key={i}>
            <Check size={18} className="pricing-card__check" />
            {f}
          </li>
        ))}
      </ul>
      <Link to="/market" className="pricing-card__cta">
        Перейти в маркетплейс
      </Link>
    </div>
  );
}

export default function Pricing() {
  const { user } = useAuthStore();
  const [plans, setPlans] = useState(FALLBACK_PLANS);
  const [loading, setLoading] = useState(true);

  const currentPlan = user ? user.plan_code || 'free' : null;

  useEffect(() => {
    getPlans()
      .then(res => {
        if (res?.items?.length) setPlans(res.items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const businessPlans = plans.filter(p => BUSINESS_PLAN_CODES.includes(p.code));
  const developerPlan = plans.find(p => p.code === DEVELOPER_PLAN_CODE);

  return (
    <div className="pricing-page">
      <header className="pricing-header">
        <h1 className="pricing-title">Тарифы BotForg</h1>
        <p className="pricing-subtitle">Выберите план для вашего бизнеса или разработки</p>
      </header>

      {loading ? (
        <div className="pricing-loading">Загрузка тарифов...</div>
      ) : (
        <>
          {/* Бизнес-тарифы */}
          <section className="pricing-section">
            <div className="pricing-card-grid">
              {businessPlans.map(plan => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  features={BUSINESS_FEATURES[plan.code] || []}
                  isCurrent={currentPlan !== null && currentPlan === plan.code}
                  icon={plan.code === 'free' ? Zap : plan.code === 'pro' ? Zap : Users}
                />
              ))}
            </div>
          </section>

          {/* Для разработчиков */}
          <section className="pricing-section pricing-section--developer">
            <h2 className="pricing-section__title">Для разработчиков</h2>
            <p className="pricing-section__desc">
              Публикуйте шаблоны в маркетплейсе и монетизируйте свои решения
            </p>
            <div className="pricing-card-grid pricing-card-grid--developer">
              {developerPlan ? (
                <DeveloperCard
                  plan={developerPlan}
                  isCurrent={currentPlan !== null && currentPlan === DEVELOPER_PLAN_CODE}
                />
              ) : (
                <div className="pricing-card pricing-card--developer">
                  <div className="pricing-card__icon pricing-card__icon--developer">
                    <Code size={28} />
                  </div>
                  <h3 className="pricing-card__title">Developer</h3>
                  <p className="pricing-card__subtitle">Для разработчиков и студий</p>
                  <ul className="pricing-card__features">
                    {DEVELOPER_FEATURES.map((f, i) => (
                      <li key={i}>
                        <Check size={18} className="pricing-card__check" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link to="/market" className="pricing-card__cta">
                    Перейти в маркетплейс
                  </Link>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
