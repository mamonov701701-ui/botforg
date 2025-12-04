const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8001';

export interface MediaUploadResponse {
  url: string;
  fileName: string;
  contentType: string;
}

export async function uploadMedia(file: File): Promise<MediaUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const token = localStorage.getItem('auth_token');

  const response = await fetch(`${API_URL}/media/upload`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(error.detail || 'Ошибка загрузки файла');
  }

  return response.json();
}

export async function deleteMedia(filename: string): Promise<void> {
  const token = localStorage.getItem('auth_token');

  const response = await fetch(`${API_URL}/media/${filename}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error('Ошибка удаления файла');
  }
}
