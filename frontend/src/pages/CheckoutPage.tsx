/**
 * Страница подтверждения покупки тарифа или дополнения (Этап 8.2.2–8.2.5).
 * CheckoutIntent создаётся только по кнопке «Продолжить к оплате».
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, Package, Zap } from 'lucide-react';
import {
  addonActivationValiditySentence,
  addonPublicDurationLabel,
  CUSTOM_MESSAGES_CODE,
  CUSTOM_PACK_TITLE_RU,
  formatAddonAmountLine,
  formatAddonPrice,
  getPublicAddons,
  quoteCustomAddon,
  type CustomAddonQuote,
  type PublicAddon,
} from '@/api/addons';
import {
  confirmAddonCheckoutTerms,
  createCheckoutIntent,
  startCheckoutPayment,
} from '@/api/checkout';
import { getTariffSummary } from '@/api/tariff';
import {
  buildTariffLimitLines,
  formatTariffPriceMonth,
  getPublicTariffs,
  type PublicTariff,
} from '@/api/tariffs';
import {
  buildCheckoutIdempotencyKey,
  buildCheckoutReturnUrl,
  canStartPaidCheckout,
  checkoutErrorMessage,
} from '@/features/checkout/checkoutUi';
import {
  formatAverageUnitPriceRu,
  formatMoneyRu,
  humanPricingBreakdownLines,
} from '@/features/pricing/pricingDisplay';
import { ApiError } from '@/api/client';
import './Checkout.css';

type CheckoutMode = 'empty' | 'conflict' | 'tariff' | 'addon';
type EffectivePlanStatus = 'idle' | 'loading' | 'ready' | 'error';

export default function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const planCode = (searchParams.get('plan') || '').trim();
  const addonCode = (searchParams.get('addon') || '').trim();
  const qtyRaw = (searchParams.get('qty') || '').trim();
  const customQty = Number(qtyRaw);
  const isCustomMessages =
    addonCode === CUSTOM_MESSAGES_CODE && Number.isInteger(customQty) && customQty >= 1;

  const mode: CheckoutMode =
    planCode && addonCode ? 'conflict' : planCode ? 'tariff' : addonCode ? 'addon' : 'empty';

  const [tariffs, setTariffs] = useState<PublicTariff[]>([]);
  const [addons, setAddons] = useState<PublicAddon[]>([]);
  const [customQuote, setCustomQuote] = useState<CustomAddonQuote | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(mode === 'tariff' || mode === 'addon');
  const [catalogError, setCatalogError] = useState<string | null>(null);

  /** Effective plan from GET /me/tariff/summary — never users.plan_code. */
  const [effectivePlanCode, setEffectivePlanCode] = useState<string | null>(null);
  const [effectivePlanStatus, setEffectivePlanStatus] = useState<EffectivePlanStatus>('idle');
  const [addonPurchaseAllowed, setAddonPurchaseAllowed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [intentId, setIntentId] = useState<number | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const submitLockRef = useRef(false);

  useEffect(() => {
    setTermsAccepted(false);
    setBreakdownOpen(false);
    setIntentId(null);
  }, [customQty, addonCode, planCode]);

  useEffect(() => {
    if (mode !== 'tariff' && mode !== 'addon') {
      setCatalogLoading(false);
      setCatalogError(null);
      return;
    }

    let cancelled = false;
    setCatalogLoading(true);
    setCatalogError(null);

    const loader =
      mode === 'tariff'
        ? getPublicTariffs().then(items => {
            if (cancelled) return;
            setTariffs(items);
            setAddons([]);
          })
        : isCustomMessages
          ? quoteCustomAddon({ quantity: customQty, resource_type: 'messages' }).then(data => {
              if (cancelled) return;
              setCustomQuote(data);
              setAddons([]);
            })
          : getPublicAddons().then(items => {
              if (cancelled) return;
              setAddons(items);
              setTariffs([]);
              setCustomQuote(null);
            });

    loader
      .catch(() => {
        if (cancelled) return;
        setTariffs([]);
        setAddons([]);
        setCatalogError(
          mode === 'tariff'
            ? 'Не удалось загрузить каталог тарифов. Попробуйте обновить страницу.'
            : 'Не удалось загрузить каталог дополнений. Попробуйте обновить страницу.'
        );
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, planCode, addonCode, isCustomMessages, customQty]);

  useEffect(() => {
    if (mode !== 'tariff' && mode !== 'addon') {
      setEffectivePlanCode(null);
      setAddonPurchaseAllowed(false);
      setEffectivePlanStatus('idle');
      return;
    }

    let cancelled = false;
    setEffectivePlanCode(null);
    setAddonPurchaseAllowed(false);
    setEffectivePlanStatus('loading');
    getTariffSummary()
      .then(summary => {
        if (cancelled) return;
        const code = summary?.current_plan?.code;
        setEffectivePlanCode(typeof code === 'string' && code.trim() ? code : null);
        setAddonPurchaseAllowed(Boolean(summary?.flags?.addon_purchase));
        setEffectivePlanStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        // Do not fall back to stale users.plan_code.
        setEffectivePlanCode(null);
        setAddonPurchaseAllowed(false);
        setEffectivePlanStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [mode, planCode, addonCode]);

  const tariff = useMemo(
    () => (mode === 'tariff' ? (tariffs.find(t => t.code === planCode) ?? null) : null),
    [mode, tariffs, planCode]
  );

  const addon = useMemo(
    () =>
      mode === 'addon' && !isCustomMessages
        ? (addons.find(a => a.code === addonCode) ?? null)
        : null,
    [mode, addons, addonCode, isCustomMessages]
  );

  const tariffLimitLines = useMemo(
    () => (tariff ? buildTariffLimitLines(tariff.limits) : []),
    [tariff]
  );

  const tariffPriceLabel = tariff
    ? formatTariffPriceMonth(tariff.price_month, tariff.currency)
    : '';
  const addonPriceLabel = addon ? formatAddonPrice(addon.price, addon.currency) : '';

  const payGate = tariff
    ? canStartPaidCheckout(tariff.price_month)
    : isCustomMessages
      ? canStartPaidCheckout(customQuote?.total)
      : addon
        ? canStartPaidCheckout(addon.price)
        : { ok: false, reason: null };

  const isCurrentTariff =
    effectivePlanStatus === 'ready' &&
    Boolean(effectivePlanCode && tariff && effectivePlanCode === tariff.code);
  /** While summary loads or fails: do not enable tariff/addon pay (fail-closed). */
  const summaryBlocksPay = effectivePlanStatus === 'loading' || effectivePlanStatus === 'error';
  const addonBlockedByPlan =
    mode === 'addon' && effectivePlanStatus === 'ready' && !addonPurchaseAllowed;
  /** Same legal confirmation gate for fixed packs and custom messages. */
  const addonPayAllowed = mode !== 'addon' || termsAccepted;
  const canPay =
    mode === 'tariff'
      ? Boolean(tariff) && !summaryBlocksPay && !isCurrentTariff && payGate.ok
      : mode === 'addon'
        ? Boolean(isCustomMessages ? customQuote : addon) &&
          !summaryBlocksPay &&
          !addonBlockedByPlan &&
          payGate.ok &&
          addonPayAllowed
        : false;

  const handleContinue = useCallback(async () => {
    if (submitLockRef.current || submitting) return;

    if (mode === 'tariff') {
      if (!tariff || isCurrentTariff || summaryBlocksPay) return;
      if (!payGate.ok) {
        setActionError(payGate.reason);
        return;
      }
    } else if (mode === 'addon') {
      if ((isCustomMessages ? !customQuote : !addon) || summaryBlocksPay || addonBlockedByPlan) {
        return;
      }
      if (!termsAccepted) {
        setActionError('Подтвердите условия покупки перед оплатой.');
        return;
      }
      if (!payGate.ok) {
        setActionError(payGate.reason);
        return;
      }
    } else {
      return;
    }

    const productType = mode === 'addon' ? 'addon' : 'tariff';
    const code = mode === 'addon' ? addonCode : tariff!.code;

    submitLockRef.current = true;
    setSubmitting(true);
    setActionError(null);

    try {
      const createKey = buildCheckoutIdempotencyKey(`chk-${productType}-${code}`);
      const intent = await createCheckoutIntent({
        product_type: productType,
        code,
        idempotency_key: createKey,
        ...(isCustomMessages ? { quantity: customQty } : {}),
      });
      setIntentId(intent.id);

      if (mode === 'addon') {
        const confirmedAmount = isCustomMessages ? customQuote!.total : String(addon!.price);
        const confirmedCurrency = isCustomMessages
          ? customQuote!.currency
          : addon!.currency || 'RUB';
        const confirmedQuantity = isCustomMessages ? customQuote!.quantity : Number(addon!.amount);
        await confirmAddonCheckoutTerms(intent.id, {
          confirmed_amount: confirmedAmount,
          confirmed_currency: confirmedCurrency,
          confirmed_quantity: confirmedQuantity,
        });
      }

      const payKey = buildCheckoutIdempotencyKey(`pay-${intent.id}`);
      const returnUrl = buildCheckoutReturnUrl(intent.id);
      const pay = await startCheckoutPayment(intent.id, {
        idempotency_key: payKey,
        return_url: returnUrl,
      });

      const url = (pay.confirmation_url || '').trim();
      if (!url) {
        setActionError(
          'Не удалось получить ссылку на оплату. Попробуйте ещё раз или обратитесь в поддержку.'
        );
        return;
      }
      window.location.assign(url);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'price_changed') {
        setTermsAccepted(false);
        setIntentId(null);
        try {
          if (isCustomMessages) {
            const fresh = await quoteCustomAddon({
              quantity: customQty,
              resource_type: 'messages',
            });
            setCustomQuote(fresh);
          } else {
            const items = await getPublicAddons();
            setAddons(items);
          }
          setActionError(checkoutErrorMessage(err));
        } catch {
          setActionError(checkoutErrorMessage(err));
        }
      } else {
        setActionError(checkoutErrorMessage(err));
      }
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }, [
    mode,
    tariff,
    addon,
    customQuote,
    isCustomMessages,
    customQty,
    addonCode,
    submitting,
    isCurrentTariff,
    summaryBlocksPay,
    addonBlockedByPlan,
    payGate.ok,
    payGate.reason,
    termsAccepted,
  ]);

  return (
    <div className="checkout-page" data-testid="checkout-page">
      <header className="checkout-header">
        <p className="checkout-eyebrow">Оформление покупки</p>
        <h1 className="checkout-title">
          {mode === 'addon' ? 'Подтверждение дополнения' : 'Подтверждение тарифа'}
        </h1>
        <p className="checkout-subtitle">
          Проверьте состав покупки. Цена на этой странице справочная — итоговую сумму фиксирует
          сервер при создании заказа.
        </p>
      </header>

      {mode === 'conflict' && (
        <section className="checkout-card" data-testid="checkout-param-conflict">
          <div className="checkout-alert checkout-alert--error" role="alert">
            Нельзя оформить тариф и дополнение в одном заказе. Выберите один вариант покупки.
          </div>
          <div className="checkout-actions">
            <Link to="/pricing" className="checkout-btn checkout-btn--ghost">
              К тарифам
            </Link>
            <Link
              to="/dashboard/finance"
              className="checkout-btn checkout-btn--primary"
              data-testid="checkout-back-to-finance"
            >
              В финансы и лимиты
            </Link>
          </div>
        </section>
      )}

      {mode === 'empty' && (
        <div className="checkout-alert" data-testid="checkout-missing-plan" role="alert">
          Не выбран товар. Вернитесь к{' '}
          <Link to="/pricing" className="checkout-link">
            тарифам
          </Link>{' '}
          или в{' '}
          <Link to="/dashboard/finance" className="checkout-link">
            финансы и лимиты
          </Link>
          .
        </div>
      )}

      {(mode === 'tariff' || mode === 'addon') && catalogLoading && (
        <div className="checkout-loading" data-testid="checkout-loading">
          {mode === 'addon' ? 'Загрузка дополнения...' : 'Загрузка тарифа...'}
        </div>
      )}

      {(mode === 'tariff' || mode === 'addon') && !catalogLoading && catalogError && (
        <div
          className="checkout-alert checkout-alert--error"
          data-testid="checkout-catalog-error"
          role="alert"
        >
          {catalogError}
        </div>
      )}

      {mode === 'tariff' && !catalogLoading && !catalogError && !tariff && (
        <section className="checkout-card" data-testid="checkout-plan-not-found">
          <div className="checkout-alert checkout-alert--error" role="alert">
            Тариф недоступен. Выбранный план отсутствует в актуальном каталоге.
          </div>
          <div className="checkout-actions">
            <Link
              to="/pricing"
              className="checkout-btn checkout-btn--primary"
              data-testid="checkout-back-to-pricing"
            >
              Вернуться к тарифам
            </Link>
          </div>
        </section>
      )}

      {mode === 'addon' && !isCustomMessages && !catalogLoading && !catalogError && !addon && (
        <section className="checkout-card" data-testid="checkout-addon-not-found">
          <div className="checkout-alert checkout-alert--error" role="alert">
            Дополнение недоступно. Выбранный пакет отсутствует в актуальном каталоге.
          </div>
          <div className="checkout-actions">
            <Link
              to="/dashboard/finance"
              className="checkout-btn checkout-btn--primary"
              data-testid="checkout-back-to-finance"
            >
              В финансы и лимиты
            </Link>
          </div>
        </section>
      )}

      {tariff && (
        <section className="checkout-card" data-testid="checkout-summary">
          {isCurrentTariff ? (
            <span className="checkout-badge" data-testid="checkout-current-badge">
              Ваш тариф
            </span>
          ) : null}

          <div className="checkout-card__icon">
            <Zap size={28} />
          </div>
          <h2 className="checkout-card__name" data-testid="checkout-plan-name">
            {tariff.name}
          </h2>
          <p className="checkout-card__price" data-testid="checkout-plan-price">
            {tariffPriceLabel}
          </p>
          {tariff.description_ru ? (
            <p className="checkout-card__desc">{tariff.description_ru}</p>
          ) : null}

          <div className="checkout-card__block">
            <h3 className="checkout-card__block-title">Состав покупки</h3>
            <ul className="checkout-card__list">
              <li>
                <Check size={18} className="checkout-card__check" />
                Тариф «{tariff.name}»
              </li>
              <li>
                <Check size={18} className="checkout-card__check" />
                Ежемесячная подписка
              </li>
            </ul>
          </div>

          {tariffLimitLines.length > 0 && (
            <div className="checkout-card__block">
              <h3 className="checkout-card__block-title">Основные возможности</h3>
              <ul className="checkout-card__list">
                {tariffLimitLines.map((line, i) => (
                  <li key={i}>
                    <Check size={18} className="checkout-card__check" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isCurrentTariff && (
            <div className="checkout-alert" data-testid="checkout-already-current">
              Это ваш текущий тариф. Повторная покупка не требуется.
            </div>
          )}

          {effectivePlanStatus === 'error' && (
            <div
              className="checkout-alert checkout-alert--error"
              data-testid="checkout-summary-error"
              role="alert"
            >
              Не удалось проверить текущий тариф. Обновите страницу или попробуйте позже.
            </div>
          )}

          {!isCurrentTariff && !payGate.ok && payGate.reason && (
            <div className="checkout-alert" data-testid="checkout-not-payable">
              {payGate.reason}
            </div>
          )}

          {actionError && (
            <div
              className="checkout-alert checkout-alert--error"
              data-testid="checkout-action-error"
              role="alert"
            >
              {actionError}
            </div>
          )}

          {intentId != null && (
            <p className="checkout-meta" data-testid="checkout-intent-id">
              Заказ №{intentId}
            </p>
          )}

          <div className="checkout-actions">
            <Link
              to="/pricing"
              className="checkout-btn checkout-btn--ghost"
              data-testid="checkout-back-to-pricing"
            >
              Вернуться к тарифам
            </Link>
            {isCurrentTariff ? (
              <Link
                to="/dashboard/finance"
                className="checkout-btn checkout-btn--primary"
                data-testid="checkout-to-dashboard"
              >
                В личный кабинет
              </Link>
            ) : canPay ? (
              <button
                type="button"
                className="checkout-btn checkout-btn--primary"
                data-testid="checkout-continue"
                disabled={submitting}
                onClick={() => {
                  void handleContinue();
                }}
              >
                {submitting ? 'Оформляем…' : 'Продолжить к оплате'}
              </button>
            ) : null}
          </div>
        </section>
      )}

      {isCustomMessages && customQuote && (
        <section className="checkout-card" data-testid="checkout-custom-summary">
          <div className="checkout-card__icon">
            <Package size={28} />
          </div>
          <h2 className="checkout-card__name" data-testid="checkout-addon-name">
            {customQuote.product_name || CUSTOM_PACK_TITLE_RU}
          </h2>
          <p className="checkout-card__price" data-testid="checkout-addon-price">
            {formatMoneyRu(customQuote.total, customQuote.currency)}
          </p>
          <p className="checkout-card__desc" data-testid="checkout-addon-avg">
            {formatAverageUnitPriceRu(
              customQuote.average_unit_price || Number(customQuote.total) / customQuote.quantity,
              customQuote.currency
            )}
          </p>
          <div className="checkout-card__block">
            <h3 className="checkout-card__block-title">Состав покупки</h3>
            <ul className="checkout-card__list">
              <li>
                <Check size={18} className="checkout-card__check" />
                Сообщения: {customQuote.quantity}
              </li>
              <li data-testid="checkout-addon-validity">
                <Check size={18} className="checkout-card__check" />
                Срок действия: {customQuote.validity_days} дней с момента активации
              </li>
            </ul>
            <button
              type="button"
              className="checkout-how-link"
              data-testid="checkout-how-pricing"
              aria-expanded={breakdownOpen}
              onClick={() => setBreakdownOpen(v => !v)}
            >
              Как рассчитана стоимость
            </button>
            {breakdownOpen ? (
              <ul className="checkout-card__list" data-testid="checkout-pricing-breakdown">
                {humanPricingBreakdownLines(customQuote.bands, customQuote.currency).map(line => (
                  <li key={line}>
                    <Check size={18} className="checkout-card__check" />
                    {line}
                  </li>
                ))}
                <li>
                  <Check size={18} className="checkout-card__check" />
                  итог: {formatMoneyRu(customQuote.total, customQuote.currency)}
                </li>
              </ul>
            ) : null}
          </div>
          {effectivePlanStatus === 'error' && (
            <div
              className="checkout-alert checkout-alert--error"
              data-testid="checkout-summary-error"
              role="alert"
            >
              Не удалось проверить текущий тариф. Обновите страницу или попробуйте позже.
            </div>
          )}
          {addonBlockedByPlan && (
            <div className="checkout-alert" data-testid="checkout-addon-plan-gate">
              Для покупки дополнительных сообщений требуется платный тариф.
              <div style={{ marginTop: 10 }}>
                <Link
                  to="/pricing?tab=tariffs"
                  className="checkout-btn checkout-btn--primary"
                  data-testid="checkout-addon-choose-tariff"
                >
                  Выбрать тариф
                </Link>
              </div>
            </div>
          )}
          {!summaryBlocksPay && !addonBlockedByPlan && payGate.ok && (
            <label className="checkout-terms" data-testid="checkout-terms-label">
              <input
                type="checkbox"
                data-testid="checkout-terms-confirm"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
              />
              <span>
                Я ознакомился с количеством, итоговой стоимостью, сроком действия и условиями
                дополнительного пакета и подтверждаю покупку на указанных условиях.
              </span>
            </label>
          )}
          {actionError && (
            <div
              className="checkout-alert checkout-alert--error"
              data-testid="checkout-action-error"
              role="alert"
            >
              {actionError}
            </div>
          )}
          {intentId != null && (
            <p className="checkout-meta" data-testid="checkout-intent-id">
              Заказ №{intentId}
            </p>
          )}
          <div className="checkout-actions">
            <Link
              to="/pricing?tab=addons"
              className="checkout-btn checkout-btn--ghost"
              data-testid="checkout-back-to-finance"
            >
              К пакетам
            </Link>
            {canPay ? (
              <button
                type="button"
                className="checkout-btn checkout-btn--primary bf-primary-cta"
                data-testid="checkout-continue"
                disabled={submitting}
                onClick={() => {
                  void handleContinue();
                }}
              >
                {submitting
                  ? 'Оформляем…'
                  : `Перейти к оплате — ${formatMoneyRu(customQuote.total, customQuote.currency)}`}
              </button>
            ) : !summaryBlocksPay && !addonBlockedByPlan && payGate.ok && !termsAccepted ? (
              <button
                type="button"
                className="checkout-btn checkout-btn--primary bf-primary-cta"
                data-testid="checkout-continue"
                disabled
              >
                {`Перейти к оплате — ${formatMoneyRu(customQuote.total, customQuote.currency)}`}
              </button>
            ) : null}
          </div>
        </section>
      )}

      {addon && (
        <section className="checkout-card" data-testid="checkout-addon-summary">
          <div className="checkout-card__icon">
            <Package size={28} />
          </div>
          <h2 className="checkout-card__name" data-testid="checkout-addon-name">
            {addon.name_ru}
          </h2>
          <p className="checkout-card__price" data-testid="checkout-addon-price">
            {addonPriceLabel}
          </p>
          {addon.description_ru ? (
            <p className="checkout-card__desc">{addon.description_ru}</p>
          ) : null}

          <div className="checkout-card__block">
            <h3 className="checkout-card__block-title">Состав покупки</h3>
            <ul className="checkout-card__list">
              <li>
                <Check size={18} className="checkout-card__check" />
                {formatAddonAmountLine(addon)}
              </li>
              <li data-testid="checkout-addon-validity">
                <Check size={18} className="checkout-card__check" />
                {addonPublicDurationLabel(addon)}
              </li>
              <li data-testid="checkout-addon-validity-note">
                <Check size={18} className="checkout-card__check" />
                {addonActivationValiditySentence(addon)}
              </li>
              <li>
                <Check size={18} className="checkout-card__check" />
                Разовое дополнение к лимитам
              </li>
            </ul>
          </div>

          {effectivePlanStatus === 'error' && (
            <div
              className="checkout-alert checkout-alert--error"
              data-testid="checkout-summary-error"
              role="alert"
            >
              Не удалось проверить текущий тариф. Обновите страницу или попробуйте позже.
            </div>
          )}

          {addonBlockedByPlan && (
            <div className="checkout-alert" data-testid="checkout-addon-plan-gate">
              Дополнительные пакеты доступны начиная с тарифа «Бизнес».
              <div style={{ marginTop: 10 }}>
                <Link
                  to="/pricing?tab=tariffs"
                  className="checkout-btn checkout-btn--primary"
                  data-testid="checkout-addon-choose-tariff"
                >
                  Выбрать тариф
                </Link>
              </div>
            </div>
          )}

          {!addonBlockedByPlan && !payGate.ok && payGate.reason && (
            <div className="checkout-alert" data-testid="checkout-not-payable">
              {payGate.reason}
            </div>
          )}

          {!summaryBlocksPay && !addonBlockedByPlan && payGate.ok && (
            <label className="checkout-terms" data-testid="checkout-terms-label">
              <input
                type="checkbox"
                data-testid="checkout-terms-confirm"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
              />
              <span>
                Я ознакомился с названием пакета, количеством, итоговой стоимостью, сроком действия
                и условиями дополнительного пакета и подтверждаю покупку на указанных условиях.
              </span>
            </label>
          )}

          {actionError && (
            <div
              className="checkout-alert checkout-alert--error"
              data-testid="checkout-action-error"
              role="alert"
            >
              {actionError}
            </div>
          )}

          {intentId != null && (
            <p className="checkout-meta" data-testid="checkout-intent-id">
              Заказ №{intentId}
            </p>
          )}

          <div className="checkout-actions">
            <Link
              to="/dashboard/finance"
              className="checkout-btn checkout-btn--ghost"
              data-testid="checkout-back-to-finance"
            >
              В финансы и лимиты
            </Link>
            {canPay ? (
              <button
                type="button"
                className="checkout-btn checkout-btn--primary bf-primary-cta"
                data-testid="checkout-continue"
                disabled={submitting}
                onClick={() => {
                  void handleContinue();
                }}
              >
                {submitting ? 'Оформляем…' : `Перейти к оплате — ${addonPriceLabel}`}
              </button>
            ) : !summaryBlocksPay && !addonBlockedByPlan && payGate.ok && !termsAccepted ? (
              <button
                type="button"
                className="checkout-btn checkout-btn--primary bf-primary-cta"
                data-testid="checkout-continue"
                disabled
              >
                {`Перейти к оплате — ${addonPriceLabel}`}
              </button>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}
