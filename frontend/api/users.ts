import api from '@/api/client';

interface User {
  id: string;
  email: string;
  role: string;
  [key: string]: any;
}

export async function getUser(id: string | number): Promise<User> {
  return api.get(`/users/${id}`);
}

export async function updateUserRole(userId: string | number, role: string): Promise<User> {
  return api.put(`/users/${userId}/role`, { role });
}

export async function deleteUser(userId: string | number): Promise<void> {
  return api.delete(`/users/${userId}`);
}
