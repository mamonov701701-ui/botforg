import api from './client';

export const getMyPayments = async (params = {}) => {
  const res = await api.get('/my-payments', { params });
  return res.data;
};

export const getMySales = async (params = {}) => {
  const res = await api.get('/my-sales', { params });
  return res.data;
}; 