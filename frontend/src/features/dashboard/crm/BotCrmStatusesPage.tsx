import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { toast } from '../../../utils/toast';
import { useCrmDataScope } from './CrmDataScopeContext';
import { crmStatusesSummary, SESSION_FILTER_NONE } from '../../../api/botCrm';

export default function BotCrmStatusesPage() {
  const { botId } = useParams<{ botId: string }>();
  const navigate = useNavigate();
  const id = Number(botId);
  const { showMode } = useCrmDataScope();
  const [loading, setLoading] = useState(true);
  const [contactRows, setContactRows] = useState<{ name: string; count: number }[]>([]);
  const [sessionRows, setSessionRows] = useState<
    { name: string; count: number; dialogParam: string }[]
  >([]);

  const load = useCallback(async () => {
    if (!Number.isFinite(id)) return;
    setLoading(true);
    try {
      const summary = await crmStatusesSummary(id, showMode);
      const clist = summary.contact_statuses.map(row => ({
        name: row.name,
        count: row.count,
      }));
      setContactRows(clist);
      const list = summary.session_statuses.map(row => ({
        name: row.name,
        count: row.count,
        dialogParam: row.dialog_param || (row.name === '—' ? SESSION_FILTER_NONE : row.name),
      }));
      setSessionRows(list);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Не удалось загрузить';
      toast.error(msg);
      setContactRows([]);
      setSessionRows([]);
    } finally {
      setLoading(false);
    }
  }, [id, showMode]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DashboardPage title="">
      <Card className="crm-panel" padding="22px 24px">
        <h3 className="crm-section-title" style={{ marginTop: 0 }}>
          Статусы контактов
        </h3>
        <p className="crm-hint" style={{ maxWidth: '52rem', marginBottom: 16 }}>
          Здесь показан статус контакта CRM — то же значение, что в карточке контакта (блок «Данные
          пользователя» → «Статус»). Клик по строке откроет список контактов с этим статусом.
        </p>

        <p className="crm-section-title" style={{ fontSize: 14, marginBottom: 8 }}>
          По статусу контакта
        </p>
        {loading ? (
          <p className="crm-muted" style={{ padding: '20px 0' }}>
            Загрузка…
          </p>
        ) : contactRows.length === 0 ? (
          <div className="crm-empty" style={{ marginBottom: 28 }}>
            <p className="crm-empty__title">Нет данных по статусу контакта</p>
            <p className="crm-empty__text">
              При текущем режиме «Показывать» нет контактов или у всех статус по умолчанию.
            </p>
          </div>
        ) : (
          <div className="crm-table-wrap" style={{ marginBottom: 28 }}>
            <table className="crm-table">
              <thead>
                <tr>
                  <th>Статус</th>
                  <th>Контактов</th>
                </tr>
              </thead>
              <tbody>
                {contactRows.map(r => (
                  <tr
                    key={r.name}
                    className="crm-row-click"
                    onClick={() =>
                      navigate(
                        `/dashboard/bots/${id}/crm/contacts?cstatus=${encodeURIComponent(r.name)}&show=${showMode}`
                      )
                    }
                  >
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && sessionRows.length > 0 ? (
          <details className="crm-status-details">
            <summary>Статус диалога (техническая сводка)</summary>
            <div className="crm-status-details__body">
              <p className="crm-hint" style={{ marginBottom: 12 }}>
                Внутренний шаг сценария. Доступно по ссылке из этой сводки; в основном списке
                контактов отбор по диалогу не показывается.
              </p>
              <div className="crm-table-wrap">
                <table className="crm-table">
                  <thead>
                    <tr>
                      <th>Название</th>
                      <th>Контактов</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionRows.map(r => (
                      <tr
                        key={r.dialogParam}
                        className="crm-row-click"
                        onClick={() =>
                          navigate(
                            `/dashboard/bots/${id}/crm/contacts?dialog=${encodeURIComponent(r.dialogParam)}&show=${showMode}`
                          )
                        }
                      >
                        <td style={{ fontWeight: 600 }}>{r.name}</td>
                        <td>{r.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        ) : null}
      </Card>
    </DashboardPage>
  );
}
