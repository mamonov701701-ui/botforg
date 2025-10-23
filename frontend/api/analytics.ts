import api from '@/api/client';

export async function getAnalytics(): Promise<any> {
  return api.get('/analytics');
}

export async function getTemplateAnalytics(id: string | number): Promise<any> {
  return api.get(`/analytics/template/${id}`);
}
