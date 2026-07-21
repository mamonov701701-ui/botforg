import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Zap } from 'lucide-react';
import {
  RECOMMENDED_BADGE_LABEL,
  buildTariffLimitLines,
  formatTariffPriceMonth,
  getPublicTariffs,
} from '../api/tariffs';
import { useAuthStore } from '../stores/authStore';
import './Pricing.css';

const LOGIN_NEXT = '/pricing';

export default function Pricing() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tariffs, setTariffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const currentPlan = user ? user.plan_code || null : null;
  const selectedPlan = searchParams.get('plan') || null;
  const isAuthenticated = Boolean(user);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPublicTariffs()
      .then(items => {
        if (cancelled) return;
        setTariffs(items);
      })
      .catch(() => {
        if (cancelled) return;
        setTariffs([]);
        setError('Не удалось загрузить тарифы. Попробуйте обновить страницу.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedTariffs = useMemo(
    () =>
      [...tariffs].sort(
        (a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.code.localeCompare(b.code)
      ),
    [tariffs]
  );

  const selectPlan = useCallback(
    code => {
      if (!code) return;
      if (currentPlan && currentPlan === code) return;
      if (!isAuthenticated) {
        navigate(`/login?next=${encodeURIComponent(`${LOGIN_NEXT}?plan=${code}`)}`);
        return;
      }
      const next = new URLSearchParams(searchParams);
      next.set('plan', code);
      setSearchParams(next, { replace: true });
    },
    [currentPlan, isAuthenticated, navigate, searchParams, setSearchParams]
  );

  return (
    <div className="pricing-page" data-testid="pricing-page">
      <header className="pricing-header">
        <h1 className="pricing-title">Тарифы BotForg</h1>
        <p className="pricing-subtitle">Выберите план для вашего бизнеса</p>
      </header>

      {loading && (
        <div className="pricing-loading" data-testid="pricing-loading">
          Загрузка тарифов...
        </div>
      )}

      {!loading && error && (
        <div className="pricing-error" data-testid="pricing-error" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && sortedTariffs.length === 0 && (
        <div className="pricing-empty" data-testid="pricing-empty">
          Сейчас нет доступных тарифов.
        </div>
      )}

      {!loading && !error && sortedTariffs.length > 0 && (
        <section className="pricing-section" data-testid="pricing-list">
          <div className="pricing-card-grid">
            {sortedTariffs.map(plan => {
              const isCurrent = currentPlan !== null && currentPlan === plan.code;
              const isSelected = selectedPlan === plan.code;
              const features = buildTariffLimitLines(plan.limits);
              const priceLabel = formatTariffPriceMonth(plan.price_month, plan.currency);

              return (
                <div
                  key={plan.code}
                  className={[
                    'pricing-card',
                    isCurrent ? 'pricing-card--current' : '',
                    isSelected && !isCurrent ? 'pricing-card--selected' : '',
                    plan.is_recommended ? 'pricing-card--recommended' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  data-plan={plan.code}
                  data-testid={`pricing-card-${plan.code}`}
                >
                  {isCurrent && (
                    <span className="pricing-card__badge pricing-card__badge--current">
                      Ваш тариф
                    </span>
                  )}
                  {!isCurrent && plan.is_recommended && (
                    <span
                      className="pricing-card__badge pricing-card__badge--recommended"
                      data-testid={`pricing-recommended-${plan.code}`}
                    >
                      {RECOMMENDED_BADGE_LABEL}
                    </span>
                  )}
                  <div className="pricing-card__icon">
                    <Zap size={28} />
                  </div>
                  <h3 className="pricing-card__title">{plan.name}</h3>
                  <p className="pricing-card__price" data-testid={`pricing-price-${plan.code}`}>
                    {priceLabel}
                  </p>
                  {plan.description_ru ? (
                    <p className="pricing-card__subtitle">{plan.description_ru}</p>
                  ) : null}
                  {features.length > 0 && (
                    <ul className="pricing-card__features">
                      {features.map((f, i) => (
                        <li key={i}>
                          <Check size={18} className="pricing-card__check" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                  {isCurrent ? (
                    <span
                      className="pricing-card__cta pricing-card__cta--disabled"
                      data-testid={`pricing-cta-${plan.code}`}
                    >
                      Ваш тариф
                    </span>
                  ) : isAuthenticated ? (
                    <button
                      type="button"
                      className="pricing-card__cta"
                      data-testid={`pricing-cta-${plan.code}`}
                      onClick={() => selectPlan(plan.code)}
                    >
                      Выбрать
                    </button>
                  ) : (
                    <Link
                      to={`/login?next=${encodeURIComponent(`${LOGIN_NEXT}?plan=${plan.code}`)}`}
                      className="pricing-card__cta"
                      data-testid={`pricing-cta-${plan.code}`}
                    >
                      Выбрать
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
