import api from './client';

export const getMyPurchases = async (params = {}) => {
  const res = await api.get('/my-purchases', { params });
  return res.data;
}; 