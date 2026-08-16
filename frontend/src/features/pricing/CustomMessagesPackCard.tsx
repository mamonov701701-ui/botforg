import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package } from 'lucide-react';
import { ApiError } from '@/api/client';
import {
  CUSTOM_MESSAGES_CODE,
  CUSTOM_PACK_TITLE_RU,
  getCustomMessagesConfig,
  MIN_CUSTOM_MESSAGES_QUANTITY,
  quoteCustomAddon,
  type CustomAddonQuote,
} from '@/api/addons';
import {
  formatAverageUnitPriceRu,
  formatMoneyRu,
  humanPricingBreakdownLines,
} from './pricingDisplay';

type SummaryStatus = 'idle' | 'loading' | 'ready' | 'error';

function quoteErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'addon_not_available_for_current_tariff') {
      return 'Для покупки дополнительных сообщений требуется платный тариф.';
    }
    if (err.code === 'pricing_unavailable' || err.code === 'pricing_incomplete') {
      return err.message || 'Сейчас нельзя рассчитать стоимость этого количества.';
    }
    if (err.message && !/^\{/.test(err.message)) return err.message;
  }
  return 'Не удалось рассчитать стоимость. Попробуйте ещё раз.';
}

export default function CustomMessagesPackCard({
  isAuthenticated,
  summaryStatus,
  addonPurchaseAllowed,
  onChooseTariff,
}: {
  isAuthenticated: boolean;
  summaryStatus: SummaryStatus;
  addonPurchaseAllowed: boolean;
  onChooseTariff: () => void;
}) {
  const [quantity, setQuantity] = useState('1000');
  const [quote, setQuote] = useState<CustomAddonQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [maxQuantity, setMaxQuantity] = useState(1_000_000);
  const [minQuantity, setMinQuantity] = useState(MIN_CUSTOM_MESSAGES_QUANTITY);
  const quoteSeq = useRef(0);

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    void getCustomMessagesConfig()
      .then(cfg => {
        if (cancelled) return;
        setMaxQuantity(cfg.max_quantity);
        setMinQuantity(cfg.min_quantity);
      })
      .catch(() => {
        /* keep fallback until quote returns authoritative max */
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const qtyNum = Number(quantity);
  const qtyValid = Number.isInteger(qtyNum) && qtyNum >= minQuantity && qtyNum <= maxQuantity;
  const qtyError = !quantity
    ? null
    : !Number.isInteger(qtyNum) || qtyNum < minQuantity
      ? `Укажите целое число от ${minQuantity}.`
      : qtyNum > maxQuantity
        ? `Максимум ${maxQuantity.toLocaleString('ru-RU')} сообщений (технический предел).`
        : null;
  const canQuote = isAuthenticated && summaryStatus === 'ready' && addonPurchaseAllowed && qtyValid;
  const checkoutPath = `/checkout?addon=${encodeURIComponent(CUSTOM_MESSAGES_CODE)}&qty=${qtyNum}`;
  const buyBlocked =
    isAuthenticated &&
    (summaryStatus === 'loading' || summaryStatus === 'error' || !addonPurchaseAllowed);

  useEffect(() => {
    setBreakdownOpen(false);
    if (!canQuote) {
      setQuote(null);
      setQuoting(false);
      if (!isAuthenticated || summaryStatus !== 'ready' || !addonPurchaseAllowed) {
        setQuoteError(null);
      }
      return;
    }
    const seq = ++quoteSeq.current;
    const timer = window.setTimeout(() => {
      setQuoting(true);
      setQuoteError(null);
      quoteCustomAddon({ quantity: qtyNum, resource_type: 'messages' })
        .then(data => {
          if (quoteSeq.current !== seq) return;
          setQuote(data);
          if (data.max_quantity > 0) setMaxQuantity(data.max_quantity);
          if (data.min_quantity > 0) setMinQuantity(data.min_quantity);
          setQuoteError(null);
        })
        .catch(err => {
          if (quoteSeq.current !== seq) return;
          setQuote(null);
          setQuoteError(quoteErrorMessage(err));
        })
        .finally(() => {
          if (quoteSeq.current === seq) setQuoting(false);
        });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [canQuote, qtyNum, isAuthenticated, summaryStatus, addonPurchaseAllowed]);

  const breakdownLines = quote ? humanPricingBreakdownLines(quote.bands, quote.currency) : [];

  return (
    <div
      className="pricing-addon-card pricing-addon-card--custom"
      data-testid="pricing-custom-pack-card"
    >
      <div className="pricing-addon-card__icon">
        <Package size={22} />
      </div>
      <h3 className="pricing-addon-card__title">{CUSTOM_PACK_TITLE_RU}</h3>
      <p className="pricing-addon-card__desc">
        Укажите нужное количество сообщений. Итоговую сумму рассчитает сервер.
      </p>
      <label className="pricing-custom-qty-label" htmlFor="pricing-custom-qty">
        Количество сообщений
      </label>
      <input
        id="pricing-custom-qty"
        data-testid="pricing-custom-qty"
        className="pricing-custom-qty"
        inputMode="numeric"
        value={quantity}
        onChange={e => setQuantity(e.target.value.replace(/[^\d]/g, ''))}
      />
      {qtyError ? (
        <p className="pricing-addon-card__error" data-testid="pricing-custom-qty-error">
          {qtyError}
        </p>
      ) : null}
      {quote ? (
        <>
          <p className="pricing-addon-card__meta-line" data-testid="pricing-custom-qty-label-out">
            {quote.quantity} сообщений
          </p>
          <p className="pricing-addon-card__price" data-testid="pricing-custom-price">
            {formatMoneyRu(quote.total, quote.currency)}
          </p>
          <p className="pricing-addon-card__avg" data-testid="pricing-custom-avg">
            {formatAverageUnitPriceRu(
              quote.average_unit_price || Number(quote.total) / quote.quantity,
              quote.currency
            )}
          </p>
          <p className="pricing-addon-card__meta-line" data-testid="pricing-custom-validity">
            Срок действия: {quote.validity_days} дней с момента активации
          </p>
          <button
            type="button"
            className="pricing-custom-how"
            data-testid="pricing-custom-how-toggle"
            aria-expanded={breakdownOpen}
            onClick={() => setBreakdownOpen(v => !v)}
          >
            Как рассчитана стоимость
          </button>
          {breakdownOpen ? (
            <ul className="pricing-addon-card__meta" data-testid="pricing-custom-breakdown">
              {breakdownLines.map(line => (
                <li key={line}>{line}</li>
              ))}
              <li>итог: {formatMoneyRu(quote.total, quote.currency)}</li>
            </ul>
          ) : null}
        </>
      ) : quoting ? (
        <p className="pricing-addon-card__price" data-testid="pricing-custom-quoting">
          Считаем стоимость…
        </p>
      ) : (
        <p className="pricing-addon-card__price" data-testid="pricing-custom-price-placeholder">
          {isAuthenticated && addonPurchaseAllowed
            ? 'Введите количество'
            : 'Стоимость рассчитает сервер'}
        </p>
      )}
      {quoteError ? (
        <p className="pricing-error" data-testid="pricing-custom-quote-error" role="alert">
          {quoteError}
        </p>
      ) : null}

      {isAuthenticated && summaryStatus === 'ready' && !addonPurchaseAllowed ? (
        <button
          type="button"
          className="pricing-card__cta bf-primary-cta"
          data-testid="pricing-custom-upgrade"
          onClick={onChooseTariff}
        >
          Выбрать платный тариф
        </button>
      ) : buyBlocked ? (
        <span
          className="pricing-card__cta pricing-card__cta--disabled"
          data-testid="pricing-custom-buy"
        >
          {summaryStatus === 'loading' ? 'Проверяем тариф…' : 'Недоступно'}
        </span>
      ) : !qtyValid ? (
        <span
          className="pricing-card__cta pricing-card__cta--disabled"
          data-testid="pricing-custom-buy"
        >
          Укажите количество
        </span>
      ) : isAuthenticated ? (
        <Link
          to={checkoutPath}
          className="pricing-card__cta bf-primary-cta"
          data-testid="pricing-custom-buy"
        >
          Купить
        </Link>
      ) : (
        <Link
          to={`/login?next=${encodeURIComponent(checkoutPath)}`}
          className="pricing-card__cta bf-primary-cta"
          data-testid="pricing-custom-buy"
        >
          Купить
        </Link>
      )}
    </div>
  );
}
