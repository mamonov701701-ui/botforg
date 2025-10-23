import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useEffect, useState } from 'react';
import { getTeam, updateUserRole, removeTeamMember } from '@/api/team';
import { ROLES } from '@/constants/roles';

export default function TeamPage() {
  const { user, loading } = useRequireAuth();
  const [team, setTeam] = useState<any[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(true);

  useEffect(() => {
    if (user?.role !== 'owner') return;
    getTeam()
      .then(setTeam)
      .finally(() => setLoadingTeam(false));
  }, [user]);

  if (loading || loadingTeam) return <div>Загрузка...</div>;
  if (user.role !== 'owner') return <div>Доступ запрещён</div>;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Моя команда</h1>
      {team.length === 0 ? (
        <p>У вас пока нет участников команды.</p>
      ) : (
        <ul className="space-y-3">
          {team.map((member: any) => (
            <li key={member.id} className="border p-3 rounded">
              <div className="flex justify-between items-center">
                <div>
                  <p>
                    <strong>{member.name}</strong> ({member.email})
                  </p>
                  <p className="text-sm text-gray-500">Роль: {member.role}</p>
                </div>
                <div className="flex gap-2">
                  <select
                    value={member.role}
                    onChange={e =>
                      updateUserRole(member.id, e.target.value).then(() => {
                        setTeam((prev: any) =>
                          prev.map((m: any) =>
                            m.id === member.id ? { ...m, role: e.target.value } : m
                          )
                        );
                      })
                    }
                    className="border px-2 py-1 text-sm"
                  >
                    {ROLES.filter(r => r !== 'owner').map(role => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() =>
                      removeTeamMember(member.id).then(() =>
                        setTeam((prev: any) => prev.filter((m: any) => m.id !== member.id))
                      )
                    }
                    className="text-red-500 hover:underline text-sm"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
