import api from './client';

export const getTeam = async () => {
  const res = await api.get('/team');
  return res.data;
};

export const updateUserRole = async (userId: number, role: string) => {
  await api.put(`/users/${userId}/role`, { role });
};

export const removeTeamMember = async (userId: number) => {
  await api.delete(`/team/${userId}`);
}; 