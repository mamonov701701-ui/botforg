import React, { useEffect, useMemo, useState } from 'react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { crmOverview, type CrmOverview } from '../../../api/botCrm';
import { useCrmDataScope } from './CrmDataScopeContext';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from '../../../utils/toast';

function percent(part: number, total: number): string {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

function deltaArrow(value: number): string {
  if (value > 0) return '↑';
  if (value < 0) return '↓';
  return '→';
}

type TrendItem = { current: number; previous: number; delta: number };
function MetricCard({
  title,
  value,
  trend,
  insight,
  problem,
  actionLabel,
  onAction,
}: {
  title: string;
  value: string | number;
  trend?: TrendItem;
  insight: string;
  problem?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <Card className="crm-panel" padding="16px 18px">
      <div className="crm-muted" style={{ fontSize: 12, marginBottom: 8 }}>
        {title}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15 }}>{value}</div>
      {trend ? (
        <div className="crm-hint" style={{ marginTop: 8, marginBottom: 0 }}>
          {deltaArrow(trend.delta)} {trend.delta > 0 ? '+' : ''}
          {trend.delta} к предыдущим 7 дням
        </div>
      ) : null}
      <div className="crm-hint" style={{ marginTop: 6, marginBottom: 0 }}>
        {insight}
      </div>
      {problem ? (
        <div className="crm-hint" style={{ marginTop: 6, marginBottom: 0, color: '#fbbf24' }}>
          {problem}
        </div>
      ) : null}
      {actionLabel && onAction ? (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="crm-btn crm-btn--ghost crm-btn--sm" onClick={onAction}>
            {actionLabel}
          </button>
        </div>
      ) : null}
    </Card>
  );
}

export default function BotCrmOverviewPage() {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();
  const id = Number(botId);
  const { showMode } = useCrmDataScope();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<CrmOverview | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    setLoading(true);
    crmOverview(id, showMode)
      .then(setData)
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Не удалось загрузить обзор CRM';
        toast.error(msg);
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [id, showMode]);

  const profileStats = useMemo(() => {
    if (!data) return null;
    const t = data.profile_completeness.total_contacts;
    return [
      {
        label: 'С именем',
        value: data.profile_completeness.with_name,
        pct: percent(data.profile_completeness.with_name, t),
      },
      {
        label: 'С телефоном',
        value: data.profile_completeness.with_phone,
        pct: percent(data.profile_completeness.with_phone, t),
      },
      {
        label: 'С e-mail',
        value: data.profile_completeness.with_email,
        pct: percent(data.profile_completeness.with_email, t),
      },
      {
        label: 'Профиль заполнен',
        value: data.profile_completeness.fully_filled,
        pct: percent(data.profile_completeness.fully_filled, t),
      },
    ];
  }, [data]);

  const activeRate = useMemo(() => {
    if (!data?.total_contacts) return 0;
    return Math.round((data.active_contacts_7d / data.total_contacts) * 100);
  }, [data]);
  const sleepyRate = useMemo(() => {
    if (!data?.total_contacts) return 0;
    return Math.round((data.sleeping_contacts_30d / data.total_contacts) * 100);
  }, [data]);

  return (
    <DashboardPage title="">
      {loading ? (
        <Card className="crm-panel" padding="20px 24px">
          <p className="crm-muted" style={{ margin: 0 }}>
            Загрузка обзора CRM…
          </p>
        </Card>
      ) : !data ? (
        <Card className="crm-panel" padding="20px 24px">
          <p className="crm-muted" style={{ margin: 0 }}>
            Нет данных для отображения.
          </p>
        </Card>
      ) : (
        <div className="crm-detail-stack" style={{ gap: 14 }}>
          <div
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            }}
          >
            <MetricCard
              title="Всего контактов"
              value={data.total_contacts}
              trend={data.trends?.total_contacts}
              insight="Размер вашей базы контактов в выбранном режиме."
              problem={
                data.trends && data.trends.total_contacts.delta <= 0
                  ? 'База не растет — проверьте каналы и входящий трафик.'
                  : undefined
              }
              actionLabel="Открыть контакты"
              onAction={() => navigate(`/dashboard/bots/${id}/crm/contacts?show=${showMode}`)}
            />
            <MetricCard
              title="Новые контакты (7 дней)"
              value={data.new_contacts_7d}
              trend={data.trends?.new_contacts_7d}
              insight="Сколько новых людей добавилось за последнюю неделю."
              problem={data.new_contacts_7d === 0 ? 'Нет новых контактов за 7 дней.' : undefined}
              actionLabel="Показать новых"
              onAction={() => {
                navigate(`/dashboard/bots/${id}/crm/contacts?show=${showMode}&srt=created`);
              }}
            />
            <MetricCard
              title="Активные контакты (7 дней)"
              value={data.active_contacts_7d}
              trend={data.trends?.active_contacts_7d}
              insight={`Вовлеченность базы: ${activeRate}% контактов были активны за 7 дней.`}
              problem={
                activeRate < 15 ? 'Низкая активность — стоит запускать реактивацию.' : undefined
              }
              actionLabel="Показать активных"
              onAction={() => {
                const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                navigate(
                  `/dashboard/bots/${id}/crm/contacts?show=${showMode}&asince=${encodeURIComponent(since)}`
                );
              }}
            />
            <MetricCard
              title="Спящие (7 дней без активности)"
              value={data.sleeping_contacts_7d}
              trend={data.trends?.sleeping_contacts_7d}
              insight="Контакты, у которых не было активности за 7 дней."
              problem={
                data.sleeping_contacts_7d > data.active_contacts_7d
                  ? 'Спящих больше, чем активных.'
                  : undefined
              }
              actionLabel="Открыть список для реактивации"
              onAction={() => {
                const until = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                navigate(
                  `/dashboard/bots/${id}/crm/contacts?show=${showMode}&auntil=${encodeURIComponent(until)}`
                );
              }}
            />
            <MetricCard
              title="Спящие (30 дней без активности)"
              value={data.sleeping_contacts_30d}
              trend={data.trends?.sleeping_contacts_30d}
              insight={`Долгий отток: ${sleepyRate}% базы не активны 30+ дней.`}
              problem={sleepyRate >= 50 ? 'Половина базы и более не активна 30+ дней.' : undefined}
              actionLabel="Показать 30+ дней без активности"
              onAction={() => {
                const until = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
                navigate(
                  `/dashboard/bots/${id}/crm/contacts?show=${showMode}&auntil=${encodeURIComponent(until)}`
                );
              }}
            />
            <MetricCard
              title="В процессе / завершили сценарий"
              value={`${data.scenario_progress.in_progress} / ${data.scenario_progress.completed}`}
              insight="Показывает баланс незавершенных и завершенных диалогов."
              problem={
                data.scenario_progress.in_progress > data.scenario_progress.completed * 2
                  ? 'Слишком много контактов в процессе — проверьте узкие места сценария.'
                  : undefined
              }
              actionLabel="Открыть сценарий"
              onAction={() => navigate(`/editor/${id}`)}
            />
          </div>

          <Card className="crm-panel" padding="20px 24px">
            <h3 className="crm-section-title" style={{ marginTop: 0 }}>
              Заполненность профиля (ключевые поля)
            </h3>
            <div className="crm-table-wrap">
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>Показатель</th>
                    <th>Контактов</th>
                    <th>Доля</th>
                  </tr>
                </thead>
                <tbody>
                  {profileStats?.map(row => (
                    <tr key={row.label}>
                      <td>{row.label}</td>
                      <td>{row.value}</td>
                      <td>{row.pct}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="crm-inline-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="crm-btn crm-btn--ghost crm-btn--sm"
                onClick={() => navigate(`/dashboard/bots/${id}/crm/contacts?show=${showMode}`)}
              >
                Открыть контакты
              </button>
              <p className="crm-hint" style={{ margin: 0 }}>
                Инсайт: чем выше «Профиль заполнен», тем точнее сегментация и сценарии.
              </p>
            </div>
          </Card>

          <div
            style={{
              display: 'grid',
              gap: 12,
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            }}
          >
            <Card className="crm-panel" padding="20px 24px">
              <h3 className="crm-section-title" style={{ marginTop: 0 }}>
                Топ-5 тегов по охвату
              </h3>
              <div className="crm-table-wrap">
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>Тег</th>
                      <th>Контактов</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_tags.length ? (
                      data.top_tags.map(t => (
                        <tr key={t.key}>
                          <td>{t.label?.trim() ? t.label : t.key}</td>
                          <td>{t.contacts_count}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="crm-muted">
                          Нет тегов для выбранного режима
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="crm-inline-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="crm-btn crm-btn--ghost crm-btn--sm"
                  onClick={() => navigate(`/dashboard/bots/${id}/crm/tags?show=${showMode}`)}
                >
                  Управлять тегами
                </button>
                {data.top_tags.length ? (
                  <button
                    type="button"
                    className="crm-btn crm-btn--ghost crm-btn--sm"
                    onClick={() =>
                      navigate(
                        `/dashboard/bots/${id}/crm/contacts?show=${showMode}&tag=${encodeURIComponent(
                          data.top_tags[0].key
                        )}`
                      )
                    }
                  >
                    Открыть контакты топ-тега
                  </button>
                ) : null}
              </div>
            </Card>

            <Card className="crm-panel" padding="20px 24px">
              <h3 className="crm-section-title" style={{ marginTop: 0 }}>
                Распределение статусов
              </h3>
              <div className="crm-table-wrap">
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>Статус</th>
                      <th>Контактов</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.statuses.length ? (
                      data.statuses.map(s => (
                        <tr key={s.status}>
                          <td>{s.status}</td>
                          <td>{s.contacts_count}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} className="crm-muted">
                          Нет статусов для выбранного режима
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="crm-inline-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="crm-btn crm-btn--ghost crm-btn--sm"
                  onClick={() => navigate(`/dashboard/bots/${id}/crm/statuses?show=${showMode}`)}
                >
                  Открыть статусы
                </button>
                {data.statuses.length ? (
                  <button
                    type="button"
                    className="crm-btn crm-btn--ghost crm-btn--sm"
                    onClick={() =>
                      navigate(
                        `/dashboard/bots/${id}/crm/contacts?show=${showMode}&cstatus=${encodeURIComponent(
                          data.statuses[0].status
                        )}`
                      )
                    }
                  >
                    Открыть крупнейший статус
                  </button>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      )}
    </DashboardPage>
  );
}
