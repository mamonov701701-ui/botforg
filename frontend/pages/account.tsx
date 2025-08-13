import { useRequireAuth } from '@/hooks/useRequireAuth';

export default function AccountPage() {
  const { user, loading } = useRequireAuth();

  if (loading) return <div>Загрузка...</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Личный кабинет</h1>
      <div className="space-y-2">
        <p><strong>Имя:</strong> {user.name}</p>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Роль:</strong> {user.role}</p>
        <p><strong>Дата регистрации:</strong> {new Date(user.created_at).toLocaleDateString()}</p>
      </div>
    </div>
  );
} 