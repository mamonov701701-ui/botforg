import api from './client';

export const getUser = async (id: number | string) => {
  const res = await api.get(`/users/${id}`);
  return res.data;
};

export const updateUserRole = async (id: number | string, role: string) => {
  const res = await api.put(`/users/${id}/role`, { role });
  return res.data;
};

export const deleteUser = async (id: number | string) => {
  const res = await api.delete(`/users/${id}`);
  return res.data;
}; 