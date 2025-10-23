import api from '@/api/client';

export async function getMyPurchases(params?: any): Promise<any> {
  let url = '/purchases/my';
  if (params) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value));
      }
    });
    const queryString = queryParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }
  return api.get(url);
}
