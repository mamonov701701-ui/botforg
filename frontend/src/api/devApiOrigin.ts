/**
 * Единый базовый URL API для dev/prod.
 *
 * В режиме разработки (Vite) всегда возвращаем пустую строку: запросы идут на origin
 * фронта (localhost:5173) и попадают на backend через proxy — один канал, без прямого :8001.
 * Так в консоли не будет ERR_CONNECTION_REFUSED на порт бэкенда, если открыт только фронт
 * по ошибке (будет 5xx от proxy, если backend выключен).
 *
 * В production — VITE_API_URL или относительные пути с того же хоста.
 */
export function apiOrigin(): string {
  if (import.meta.env.DEV) {
    return '';
  }
  const v = import.meta.env.VITE_API_URL;
  if (typeof v === 'string' && v.trim() !== '') {
    return v.replace(/\/$/, '');
  }
  return '';
}
