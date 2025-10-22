import React, { useEffect, useState } from "react";
import api from "@/api/client";

interface CommentListProps {
  templateId: number;
  currentUserId?: number;
}

interface Comment {
  id: number;
  user_id: number;
  content: string;
  created_at: string;
  user?: { name?: string; email?: string };
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function CommentList({ templateId, currentUserId }: CommentListProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const loadComments = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/templates/${templateId}/comments`);
      setComments(res.data.reverse());
    } catch (e) {
      setError("Ошибка загрузки комментариев");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
    // eslint-disable-next-line
  }, [templateId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (content.trim().length < 3) return;
    setSending(true);
    setError("");
    try {
      const res = await api.post("/comments", { template_id: templateId, content });
      setComments((prev) => [res.data, ...prev]);
      setContent("");
    } catch (e) {
      setError("Ошибка отправки комментария");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-6">
      <h3 className="font-semibold mb-2">Комментарии</h3>
      {currentUserId !== undefined && (
        <form onSubmit={handleSubmit} className="mb-4 flex flex-col gap-2">
          <textarea
            className="border rounded p-2 min-h-[60px]"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Ваш комментарий..."
            minLength={3}
            required
            disabled={sending}
          />
          <button
            type="submit"
            className="bg-blue-600 text-white rounded px-4 py-2 self-end disabled:opacity-50"
            disabled={sending || content.trim().length < 3}
          >
            {sending ? "Отправка..." : "Отправить"}
          </button>
        </form>
      )}
      {loading ? (
        <div>Загрузка комментариев...</div>
      ) : error ? (
        <div className="text-red-600">{error}</div>
      ) : comments.length === 0 ? (
        <div className="text-gray-500">Комментариев пока нет. Будьте первым!</div>
      ) : (
        <div className="flex flex-col gap-4">
          {comments.map((c) => (
            <div key={c.id} className="border-b pb-2">
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                <span>{c.user?.name || c.user?.email || `Пользователь #${c.user_id}`}</span>
                <span>•</span>
                <span>{formatDate(c.created_at)}</span>
              </div>
              <div>{c.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 