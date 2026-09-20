import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { fetchCustomBlock } from '../../../api/blocks';
import type { CustomBlockVersion } from '../../../types/blocks';

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
              Блок отправляет настроенное сообщение и поддерживается в предпросмотре.
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Использований в сценариях: {item.usage_count}
            </p>
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
