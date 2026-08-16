/**
 * Ошибки checkout для UI (Этап 8.2.2–8.2.4).
 * Коды из backend через существующий ApiError.code.
 */
import { ApiError } from '@/api/client';
import { CHECKOUT_ERROR_CODES } from '@/api/checkout';

const PROVIDER_TEMP_UNAVAILABLE = 'Оплата временно недоступна. Попробуйте позже.';

const CODE_MESSAGES: Record<string, string> = {
  [CHECKOUT_ERROR_CODES.productUnavailable]: 'Выбранный тариф сейчас недоступен.',
  [CHECKOUT_ERROR_CODES.productUnpriced]:
    'Онлайн-покупка этого тарифа недоступна. Тариф оформляется по запросу.',
  [CHECKOUT_ERROR_CODES.legalLaunchNotReady]:
    'Оплата временно недоступна: не подготовлены обязательные документы и условия платформы.',
  [CHECKOUT_ERROR_CODES.intentNotFound]: 'Заказ не найден.',
  [CHECKOUT_ERROR_CODES.intentNotPayable]: 'Этот заказ нельзя оплатить.',
  [CHECKOUT_ERROR_CODES.intentAlreadyFulfilled]: 'Этот заказ уже оплачен и активирован.',
  [CHECKOUT_ERROR_CODES.intentAlreadyPaid]: 'Этот заказ уже оплачен.',
  [CHECKOUT_ERROR_CODES.noDefaultConnection]: PROVIDER_TEMP_UNAVAILABLE,
  [CHECKOUT_ERROR_CODES.defaultConnectionNotReady]: PROVIDER_TEMP_UNAVAILABLE,
  [CHECKOUT_ERROR_CODES.providerUnavailable]: PROVIDER_TEMP_UNAVAILABLE,
  [CHECKOUT_ERROR_CODES.providerTimeout]:
    'Платёжная система не ответила вовремя. Попробуйте позже.',
  [CHECKOUT_ERROR_CODES.providerError]: PROVIDER_TEMP_UNAVAILABLE,
  [CHECKOUT_ERROR_CODES.providerMisconfigured]: PROVIDER_TEMP_UNAVAILABLE,
  [CHECKOUT_ERROR_CODES.currentTariffAlreadyActive]: 'Этот тариф уже активен',
  [CHECKOUT_ERROR_CODES.addonNotAvailableForCurrentTariff]:
    'Дополнительные пакеты доступны начиная с тарифа «Бизнес».',
  [CHECKOUT_ERROR_CODES.priceChanged]:
    'Стоимость пакета изменилась. Обновите расчёт и подтвердите новые условия.',
  [CHECKOUT_ERROR_CODES.quantityRequired]: 'Укажите количество сообщений.',
  [CHECKOUT_ERROR_CODES.pricingIncomplete]:
    'Сейчас нельзя рассчитать стоимость этого количества. Обратитесь в поддержку или выберите готовый пакет.',
  [CHECKOUT_ERROR_CODES.pricingUnavailable]:
    'Настраиваемый пакет сейчас недоступен: не заданы ценовые ступени.',
  [CHECKOUT_ERROR_CODES.termsConfirmationRequired]:
    'Подтвердите количество, стоимость и срок действия пакета перед оплатой.',
  [CHECKOUT_ERROR_CODES.confirmationMismatch]:
    'Подтверждённые условия не совпадают с заказом. Обновите страницу.',
};

function looksLikeTechnicalHttpMessage(msg: string): boolean {
  return (
    /\b(502|503|504)\b/.test(msg) ||
    /bad gateway|service unavailable|gateway timeout|traceback|stack/i.test(msg)
  );
}

export function checkoutErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code && CODE_MESSAGES[error.code]) {
      return CODE_MESSAGES[error.code];
    }
    if (error.status === 404) {
      return 'Заказ или тариф не найден.';
    }
    if (error.status === 502 || error.status === 503 || error.status === 504) {
      return PROVIDER_TEMP_UNAVAILABLE;
    }
    const msg = (error.message || '').trim();
    if (msg && !looksLikeTechnicalHttpMessage(msg)) {
      return msg;
    }
    return PROVIDER_TEMP_UNAVAILABLE;
  }
  if (error instanceof Error) {
    const msg = (error.message || '').trim();
    if (msg === 'Failed to fetch' || msg.toLowerCase().includes('network')) {
      return 'Нет связи с сервером. Проверьте интернет и попробуйте снова.';
    }
  }
  return 'Не удалось оформить оплату. Попробуйте позже.';
}

export function buildCheckoutIdempotencyKey(prefix: string): string {
  const stamp = Date.now().toString(36);
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}-${stamp}-${rand}`.slice(0, 128);
}

export function buildCheckoutReturnUrl(intentId: number): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
  return `${origin}/checkout/return?intent=${encodeURIComponent(String(intentId))}`;
}

/** Можно ли запускать оплату YooKassa для тарифа из каталога. */
export function canStartPaidCheckout(priceMonth: unknown): {
  ok: boolean;
  reason: string | null;
} {
  if (priceMonth === null || priceMonth === undefined) {
    return {
      ok: false,
      reason:
        'Тариф «По запросу»: онлайн-покупка недоступна. Свяжитесь с поддержкой BotForg для оформления.',
    };
  }
  const n =
    typeof priceMonth === 'number'
      ? priceMonth
      : typeof priceMonth === 'string'
        ? Number(priceMonth)
        : NaN;
  if (!Number.isFinite(n)) {
    return {
      ok: false,
      reason:
        'Тариф «По запросу»: онлайн-покупка недоступна. Свяжитесь с поддержкой BotForg для оформления.',
    };
  }
  if (n <= 0) {
    return {
      ok: false,
      reason: 'Онлайн-оплата для бесплатного предложения не требуется.',
    };
  }
  return { ok: true, reason: null };
}
