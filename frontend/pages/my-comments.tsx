import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useEffect, useState } from 'react';
import { getMyComments, deleteComment, updateComment } from '@/api/comments';
import Link from 'next/link';

export default function MyCommentsPage() {
  const { user, loading } = useRequireAuth();
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [error, setError] = useState("");
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [editId, setEditId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const loadComments = async () => {
    setLoadingComments(true);
    setError("");
    try {
      const data = await getMyComments();
      setComments(data);
    } catch {
      setError("Ошибка загрузки комментариев");
    } finally {
      setLoadingComments(false);
    }
  };

  useEffect(() => {
    loadComments();
    // eslint-disable-next-line
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Удалить комментарий?")) return;
    await deleteComment(id);
    setComments((prev) => prev.filter((c) => c.id !== id));
  };

  const handleEdit = (id: number, content: string) => {
    setEditId(id);
    setEditContent(content);
  };

  const handleEditSave = async () => {
    setEditLoading(true);
    try {
      await updateComment(editId!, editContent);
      setComments((prev) => prev.map((c) => c.id === editId ? { ...c, content: editContent } : c));
      setEditId(null);
      setEditContent("");
    } catch {
      alert("Ошибка при сохранении комментария");
    } finally {
      setEditLoading(false);
    }
  };

  const sortedComments = [...comments].sort((a, b) =>
    sortOrder === 'desc'
      ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  if (loading || loadingComments) return <div>Загрузка...</div>;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Мои комментарии</h1>
      <div className="mb-4 flex items-end gap-4">
        <div className="text-sm text-gray-600">Всего: {comments.length}</div>
        <div>
          <label className="text-xs mr-2">Сортировка по дате:</label>
          <select
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value as 'desc' | 'asc')}
            className="border rounded px-2 py-1 text-xs"
          >
            <option value="desc">Сначала новые</option>
            <option value="asc">Сначала старые</option>
          </select>
        </div>
      </div>
      {error && <div className="text-red-600 mb-2">{error}</div>}
      {comments.length === 0 ? (
        <div>Вы ещё не оставляли комментариев</div>
      ) : (
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">Шаблон</th>
              <th className="p-2 border">Комментарий</th>
              <th className="p-2 border">Дата</th>
              <th className="p-2 border"></th>
            </tr>
          </thead>
          <tbody>
            {sortedComments.map((c: any) => (
              <tr key={c.id}>
                <td className="p-2 border">
                  <Link href={`/template/${c.template_id}`} className="text-blue-600 underline">
                    {c.template?.name || `Шаблон #${c.template_id}`}
                  </Link>
                </td>
                <td className="p-2 border">
                  {editId === c.id ? (
                    <div className="flex gap-2 items-center">
                      <input
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        className="border rounded px-2 py-1 text-xs w-full"
                        disabled={editLoading}
                      />
                      <button
                        onClick={handleEditSave}
                        className="bg-blue-600 text-white rounded px-2 py-1 text-xs"
                        disabled={editLoading || editContent.trim().length < 3}
                      >
                        Сохранить
                      </button>
                      <button
                        onClick={() => setEditId(null)}
                        className="text-gray-500 text-xs"
                        disabled={editLoading}
                      >
                        Отмена
                      </button>
                    </div>
                  ) : (
                    c.content
                  )}
                </td>
                <td className="p-2 border">{new Date(c.created_at).toLocaleDateString()}</td>
                <td className="p-2 border">
                  <button
                    onClick={() => handleEdit(c.id, c.content)}
                    className="text-blue-600 hover:underline text-xs mr-2"
                  >
                    Редактировать
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
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