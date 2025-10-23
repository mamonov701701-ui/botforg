import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { getUser, updateUserRole, deleteUser } from '@/api/users';

const ROLES = ['owner', 'admin', 'manager_template', 'developer', 'support', 'viewer', 'user'];

export default function AdminUserEditPage() {
  const { user: currentUser, loading } = useRequireAuth();
  const router = useRouter();
  const { id } = router.query;
  const [user, setUser] = useState<any>(null);
  const [role, setRole] = useState('');
  const [loadingUser, setLoadingUser] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoadingUser(true);
    setError('');
    getUser(id)
      .then((u: any) => {
        setUser(u);
        setRole(u.role);
      })
      .catch(() => setError('Пользователь не найден'))
      .finally(() => setLoadingUser(false));
  }, [id]);

  if (loading || loadingUser) return <div>Загрузка...</div>;
  if (!currentUser || !['owner', 'admin'].includes(currentUser.role)) return <div>Нет доступа</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!user) return null;

  const isOwner = user.role === 'owner';

  const handleRoleChange = async () => {
    setUpdating(true);
    setError('');
    setSuccess('');
    try {
      await updateUserRole(user.id, role);
      setSuccess('Роль обновлена');
    } catch {
      setError('Ошибка при обновлении роли');
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Удалить пользователя?')) return;
    setDeleting(true);
    setError('');
    setSuccess('');
    try {
      await deleteUser(user.id);
      setSuccess('Пользователь удалён');
      setTimeout(() => router.push('/admin/users'), 1000);
    } catch {
      setError('Ошибка при удалении пользователя');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Пользователь #{user.id}</h1>
      <div className="mb-2">
        <b>Имя:</b> {user.name || <span className="text-gray-400">—</span>}
      </div>
      <div className="mb-2">
        <b>Email:</b> {user.email}
      </div>
      <div className="mb-2">
        <b>Дата регистрации:</b> {new Date(user.created_at).toLocaleString()}
      </div>
      <div className="mb-4">
        <b>Роль:</b>{' '}
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          disabled={isOwner}
          className="border rounded px-2 py-1 text-sm"
        >
          {ROLES.map(r => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {isOwner && <span className="ml-2 text-gray-500">(владелец, нельзя изменить)</span>}
        {!isOwner && (
          <button
            className="ml-4 bg-blue-600 text-white px-4 py-1 rounded text-sm disabled:opacity-50"
            onClick={handleRoleChange}
            disabled={updating || role === user.role}
          >
            {updating ? 'Сохраняю...' : 'Сохранить роль'}
          </button>
        )}
      </div>
      <div className="flex gap-4 mt-6">
        <button
          className="bg-red-600 text-white px-4 py-1 rounded text-sm disabled:opacity-50"
          onClick={handleDelete}
          disabled={isOwner || deleting}
        >
          {deleting ? 'Удаляю...' : 'Удалить пользователя'}
        </button>
      </div>
      {success && <div className="text-green-600 mt-4">{success}</div>}
      {error && <div className="text-red-600 mt-4">{error}</div>}
    </div>
  );
}
