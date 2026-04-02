import { apiOrigin } from './devApiOrigin';

export interface MediaUploadResponse {
  url: string;
  fileName: string;
  contentType: string;
}

export async function uploadMedia(file: File): Promise<MediaUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const token = localStorage.getItem('auth_token');

  const base = apiOrigin();
  const response = await fetch(`${base}/media/upload`, {
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

  const base = apiOrigin();
  const response = await fetch(`${base}/media/${filename}`, {
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
