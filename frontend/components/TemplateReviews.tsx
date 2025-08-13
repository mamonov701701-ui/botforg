import React, { useEffect, useState } from 'react';
import api from '@/api/client';

function StarRating({ value, onChange, disabled = false }: { value: number, onChange: (v: number) => void, disabled?: boolean }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`cursor-pointer text-xl ${n <= value ? 'text-yellow-400' : 'text-gray-300'}`}
          onClick={() => !disabled && onChange(n)}
          role="button"
        >★</span>
      ))}
    </div>
  );
}

export default function TemplateReviews({ templateId, canReview }: { templateId: number, canReview: boolean }) {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

  const load = () => {
    setLoading(true);
    api.get(`/templates/${templateId}/reviews`)
      .then(res => setReviews(res.data))
      .catch(() => setError('Ошибка загрузки отзывов'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [templateId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      await api.post(`/templates/${templateId}/review`, { rating, text });
      setSuccess('Спасибо за отзыв!');
      setRating(0);
      setText('');
      load();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Ошибка отправки');
    } finally {
      setSubmitting(false);
      setTimeout(() => setSuccess(''), 2000);
    }
  };

  return (
    <div className="mt-8">
      <h2 className="font-semibold mb-2">Отзывы</h2>
      {canReview && (
        <form onSubmit={handleSubmit} className="mb-4 p-4 bg-gray-50 rounded">
          <div className="mb-2">
            <StarRating value={rating} onChange={setRating} />
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            className="border rounded px-2 py-1 w-full text-sm mb-2"
            placeholder="Ваш отзыв (необязательно)"
            rows={2}
            maxLength={500}
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-1 rounded text-sm"
            disabled={submitting || !rating}
          >Оставить отзыв</button>
          {success && <span className="ml-2 text-green-600 text-sm">{success}</span>}
          {error && <span className="ml-2 text-red-600 text-sm">{error}</span>}
        </form>
      )}
      {loading ? (
        <div>Загрузка отзывов...</div>
      ) : reviews.length === 0 ? (
        <div className="text-gray-400">Пока нет отзывов</div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="border rounded p-3 bg-white">
              <div className="flex items-center gap-2 mb-1">
                <StarRating value={r.rating} onChange={() => {}} disabled />
                <span className="text-xs text-gray-500">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              {r.text && <div className="text-sm">{r.text}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
} 