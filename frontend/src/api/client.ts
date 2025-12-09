/**
 * Unified HTTP client with timeout, error handling, and credentials
 */

const API_TIMEOUT = 30000; // 30 seconds - увеличен для отладки

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request(path: string, options: RequestInit = {}): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

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

    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      signal: controller.signal,
      headers,
    });

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
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorData.message || errorMessage;
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
        throw new ApiError(errorMessage || 'Ошибка авторизации', 401);
      }
      if (response.status === 429) {
        throw new ApiError('Слишком много попыток. Попробуйте позже.', 429);
      }
      if (response.status >= 500) {
        throw new ApiError('Временная ошибка сервера. Попробуйте позже.', response.status);
      }
      throw new ApiError(errorMessage, response.status);
    }

    return response.json();
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
  return request(path, { ...options, method: 'GET' });
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
