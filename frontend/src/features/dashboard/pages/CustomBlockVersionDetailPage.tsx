import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { fetchCustomBlock } from '../../../api/blocks';
import type { CustomBlockVersion } from '../../../types/blocks';
import { customBlockConnectionContract } from '../../../utils/customBlockConnections';
import {
  reviewActorLabel,
  reviewDecisionLabel,
  reviewEventLabel,
  reviewStateLabel,
  securityReportLabel,
} from '../../../utils/customBlockReviewPresentation';

export default function CustomBlockVersionDetailPage() {
  const { versionId } = useParams();
  const [item, setItem] = useState<CustomBlockVersion | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    void fetchCustomBlock(Number(versionId))
      .then(setItem)
      .catch(() => setError(true));
  }, [versionId]);
  if (error)
    return (
      <DashboardPage title="Версия блока недоступна">
        <p>Проверьте права доступа.</p>
      </DashboardPage>
    );
  if (!item)
    return (
      <DashboardPage title="Версия блока">
        <p>Загрузка…</p>
      </DashboardPage>
    );
  const passport = item.passport;
  const connections = customBlockConnectionContract(passport);
  const isJavaScript = item.runtime_kind === 'javascript';
  return (
    <DashboardPage
      title={item.title}
      subtitle={`Версия ${item.version} · ${item.status_label}`}
      breadcrumbs={[
        { label: 'Библиотека блоков', path: '/dashboard/block-library' },
        { label: item.title },
      ]}
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Card>
            <h2 className="font-semibold">Назначение</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {String(passport.purpose || item.description)}
            </p>
          </Card>
          <Card>
            <h2 className="font-semibold">Когда использовать</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {String(passport.when_to_use || '')}
            </p>
          </Card>
          <Card>
            <h2 className="font-semibold">Инструкция этой версии</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-[var(--text-muted)]">
              {String(item.user_guide.content || '')}
            </p>
          </Card>
        </div>
        <div className="space-y-5">
          <Card>
            <h2 className="font-semibold">О версии</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Выполнение:{' '}
              {isJavaScript
                ? 'JavaScript Runtime (изолированное выполнение JavaScript)'
                : 'Message fallback (резервное выполнение сообщением)'}
              .
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Входов: {connections.inputCount}. Выходов: {connections.outputs.length}.
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Использований в сценариях: {item.usage_count}
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Процесс проверки: {reviewStateLabel(item.review_state)}.
            </p>
          </Card>
          {item.latest_security_report ? (
            <Card>
              <h2 className="font-semibold">AI Security Agent (ИИ-агент безопасности)</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">{securityReportLabel(item)}</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Статус:{' '}
                {item.latest_security_report.status === 'failed'
                  ? 'недоступен; публикация заблокирована'
                  : 'отчёт готов'}
                .
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Отчёт носит рекомендательный характер: окончательное решение принимает
                администратор.
              </p>
              {item.latest_security_report.findings.length ? (
                <ul className="mt-2 list-disc pl-5 text-sm text-[var(--text-muted)]">
                  {item.latest_security_report.findings.map((finding, index) => (
                    <li key={`${finding.location}-${index}`}>
                      {finding.severity}: {finding.finding} — {finding.recommendation}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}
          {item.review_history?.length ? (
            <Card>
              <h2 className="font-semibold">История ручной проверки</h2>
              <ul className="mt-2 space-y-2 text-sm text-[var(--text-muted)]">
                {item.review_history.map(event => (
                  <li key={event.id}>
                    {reviewDecisionLabel(event.decision)} · администратор #{event.reviewer_user_id}
                    {event.comment ? ` — ${event.comment}` : ''}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {item.review_events?.length ? (
            <Card>
              <h2 className="font-semibold">История процесса проверки</h2>
              <ul className="mt-2 space-y-2 text-xs text-[var(--text-muted)]">
                {item.review_events.map(event => (
                  <li key={event.id}>
                    {reviewEventLabel(event.event_type)}
                    {event.previous_state &&
                    event.resulting_state &&
                    event.previous_state !== event.resulting_state
                      ? `: ${reviewStateLabel(event.previous_state as CustomBlockVersion['review_state'])} → ${reviewStateLabel(event.resulting_state as CustomBlockVersion['review_state'])}`
                      : ''}
                    {' · '}
                    {reviewActorLabel(event.actor_type)}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card>
            <h2 className="font-semibold">Соединения этой версии</h2>
            {connections.outputs.length ? (
              <ul className="mt-2 space-y-1 text-sm text-[var(--text-muted)]">
                {connections.outputs.map(output => (
                  <li key={output.name}>
                    {output.display_name} · маршрут <code>{output.name}</code>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Выходов нет: это Terminal Block (терминальный блок).
              </p>
            )}
          </Card>
          <Card>
            <h2 className="font-semibold">Ограничения</h2>
            <ul className="mt-2 list-disc pl-5 text-sm text-[var(--text-muted)]">
              {((passport.limitations as string[]) || []).map(value => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          </Card>
          <Link
            to="/dashboard/block-library"
            className="inline-flex rounded border border-[var(--border)] px-3 py-2"
          >
            Вернуться в библиотеку
          </Link>
        </div>
      </div>
    </DashboardPage>
  );
}
