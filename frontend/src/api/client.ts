/**
 * Unified HTTP client with timeout, error handling, and credentials
 */

const API_TIMEOUT = 10000; // 10 seconds

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
    const baseURL = import.meta.env.VITE_API_URL || '';
    const url = baseURL ? `${baseURL}${path}` : path;

    // Get token from localStorage for Authorization header
    const token = localStorage.getItem('auth_token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // Add Authorization header if token exists
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      signal: controller.signal,
      headers,
    });

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
        throw new ApiError('Сессия не активна. Войдите заново.', 401);
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
      throw new ApiError('Сервер недоступен. Проверьте соединение.', 0);
    }
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError('Сервер недоступен. Проверьте соединение.', 0);
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

export const del = (path: string, options?: RequestInit) => {
  return request(path, { ...options, method: 'DELETE' });
};

// Default export for compatibility
const api = {
  get,
  post,
  put,
  delete: del,
};

export default api;
