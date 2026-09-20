import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Workflow } from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import {
  BLOCK_GUIDE_RU,
  GUIDE_SECTIONS_AFTER_CONFIGURE,
  GUIDE_SECTIONS_BEFORE_CONFIGURE,
} from '../../../pages/features/blockGuideRu';
import { useUserBlockCatalog } from '../blockLibrary/useUserBlockCatalog';
import {
  BLOCK_CATEGORY_LABELS,
  blockDisplayTitle,
  blockFieldDisplayLabel,
  blockFieldTypeLabel,
  blockSummary,
} from '../../../utils/blockCatalogPresentation';

function GuideText({ children }: { children: string }) {
  return (
    <p className="whitespace-pre-line text-sm leading-7 text-[var(--text-muted)]">{children}</p>
  );
}

export default function BlockLibraryDetailPage() {
  const { blockId = '' } = useParams();
  const { blocks, loading, error } = useUserBlockCatalog();
  const block = blocks.find(item => item.id === blockId);
  const guide = block ? BLOCK_GUIDE_RU[block.id] : undefined;
  const customPassport = block?.source === 'custom' ? block.passport : undefined;
  const customGuide = block?.source === 'custom' ? String(block.userGuide?.content || '') : '';

  if (loading)
    return (
      <DashboardPage title="Библиотека блоков">
        <p>Загрузка…</p>
      </DashboardPage>
    );
  if (error || !block) {
    return (
      <DashboardPage title="Блок не найден">
        <Card>
          <p className="text-[var(--text-muted)]">
            Этот блок недоступен или больше не входит в вашу библиотеку.
          </p>
          <Link
            to="/dashboard/block-library"
            className="mt-4 inline-flex rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]"
          >
            Вернуться в библиотеку
          </Link>
        </Card>
      </DashboardPage>
    );
  }

  return (
    <DashboardPage
      title={
        <span className="inline-flex items-center gap-3">
          <span aria-hidden>{block.icon}</span>
          {blockDisplayTitle(block)}
        </span>
      }
      subtitle={`${BLOCK_CATEGORY_LABELS[block.category]}. ${blockSummary(block)}${block.version ? ` · Версия ${block.version}` : ''}`}
      breadcrumbs={[
        { label: 'Библиотека блоков', path: '/dashboard/block-library' },
        { label: blockDisplayTitle(block) },
      ]}
      actions={
        <Link
          to="/editor"
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[#0A1B3D]"
          data-testid="block-detail-open-editor"
        >
          <Workflow size={17} />
          Открыть в редакторе
        </Link>
      }
    >
      <Link
        to="/dashboard/block-library"
        className="inline-flex items-center gap-2 text-sm text-[var(--accent)] mb-5"
      >
        <ArrowLeft size={16} />К каталогу
      </Link>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {guide ? (
            <>
              {GUIDE_SECTIONS_BEFORE_CONFIGURE.map(section => (
                <Card key={section.key}>
                  <h2 className="text-lg font-semibold text-[var(--text)] mb-3">{section.title}</h2>
                  <GuideText>{guide[section.key]}</GuideText>
                </Card>
              ))}
              {GUIDE_SECTIONS_AFTER_CONFIGURE.map(section => (
                <Card key={section.key}>
                  <h2 className="text-lg font-semibold text-[var(--text)] mb-3">{section.title}</h2>
                  <GuideText>{guide[section.key]}</GuideText>
                </Card>
              ))}
            </>
          ) : customPassport ? (
            <>
              <Card>
                <h2 className="text-lg font-semibold text-[var(--text)] mb-3">Назначение</h2>
                <GuideText>{String(customPassport.purpose || block.description)}</GuideText>
              </Card>
              <Card>
                <h2 className="text-lg font-semibold text-[var(--text)] mb-3">
                  Когда использовать
                </h2>
                <GuideText>
                  {String(customPassport.when_to_use || 'Автор не добавил отдельную рекомендацию.')}
                </GuideText>
              </Card>
              <Card>
                <h2 className="text-lg font-semibold text-[var(--text)] mb-3">
                  Пользовательская инструкция · версия {block.version}
                </h2>
                <GuideText>{customGuide || 'Инструкция отсутствует.'}</GuideText>
              </Card>
              <Card>
                <h2 className="text-lg font-semibold text-[var(--text)] mb-3">
                  Ограничения и примеры
                </h2>
                <ul className="list-disc pl-5 text-sm text-[var(--text-muted)]">
                  {((customPassport.limitations as string[]) || []).map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <h3 className="mt-4 font-medium">Примеры</h3>
                <ul className="mt-2 list-disc pl-5 text-sm text-[var(--text-muted)]">
                  {((customPassport.examples as string[]) || []).map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Card>
            </>
          ) : (
            <Card>
              <p className="text-[var(--text-muted)]">
                Подробная инструкция пока не подготовлена. Основные параметры доступны справа.
              </p>
            </Card>
          )}
        </div>

        <aside className="space-y-5">
          <Card>
            <h2 className="font-semibold text-[var(--text)] mb-3">Основные параметры</h2>
            {block.configSchema.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Настройка не требуется.</p>
            ) : (
              <ul className="space-y-3">
                {block.configSchema.map(field => (
                  <li
                    key={field.name}
                    className="border-b border-[var(--border)] pb-3 last:border-0 last:pb-0"
                  >
                    <p className="text-sm font-medium text-[var(--text)]">
                      {blockFieldDisplayLabel(block.id, field)}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {blockFieldTypeLabel(field.type)} ·{' '}
                      {field.required ? 'обязательный параметр' : 'необязательный параметр'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {guide ? (
            <Card>
              <h2 className="font-semibold text-[var(--text)] mb-3">Перед использованием</h2>
              <ul className="list-disc pl-5 space-y-2 text-sm text-[var(--text-muted)]">
                {guide.checklist.map(item => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </aside>
      </div>
    </DashboardPage>
  );
}
