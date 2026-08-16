/**
 * Human-readable money / graduated pricing presentation (Этап 7.2).
 * Display only — never authoritative financial math.
 */

export function formatMoneyRu(value: unknown, currency: string = 'RUB'): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return '—';
  const cur = (currency || 'RUB').toUpperCase() === 'RUB' ? '₽' : currency;
  const abs = Math.abs(n);
  let body: string;
  if (Number.isInteger(n)) {
    body = String(n);
  } else if (abs >= 1) {
    body = n.toFixed(2);
  } else if (abs >= 0.01) {
    body = n.toFixed(2);
  } else {
    // Small unit rates: trim trailing zeros but keep up to 4 dp for readability.
    body = n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    if (!body.includes('.')) body = n.toFixed(2);
  }
  return `${body.replace('.', ',')} ${cur}`;
}

export function formatAverageUnitPriceRu(average: unknown, currency: string = 'RUB'): string {
  return `≈ ${formatMoneyRu(average, currency)} за сообщение`;
}

export type PricingBandLike = {
  units: number;
  unit_price: string | number;
  subtotal?: string | number;
  range_start?: number;
  range_end?: number | null;
};

/** Human-readable graduated breakdown lines from authoritative quote bands. */
export function humanPricingBreakdownLines(
  bands: PricingBandLike[],
  currency: string = 'RUB'
): string[] {
  const lines: string[] = [];
  bands.forEach((band, index) => {
    const units = Number(band.units) || 0;
    if (units <= 0) return;
    const rate = formatMoneyRu(band.unit_price, currency);
    const prefix =
      index === 0
        ? `первые ${units} ${units === 1 ? 'сообщение' : 'сообщений'}`
        : `следующие ${units} ${units === 1 ? 'сообщение' : 'сообщений'}`;
    lines.push(`${prefix} × ${rate}`);
  });
  return lines;
}
