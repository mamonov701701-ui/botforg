/**
 * Кабинет разработчика — Мои шаблоны
 * Доступ только при тарифе Developer.
 */
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Plus, ExternalLink, Send } from 'lucide-react';
import { getMyTemplates, submitTemplateToModeration, type MyTemplate } from '../api/market';
import { useAuthStore } from '../stores/authStore';
import { hasAccessToPlanRestrictedAction } from '../constants/roles';
import { toast } from '../utils/toast';
import './DeveloperTemplatesPage.css';

function formatDate(s: string) {
  try {
    return new Date(s).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return s;
  }
}

function moderationStatusLabel(ms: string) {
  const labels: Record<string, string> = {
    draft: 'Черновик',
    pending: 'На модерации',
    approved: 'Одобрен',
    rejected: 'Отклонён',
  };
  return labels[ms] || ms;
}

export default function DeveloperTemplatesPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<MyTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  const isDeveloper = hasAccessToPlanRestrictedAction(user, 'marketplace_stats');

  const loadTemplates = () => {
    getMyTemplates()
      .then(setTemplates)
      .catch(() => {});
  };

  useEffect(() => {
    if (!isDeveloper) {
      navigate('/pricing');
      return;
    }
    getMyTemplates()
      .then(setTemplates)
      .catch((err: { status?: number; message?: string }) => {
        if (err?.status === 403) {
          navigate('/pricing');
        } else {
          setError(err?.message || 'Ошибка загрузки');
        }
      })
      .finally(() => setLoading(false));
  }, [isDeveloper, navigate]);

  if (!isDeveloper) {
    return null;
  }

  return (
    <div className="developer-templates">
      <div className="developer-templates__header">
        <h1 className="developer-templates__title">Мои шаблоны</h1>
        <p className="developer-templates__subtitle">
          Кабинет разработчика — управление опубликованными шаблонами
        </p>
        <Link to="/market" className="developer-templates__back">
          ← Маркетплейс
        </Link>
      </div>

      {loading ? (
        <div className="developer-templates__loading">Загрузка...</div>
      ) : error ? (
        <div className="developer-templates__error">{error}</div>
      ) : templates.length === 0 ? (
        <div className="developer-templates__empty">
          <FileText size={64} className="developer-templates__empty-icon" />
          <h2>У вас пока нет опубликованных шаблонов</h2>
          <p>Создайте бота, настройте сценарии и опубликуйте его в маркетплейсе</p>
          <Link to="/market" className="developer-templates__cta">
            <Plus size={20} />
            Создать и опубликовать шаблон
          </Link>
        </div>
      ) : (
        <div className="developer-templates__table-wrap">
          <table className="developer-templates__table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Статус модерации</th>
                <th>Установки</th>
                <th>Просмотры</th>
                <th>Дата</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id}>
                  <td className="developer-templates__name">
                    <div>{t.name}</div>
                    {t.moderation_status === 'rejected' && t.moderation_rejection_reason && (
                      <div className="developer-templates__rejection">
                        Причина отказа: {t.moderation_rejection_reason}
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      className={`developer-templates__status developer-templates__status--${t.moderation_status || 'draft'}`}
                    >
                      {moderationStatusLabel(t.moderation_status || 'draft')}
                    </span>
                  </td>
                  <td>{t.installs_count}</td>
                  <td>{t.views_count}</td>
                  <td>{formatDate(t.created_at)}</td>
                  <td>
                    <div className="developer-templates__actions">
                      {(t.moderation_status || 'draft') === 'draft' && (
                        <button
                          type="button"
                          className="developer-templates__submit-btn"
                          disabled={submittingId === t.id}
                          onClick={async () => {
                            setSubmittingId(t.id);
                            try {
                              await submitTemplateToModeration(t.id);
                              toast.success('Шаблон отправлен на модерацию');
                              loadTemplates();
                            } catch (err: unknown) {
                              toast.error(
                                (err as { message?: string })?.message || 'Ошибка отправки'
                              );
                            } finally {
                              setSubmittingId(null);
                            }
                          }}
                          title="Отправить на модерацию"
                        >
                          <Send size={14} />
                          {submittingId === t.id ? 'Отправка...' : 'На модерацию'}
                        </button>
                      )}
                      <Link
                        to="/market"
                        className="developer-templates__action"
                        title="Маркетплейс"
                      >
                        <ExternalLink size={16} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
