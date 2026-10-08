import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { fetchCustomBlock } from '../../../api/blocks';
import {
  getMyCustomBlockMarketplaceListings,
  grantCustomBlockDirectAccess,
  grantCustomBlockDistribution,
  type CustomBlockMarketplaceListing,
} from '../../../api/customBlockMarketplace';
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
  const [recipientPublicId, setRecipientPublicId] = useState('');
  const [grantNotice, setGrantNotice] = useState('');
  const [marketListing, setMarketListing] = useState<CustomBlockMarketplaceListing | null>(null);
  const [marketReady, setMarketReady] = useState(false);
  const grant = async (distribution: boolean) => {
    const publicId = Number(recipientPublicId);
    if (!Number.isInteger(publicId) || publicId <= 0 || !versionId)
      return setGrantNotice('Укажите публичный ID пользователя.');
    try {
      await (distribution
        ? grantCustomBlockDistribution(Number(versionId), publicId)
        : grantCustomBlockDirectAccess(Number(versionId), publicId));
      setGrantNotice(
        distribution ? 'Право распространения выдано.' : 'Право использования выдано.'
      );
    } catch {
      setGrantNotice(
        distribution ? 'Сначала выдайте право использования.' : 'Не удалось выдать доступ.'
      );
    }
  };
  useEffect(() => {
    let active = true;
    setMarketReady(false);
    void fetchCustomBlock(Number(versionId))
      .then(row => {
        if (active) setItem(row);
      })
      .catch(() => {
        if (active) setError(true);
      });
    void getMyCustomBlockMarketplaceListings()
      .then(rows => {
        if (active) {
          setMarketListing(
            rows.find(row => row.custom_block_version_id === Number(versionId)) || null
          );
          setMarketReady(true);
        }
      })
      .catch(() => {
        if (active) setMarketReady(false);
      });
    return () => {
      active = false;
    };
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
          {item.status === 'published' && marketReady && (
            <Card>
              <h2 className="font-semibold">Маркет</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Управление размещением находится в общем разделе «Маркет».
              </p>
              {marketListing && (
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Маркет:{' '}
                  {marketListing.lifecycle === 'published'
                    ? 'Опубликовано'
                    : marketListing.lifecycle === 'archived'
                      ? 'Архив'
                      : 'Черновик'}
                </p>
              )}
              <Link
                to={
                  marketListing
                    ? `/market/my-listings/custom-blocks?listingId=${marketListing.id}`
                    : `/market/my-listings/custom-blocks?versionId=${item.id}`
                }
                className="mt-3 inline-flex min-h-11 items-center rounded border border-[var(--border)] px-3 py-2 text-sm"
              >
                {marketListing ? 'Управлять размещением' : 'Разместить в Маркете'}
              </Link>
            </Card>
          )}
          {item.status === 'published' && (
            <Card>
              <h2 className="font-semibold">Предоставить доступ</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Выдайте точную версию конкретному клиенту без размещения в Маркете. Право
                распространения выдаётся отдельно.
              </p>
              <input
                aria-label="Публичный ID получателя"
                inputMode="numeric"
                className="mt-3 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-[var(--text)]"
                value={recipientPublicId}
                onChange={event => setRecipientPublicId(event.target.value)}
                placeholder="Публичный ID пользователя"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded bf-primary-cta px-3 py-2"
                  onClick={() => void grant(false)}
                >
                  Выдать право использования
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-[var(--border)] px-3 py-2"
                  onClick={() => void grant(true)}
                >
                  Выдать право распространения
                </button>
              </div>
              {grantNotice && (
                <p role="status" className="mt-2 text-sm">
                  {grantNotice}
                </p>
              )}
            </Card>
          )}
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
