import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useEffect, useState } from 'react';
import { getTeam, updateUserRole, removeTeamMember } from '@/api/team';
import { ROLES } from '@/constants/roles';

export default function AdminUsersPage() {
  const { user, loading } = useRequireAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    getTeam()
      .then(setUsers)
      .catch(() => setError('Ошибка загрузки пользователей'))
      .finally(() => setLoadingUsers(false));
  }, []);

  if (loading || loadingUsers) return <div>Загрузка...</div>;
  if (!user || (user.role !== 'owner' && user.role !== 'admin')) {
    return <div className="p-8 text-center text-red-600">Доступ запрещён</div>;
  }

  const filteredUsers = users.filter(
    u =>
      (!roleFilter || u.role === roleFilter) &&
      (!search ||
        u.name?.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase()))
  );

  const handleRoleChange = async (id: number, role: string) => {
    await updateUserRole(id, role);
    setUsers(prev => prev.map(u => (u.id === id ? { ...u, role } : u)));
    alert('Роль обновлена');
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить пользователя?')) return;
    await removeTeamMember(id);
    setUsers(prev => prev.filter(u => u.id !== id));
    alert('Пользователь удалён');
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Пользователи проекта</h1>
      <div className="flex gap-4 mb-4 items-end">
        <div>
          <label className="block text-xs mb-1">Роль</label>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="border rounded px-2 py-1 text-xs"
          >
            <option value="">Все роли</option>
            {ROLES.filter(r => r !== 'owner').map(role => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1">Поиск</label>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Имя или email"
            className="border rounded px-2 py-1 text-xs"
          />
        </div>
      </div>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {filteredUsers.length === 0 ? (
        <div>Нет участников команды</div>
      ) : (
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">Имя</th>
              <th className="p-2 border">Email</th>
              <th className="p-2 border">Роль</th>
              <th className="p-2 border">Дата регистрации</th>
              <th className="p-2 border"></th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u: any) => (
              <tr key={u.id}>
                <td className="p-2 border">{u.name}</td>
                <td className="p-2 border">{u.email}</td>
                <td className="p-2 border">
                  <select
                    value={u.role}
                    onChange={e => handleRoleChange(u.id, e.target.value)}
                    className="border px-2 py-1 text-xs"
                  >
                    {ROLES.filter(r => r !== 'owner').map(role => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2 border">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="p-2 border">
                  <button
                    onClick={() => handleDelete(u.id)}
                    className="text-red-600 hover:underline text-xs"
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
