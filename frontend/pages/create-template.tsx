import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useState } from 'react';
import { createTemplate } from '@/api/templates';
import { useRouter } from 'next/navigation';

const ALLOWED_ROLES = ['owner', 'admin', 'manager_template'];

export default function CreateTemplatePage() {
  const { user, loading } = useRequireAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <div>Загрузка...</div>;
  if (!ALLOWED_ROLES.includes(user.role)) {
    return <div className="p-8 text-center text-red-600">У вас нет прав для создания шаблона</div>;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await createTemplate({ name, category, description, is_public: isPublic });
      router.push('/my-templates');
    } catch {
      setError('Ошибка при создании шаблона');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-12 p-6 border rounded-xl shadow">
      <h1 className="text-2xl font-bold mb-6 text-center">Создание шаблона</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="text"
          placeholder="Название"
          value={name}
          onChange={e => setName(e.target.value)}
          className="border rounded px-3 py-2"
          required
        />
        <input
          type="text"
          placeholder="Категория"
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="border rounded px-3 py-2"
          required
        />
        <textarea
          placeholder="Описание"
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="border rounded px-3 py-2 min-h-[80px]"
          required
        />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={isPublic} onChange={() => setIsPublic(v => !v)} />
          Публичный шаблон
        </label>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <button
          type="submit"
          className="bg-blue-600 text-white rounded px-4 py-2 mt-2 disabled:opacity-50"
          disabled={submitting}
        >
          {submitting ? 'Создание...' : 'Создать шаблон'}
        </button>
      </form>
    </div>
  );
}
