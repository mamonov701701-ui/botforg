import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useEffect, useState } from 'react';
import { getMyTemplates, deleteTemplate, publishTemplate } from '@/api/templates';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';

export default function MyTemplatesPage() {
  const { user, loading } = useRequireAuth();
  const { user: authUser } = useAuth();
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getMyTemplates()
      .then((data: any) => setTemplates(data.items || data))
      .catch(() => setError('Ошибка загрузки шаблонов'))
      .finally(() => setLoadingTemplates(false));
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить шаблон?')) return;
    await deleteTemplate(id);
    setTemplates(prev => prev.filter((t: any) => t.id !== id));
  };

  const handlePublish = async (id: number) => {
    await publishTemplate(id);
    setTemplates(prev => prev.map((t: any) => (t.id === id ? { ...t, is_public: true } : t)));
  };

  if (loading || loadingTemplates) return <div>Загрузка...</div>;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Мои шаблоны</h1>
      <div className="mb-4 text-sm text-gray-600">Всего: {templates.length}</div>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {templates.length === 0 ? (
        <div>У вас пока нет шаблонов.</div>
      ) : (
        <ul className="space-y-3">
          {templates.map((t: any) => (
            <li key={t.id} className="border p-3 rounded flex justify-between items-center">
              <div>
                <div className="font-semibold">{t.name}</div>
                <div className="text-xs text-gray-500">Категория: {t.category}</div>
                <div className="text-xs text-gray-500">
                  Создан: {new Date(t.created_at).toLocaleDateString()}
                </div>
                <div className="text-xs mt-1">
                  Статус:{' '}
                  {t.is_public ? (
                    <span className="text-green-600">Опубликован</span>
                  ) : (
                    <span className="text-yellow-600">Черновик</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 items-center">
                {!t.is_public &&
                  (user.role === 'owner' ||
                    user.role === 'admin' ||
                    user.role === 'manager_template') && (
                    <button
                      onClick={() => handlePublish(t.id)}
                      className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
                    >
                      Опубликовать
                    </button>
                  )}
                {(user.role === 'owner' ||
                  user.role === 'admin' ||
                  user.role === 'manager_template') && (
                  <Link
                    href={`/template/edit/${t.id}`}
                    className="px-2 py-1 bg-gray-200 rounded text-xs"
                  >
                    Редактировать
                  </Link>
                )}
                {(user.role === 'owner' ||
                  user.role === 'admin' ||
                  user.role === 'manager_template') && (
                  <button
                    onClick={() => handleDelete(t.id)}
                    className="px-2 py-1 bg-red-500 text-white rounded text-xs"
                  >
                    Удалить
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {/* <button className="mt-6 px-4 py-2 bg-green-600 text-white rounded">Создать шаблон</button> */}
    </div>
  );
}
