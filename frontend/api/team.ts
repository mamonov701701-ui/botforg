import api from '@/api/client';

interface TeamMember {
  id: string;
  email: string;
  role: string;
  [key: string]: any;
}

export async function getTeam(): Promise<TeamMember[]> {
  return api.get('/team');
}

export async function updateUserRole(userId: string | number, role: string): Promise<any> {
  return api.put(`/team/${userId}/role`, { role });
}

export async function removeTeamMember(userId: string | number): Promise<void> {
  return api.delete(`/team/${userId}`);
}
