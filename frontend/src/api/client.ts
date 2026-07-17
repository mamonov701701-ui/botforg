/**
 * Unified HTTP client with timeout, error handling, and credentials
 */

const API_TIMEOUT = 45000;
const MAX_CONCURRENT_REQUESTS = 3;
const GET_RETRY_DELAY_MS = 250;
const GET_RESPONSE_CACHE_TTL_MS = 60_000;
let activeRequests = 0;
const requestQueue: Array<() => void> = [];
const getResponseCache = new Map<string, { value: any; expireAt: number }>();

function hashString(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function currentUserScope(): string {
  const token = localStorage.getItem('auth_token');
  if (!token) return 'guest';
  return `t:${hashString(token)}`;
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

function isAuthOrIdentityGet(path: string): boolean {
  const normalized = normalizePath(path);
  return (
    normalized === '/me' ||
    normalized.startsWith('/me?') ||
    normalized.startsWith('/me/') ||
    normalized.startsWith('/auth/') ||
    normalized === '/auth' ||
    normalized.startsWith('/legal/consent/status')
  );
}

function getScopedCacheKey(path: string): string {
  return `${currentUserScope()}:${normalizePath(path)}`;
}

export function clearGetResponseCache(): void {
  getResponseCache.clear();
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public field?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = RequestInit & { timeoutMs?: number };

function runWithLimiter<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeRequests += 1;
      task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          activeRequests = Math.max(0, activeRequests - 1);
          const next = requestQueue.shift();
          if (next) next();
        });
    };
    if (activeRequests < MAX_CONCURRENT_REQUESTS) {
      run();
      return;
    }
    requestQueue.push(run);
  });
}

async function request(path: string, options: RequestOptions = {}): Promise<any> {
  const { timeoutMs, ...fetchOptions } = options;
  const controller = new AbortController();
  const requestTimeoutMs = timeoutMs ?? API_TIMEOUT;
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    // Всегда используем прокси (не baseURL)
    // Убеждаемся, что путь начинается с /
    const url = path.startsWith('/') ? path : `/${path}`;

    // Логируем запрос для отладки (только в dev режиме)
    if (import.meta.env.DEV) {
      console.log(`[API] ${options.method || 'GET'} ${url}`);
    }

    // Get token from localStorage for Authorization header
    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // Add Authorization header if token exists
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      // Логируем наличие токена для отладки
      if (import.meta.env.DEV) {
        console.log(`[API] Token found: ${token.substring(0, 20)}...`);
        console.log(`[API] Request headers:`, { ...headers, Authorization: 'Bearer ***' });
      }
    } else {
      if (import.meta.env.DEV) {
        console.warn(`[API] No token found for request: ${url}`);
      }
    }

    const response = await runWithLimiter(() =>
      fetch(url, {
        ...fetchOptions,
        credentials: 'include',
        signal: controller.signal,
        headers,
      })
    );

    // Логируем ответ для отладки
    if (import.meta.env.DEV && !response.ok) {
      console.error(`[API] Request failed: ${response.status} ${response.statusText}`, {
        url,
        headers: Object.fromEntries(response.headers.entries()),
      });
    }

    clearTimeout(timeout);

    if (!response.ok) {
      let errorMessage = 'Ошибка запроса';
      let errorCode: string | undefined;
      let errorField: string | undefined;
      try {
        const errorData = await response.json();
        const detail = errorData.detail;
        if (detail && typeof detail === 'object' && detail.message) {
          errorMessage = String(detail.message);
          if (detail.code) errorCode = String(detail.code);
          if (detail.field) errorField = String(detail.field);
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        } else {
          errorMessage = errorData.message || errorMessage;
        }
      } catch {
        // If JSON parsing fails, use default message
      }

      if (response.status === 401) {
        // Логируем детали ошибки
        const tokenExists = !!localStorage.getItem('auth_token');
        if (import.meta.env.DEV) {
          console.error(`[API] 401 Unauthorized for ${url}`, {
            errorMessage,
            tokenExists,
            url,
            hasTokenInRequest: !!token,
          });
        }

        // НЕ очищаем токен автоматически - пусть пользователь попробует снова
        // Токен будет очищен только при явном выходе или при ошибке на /me
        // Это предотвращает потерю токена из-за временных проблем с прокси
        throw new ApiError(errorMessage || 'Ошибка авторизации', 401, errorCode, errorField);
      }
      if (response.status === 429) {
        throw new ApiError('Слишком много попыток. Попробуйте позже.', 429, errorCode, errorField);
      }
      if (response.status >= 500) {
        const paymentConfigCodes = new Set([
          'master_key_missing',
          'master_key_invalid',
          'decrypt_failed',
          'invalid_encryption_version',
        ]);
        if (errorCode && paymentConfigCodes.has(errorCode)) {
          throw new ApiError(errorMessage, response.status, errorCode, errorField);
        }
        throw new ApiError(
          'Временная ошибка сервера. Попробуйте позже.',
          response.status,
          errorCode,
          errorField
        );
      }
      throw new ApiError(errorMessage, response.status, errorCode, errorField);
    }

    if (response.status === 204) {
      return null;
    }
    const text = await response.text();
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (error: any) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      console.error(`Request timeout for ${path}`, error);
      throw new ApiError('Сервер недоступен. Проверьте соединение или попробуйте позже.', 0);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    console.error(`Request failed for ${path}:`, error);
    throw new ApiError('Сервер недоступен. Проверьте соединение или попробуйте позже.', 0);
  }
}

export const get = (path: string, options?: RequestInit) => {
  const cacheDisabled = isAuthOrIdentityGet(path);
  const cacheKey = getScopedCacheKey(path);
  return request(path, { ...options, method: 'GET' })
    .then(data => {
      if (!cacheDisabled) {
        getResponseCache.set(cacheKey, {
          value: data,
          expireAt: Date.now() + GET_RESPONSE_CACHE_TTL_MS,
        });
      }
      return data;
    })
    .catch(async error => {
      // Retry only idempotent GET and only for transport-level unavailability.
      if (error instanceof ApiError && error.status === 0) {
        await new Promise(resolve => setTimeout(resolve, GET_RETRY_DELAY_MS));
        try {
          const retried = await request(path, { ...options, method: 'GET' });
          if (!cacheDisabled) {
            getResponseCache.set(cacheKey, {
              value: retried,
              expireAt: Date.now() + GET_RESPONSE_CACHE_TTL_MS,
            });
          }
          return retried;
        } catch (retryError) {
          if (!cacheDisabled) {
            const cached = getResponseCache.get(cacheKey);
            if (cached && cached.expireAt > Date.now()) {
              return cached.value;
            }
          }
          throw retryError;
        }
      }
      if (!cacheDisabled) {
        const cached = getResponseCache.get(cacheKey);
        if (cached && cached.expireAt > Date.now()) {
          return cached.value;
        }
      }
      throw error;
    });
};

export const post = (path: string, body?: any, options?: RequestInit) => {
  return request(path, {
    ...options,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
};

export const put = (path: string, body?: any, options?: RequestInit) => {
  return request(path, {
    ...options,
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
};

export const patch = (path: string, body?: any, options?: RequestInit) => {
  return request(path, {
    ...options,
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
};

export const del = (path: string, options?: RequestInit) => {
  return request(path, { ...options, method: 'DELETE' });
};

// Default export for compatibility
const api = {
  get,
  post,
  put,
  patch,
  delete: del,
};

export default api;
