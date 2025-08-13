import api from './client';

export const getAnalyticsOverview = async (params = {}) => {
  const res = await api.get('/analytics/overview', { params });
  return res.data;
}; 