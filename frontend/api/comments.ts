import api from '@/api/client';

export async function getMyComments(): Promise<any> {
  return api.get('/comments/my');
}

export async function deleteComment(id: string | number): Promise<void> {
  return api.delete(`/comments/${id}`);
}

export async function updateComment(id: string | number, text: string): Promise<any> {
  return api.put(`/comments/${id}`, { text });
}
