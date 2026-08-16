import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Package, Zap } from 'lucide-react';
import {
  addonPublicDurationLabel,
  formatAddonAmountLine,
  formatAddonPrice,
  getPublicAddons,
} from '../api/addons';
import { getTariffSummary } from '../api/tariff';
import {
  RECOMMENDED_BADGE_LABEL,
  buildPricingCardLines,
  formatTariffPriceMonth,
  getPublicTariffs,
} from '../api/tariffs';
import { useAuthStore } from '../stores/authStore';
import CustomMessagesPackCard from '../features/pricing/CustomMessagesPackCard';
import './Pricing.css';

function resolvePricingTab(raw) {
  const v = (raw || '').trim().toLowerCase();
  if (v === 'addons' || v === 'packages' || v === 'пакеты') return 'addons';
  return 'tariffs';
}

export default function Pricing() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tariffs, setTariffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addons, setAddons] = useState([]);
  const [addonsLoading, setAddonsLoading] = useState(true);
  const [addonsError, setAddonsError] = useState(null);
  /** Effective plan from GET /me/tariff/summary; null while loading/guest/error — never legacy plan_code. */
  const [currentPlan, setCurrentPlan] = useState(null);
  /** ready | loading | error | idle(guest) — fail-closed for tariff/addon CTA when error. */
  const [summaryStatus, setSummaryStatus] = useState('idle');
  const [addonPurchaseAllowed, setAddonPurchaseAllowed] = useState(false);

  const selectedPlan = searchParams.get('plan') || null;
  const activeTab = resolvePricingTab(searchParams.get('tab'));
  const isAuthenticated = Boolean(user);

  useEffect(() => {
    const raw = searchParams.get('tab');
    if (raw != null && resolvePricingTab(raw) !== raw.trim().toLowerCase()) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', 'tariffs');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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

  useEffect(() => {
    let cancelled = false;
    setAddonsLoading(true);
    setAddonsError(null);
    getPublicAddons()
      .then(items => {
        if (cancelled) return;
        setAddons(items);
      })
      .catch(() => {
        if (cancelled) return;
        setAddons([]);
        setAddonsError('Не удалось загрузить дополнения. Попробуйте обновить страницу.');
      })
      .finally(() => {
        if (!cancelled) setAddonsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setCurrentPlan(null);
      setAddonPurchaseAllowed(false);
      setSummaryStatus('idle');
      return;
    }
    let cancelled = false;
    setCurrentPlan(null);
    setAddonPurchaseAllowed(false);
    setSummaryStatus('loading');
    getTariffSummary()
      .then(summary => {
        if (cancelled) return;
        const code = summary?.current_plan?.code;
        setCurrentPlan(typeof code === 'string' && code.trim() ? code : null);
        setAddonPurchaseAllowed(Boolean(summary?.flags?.addon_purchase));
        setSummaryStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        // Do not fall back to users.plan_code (may be stale vs UserSubscription).
        setCurrentPlan(null);
        setAddonPurchaseAllowed(false);
        setSummaryStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const sortedTariffs = useMemo(
    () =>
      [...tariffs].sort(
        (a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.code.localeCompare(b.code)
      ),
    [tariffs]
  );

  const sortedAddons = useMemo(
    () =>
      [...addons].sort(
        (a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.code.localeCompare(b.code)
      ),
    [addons]
  );

  const setTab = useCallback(
    tab => {
      const next = new URLSearchParams(searchParams);
      next.set('tab', tab === 'addons' ? 'addons' : 'tariffs');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const checkoutPathForPlan = useCallback(code => `/checkout?plan=${encodeURIComponent(code)}`, []);
  const checkoutPathForAddon = useCallback(
    code => `/checkout?addon=${encodeURIComponent(code)}`,
    []
  );

  const selectPlan = useCallback(
    code => {
      if (!code) return;
      if (currentPlan && currentPlan === code) return;
      if (isAuthenticated && summaryStatus !== 'ready') return;
      const checkoutPath = checkoutPathForPlan(code);
      if (!isAuthenticated) {
        navigate(`/login?next=${encodeURIComponent(checkoutPath)}`);
        return;
      }
      navigate(checkoutPath);
    },
    [currentPlan, isAuthenticated, navigate, checkoutPathForPlan, summaryStatus]
  );

  const selectAddon = useCallback(
    code => {
      if (!code) return;
      if (isAuthenticated && (summaryStatus !== 'ready' || !addonPurchaseAllowed)) return;
      const checkoutPath = checkoutPathForAddon(code);
      if (!isAuthenticated) {
        navigate(`/login?next=${encodeURIComponent(checkoutPath)}`);
        return;
      }
      navigate(checkoutPath);
    },
    [isAuthenticated, navigate, checkoutPathForAddon, summaryStatus, addonPurchaseAllowed]
  );

  const addonBuyBlocked =
    isAuthenticated &&
    (summaryStatus === 'loading' || summaryStatus === 'error' || !addonPurchaseAllowed);

  return (
    <div className="pricing-page" data-testid="pricing-page">
      <header className="pricing-header">
        <h1 className="pricing-title">Тарифы BotForg</h1>
        <p className="pricing-subtitle">Выберите план для вашего бизнеса</p>
      </header>

      <div
        className="pricing-tabs"
        role="tablist"
        aria-label="Разделы: тарифы и дополнительные пакеты"
        data-testid="pricing-tabs"
      >
        <button
          type="button"
          role="tab"
          id="pricing-tab-tariffs"
          aria-selected={activeTab === 'tariffs'}
          aria-controls="pricing-panel-tariffs"
          className={[
            'pricing-tabs__btn',
            activeTab === 'tariffs' ? 'pricing-tabs__btn--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-testid="pricing-tab-tariffs"
          onClick={() => setTab('tariffs')}
        >
          Тарифы
        </button>
        <button
          type="button"
          role="tab"
          id="pricing-tab-addons"
          aria-selected={activeTab === 'addons'}
          aria-controls="pricing-panel-addons"
          className={[
            'pricing-tabs__btn',
            activeTab === 'addons' ? 'pricing-tabs__btn--active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          data-testid="pricing-tab-addons"
          onClick={() => setTab('addons')}
        >
          Доп. пакеты
        </button>
      </div>

      {activeTab === 'tariffs' && (
        <div
          role="tabpanel"
          id="pricing-panel-tariffs"
          aria-labelledby="pricing-tab-tariffs"
          data-testid="pricing-panel-tariffs"
        >
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
              {isAuthenticated && summaryStatus === 'error' ? (
                <div className="pricing-error" data-testid="pricing-summary-error" role="alert">
                  Не удалось проверить текущий тариф. Обновите страницу или попробуйте позже.
                </div>
              ) : null}
              <div className="pricing-card-grid">
                {sortedTariffs.map(plan => {
                  const isCurrent =
                    summaryStatus === 'ready' && currentPlan !== null && currentPlan === plan.code;
                  const isSelected = selectedPlan === plan.code;
                  const features = buildPricingCardLines(plan.limits);
                  const priceLabel = formatTariffPriceMonth(plan.price_month, plan.currency);
                  const tariffCtaBlocked =
                    isAuthenticated && (summaryStatus === 'loading' || summaryStatus === 'error');

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
                        <Zap size={24} />
                      </div>
                      <h3 className="pricing-card__title">{plan.name}</h3>
                      <p className="pricing-card__price" data-testid={`pricing-price-${plan.code}`}>
                        {priceLabel}
                      </p>
                      {plan.description_ru ? (
                        <p className="pricing-card__subtitle">{plan.description_ru}</p>
                      ) : null}
                      {features.length > 0 && (
                        <ul
                          className="pricing-card__features"
                          data-testid={`pricing-features-${plan.code}`}
                        >
                          {features.map((f, i) => (
                            <li key={i}>
                              <Check size={16} className="pricing-card__check" />
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
                      ) : tariffCtaBlocked ? (
                        <span
                          className="pricing-card__cta pricing-card__cta--disabled"
                          data-testid={`pricing-cta-${plan.code}`}
                        >
                          {summaryStatus === 'loading' ? 'Проверяем тариф…' : 'Недоступно'}
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
                          to={`/login?next=${encodeURIComponent(checkoutPathForPlan(plan.code))}`}
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
      )}

      {activeTab === 'addons' && (
        <div
          role="tabpanel"
          id="pricing-panel-addons"
          aria-labelledby="pricing-tab-addons"
          data-testid="pricing-panel-addons"
        >
          <section className="pricing-section pricing-addons" data-testid="pricing-addons">
            <header className="pricing-section-header">
              <h2 className="pricing-section-title">Дополнительные пакеты</h2>
              <p className="pricing-section-subtitle">
                Готовые пакеты и «Настроить пакет» для платного тарифа. Сообщения действуют
                фиксированное число дней с активации и не сбрасываются при новом тарифном месяце.
              </p>
            </header>

            {isAuthenticated && summaryStatus === 'error' ? (
              <div
                className="pricing-error"
                data-testid="pricing-addons-summary-error"
                role="alert"
              >
                Не удалось проверить текущий тариф. Обновите страницу или попробуйте позже.
              </div>
            ) : null}

            {isAuthenticated && summaryStatus === 'ready' && !addonPurchaseAllowed ? (
              <div className="pricing-addons-gate" data-testid="pricing-addons-gate" role="status">
                <p data-testid="pricing-addons-gate-message">
                  Для покупки дополнительных сообщений требуется платный тариф.
                </p>
                <button
                  type="button"
                  className="pricing-card__cta"
                  data-testid="pricing-addons-choose-tariff"
                  onClick={() => setTab('tariffs')}
                >
                  Выбрать тариф
                </button>
              </div>
            ) : null}

            {addonsLoading && (
              <div className="pricing-loading" data-testid="pricing-addons-loading">
                Загрузка дополнений...
              </div>
            )}

            {!addonsLoading && addonsError && (
              <div className="pricing-error" data-testid="pricing-addons-error" role="alert">
                {addonsError}
              </div>
            )}

            {!addonsLoading && !addonsError && sortedAddons.length === 0 && (
              <div className="pricing-empty" data-testid="pricing-addons-empty">
                Готовых пакетов сейчас нет — можно настроить количество сообщений.
              </div>
            )}

            {!addonsLoading && !addonsError && (
              <div className="pricing-addon-grid">
                {sortedAddons.map(addon => {
                  const validity = addonPublicDurationLabel(addon);
                  return (
                    <div
                      key={addon.code}
                      className="pricing-addon-card"
                      data-testid={`pricing-addon-card-${addon.code}`}
                    >
                      <div className="pricing-addon-card__icon">
                        <Package size={22} />
                      </div>
                      <h3 className="pricing-addon-card__title">{addon.name_ru}</h3>
                      {addon.description_ru ? (
                        <p className="pricing-addon-card__desc">{addon.description_ru}</p>
                      ) : null}
                      <ul className="pricing-addon-card__meta">
                        <li data-testid={`pricing-addon-amount-${addon.code}`}>
                          {formatAddonAmountLine(addon)}
                        </li>
                        <li data-testid={`pricing-addon-duration-${addon.code}`}>{validity}</li>
                      </ul>
                      <p
                        className="pricing-addon-card__price"
                        data-testid={`pricing-addon-price-${addon.code}`}
                      >
                        {formatAddonPrice(addon.price, addon.currency)}
                      </p>
                      {addonBuyBlocked ? (
                        <span
                          className="pricing-card__cta pricing-card__cta--disabled"
                          data-testid={`pricing-addon-buy-${addon.code}`}
                        >
                          {summaryStatus === 'loading'
                            ? 'Проверяем тариф…'
                            : summaryStatus === 'error'
                              ? 'Недоступно'
                              : 'Недоступно на вашем тарифе'}
                        </span>
                      ) : isAuthenticated ? (
                        <button
                          type="button"
                          className="pricing-card__cta"
                          data-testid={`pricing-addon-buy-${addon.code}`}
                          onClick={() => selectAddon(addon.code)}
                        >
                          Купить
                        </button>
                      ) : (
                        <Link
                          to={`/login?next=${encodeURIComponent(checkoutPathForAddon(addon.code))}`}
                          className="pricing-card__cta"
                          data-testid={`pricing-addon-buy-${addon.code}`}
                        >
                          Купить
                        </Link>
                      )}
                    </div>
                  );
                })}
                <CustomMessagesPackCard
                  isAuthenticated={isAuthenticated}
                  summaryStatus={summaryStatus}
                  addonPurchaseAllowed={addonPurchaseAllowed}
                  onChooseTariff={() => setTab('tariffs')}
                />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
