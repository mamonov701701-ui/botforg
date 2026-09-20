import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  ArrowRight,
  BookOpen,
  CopyPlus,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Workflow,
} from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import { useUserBlockCatalog } from '../blockLibrary/useUserBlockCatalog';
import {
  BLOCK_CATEGORY_LABELS,
  blockDisplayTitle,
  blockFieldDisplayLabel,
  blockSummary,
} from '../../../utils/blockCatalogPresentation';
import type { CustomBlockVersion } from '../../../types/blocks';
import {
  archiveCustomBlock,
  createCustomBlockVersion,
  deleteCustomBlockDraft,
  fetchMyCustomBlocks,
  publishCustomBlock,
  restoreCustomBlock,
  validateCustomBlock,
} from '../../../api/blocks';
import { useNavigate } from 'react-router-dom';

export default function BlockLibraryPage() {
  const { blocks, loading, error, reload } = useUserBlockCatalog();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [mine, setMine] = useState<CustomBlockVersion[]>([]);
  const [actionMessage, setActionMessage] = useState('');
  const navigate = useNavigate();
  const loadMine = () =>
    fetchMyCustomBlocks()
      .then(setMine)
      .catch(() => setMine([]));
  useEffect(() => {
    void loadMine();
  }, []);
  const act = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setActionMessage('Действие выполнено.');
      await Promise.all([loadMine(), reload()]);
    } catch (error: any) {
      setActionMessage(error?.message || 'Не удалось выполнить действие.');
    }
  };

  const categories = useMemo(
    () => Array.from(new Set(blocks.map(block => block.category))).sort(),
    [blocks]
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru-RU');
    return blocks.filter(block => {
      if (category !== 'all' && block.category !== category) return false;
      if (!needle) return true;
      return [blockDisplayTitle(block), blockSummary(block), block.description]
        .join(' ')
        .toLocaleLowerCase('ru-RU')
        .includes(needle);
    });
  }, [blocks, category, query]);

  return (
    <DashboardPage
      title="Библиотека блоков"
      subtitle="Познакомьтесь с шагами сценария, их настройками и примерами использования."
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--text)]"
            to="/dashboard/block-library/guide/create"
          >
            <BookOpen size={17} />
            Как создать блок
          </Link>
          <Link
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--text)]"
            to="/dashboard/block-library/create"
            data-testid="create-custom-block"
          >
            <Plus size={17} />
            Создать свой блок
          </Link>
          <Link
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[#0A1B3D]"
            to="/editor"
            data-testid="blocks-open-editor"
          >
            <Workflow size={17} />
            Открыть в редакторе
          </Link>
        </div>
      }
    >
      <section className="mb-8" data-testid="my-custom-blocks">
        <h2 className="mb-3 text-xl font-semibold text-[var(--text)]">Мои блоки</h2>
        {mine.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--text-muted)]">
              У вас пока нет своих блоков. Мастер поможет создать первый безопасный черновик.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {mine.map(item => (
              <Card key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Версия {item.version} · изменён{' '}
                      {new Date(item.updated_at).toLocaleDateString('ru-RU')}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${item.status === 'published' ? 'bg-emerald-500/15 text-emerald-400' : item.status === 'archived' ? 'bg-slate-500/15 text-slate-300' : 'bg-amber-500/15 text-amber-400'}`}
                  >
                    {item.status_label}
                  </span>
                </div>
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  {item.description || 'Описание пока не заполнено.'}
                </p>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  Использований: {item.usage_count} · Инструкция:{' '}
                  {item.user_guide?.content ? 'есть' : 'нет'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    to={`/dashboard/block-library/custom/${item.id}`}
                    className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <BookOpen size={14} /> Просмотреть
                  </Link>
                  {item.status === 'draft' ? (
                    <>
                      <Link
                        to={`/dashboard/block-library/custom/${item.id}/edit`}
                        className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        <Pencil size={14} /> Редактировать
                      </Link>
                      <button
                        onClick={() =>
                          void validateCustomBlock(item.id).then(result =>
                            setActionMessage(
                              result.valid
                                ? 'Блок прошёл проверку.'
                                : `Найдены ошибки: ${result.errors.join('; ')}`
                            )
                          )
                        }
                        className="rounded border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        Проверить
                      </button>
                      <button
                        onClick={() => void act(() => publishCustomBlock(item.id))}
                        className="rounded border border-[var(--accent)] px-3 py-2 text-sm"
                      >
                        Опубликовать
                      </button>
                      <button
                        onClick={() => void act(() => deleteCustomBlockDraft(item.id))}
                        className="inline-flex items-center gap-1 rounded border border-red-500/40 px-3 py-2 text-sm text-red-400"
                      >
                        <Trash2 size={14} /> Удалить
                      </button>
                    </>
                  ) : null}
                  {item.status === 'published' ? (
                    <>
                      <button
                        onClick={() =>
                          void createCustomBlockVersion(item.id).then(next =>
                            navigate(`/dashboard/block-library/custom/${next.id}/edit`)
                          )
                        }
                        className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        <CopyPlus size={14} /> Создать новую версию
                      </button>
                      <button
                        onClick={() => void act(() => archiveCustomBlock(item.id))}
                        className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        <Archive size={14} /> Архивировать
                      </button>
                    </>
                  ) : null}
                  {item.status === 'archived' ? (
                    <button
                      onClick={() => void act(() => restoreCustomBlock(item.id))}
                      className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      <RotateCcw size={14} /> Восстановить
                    </button>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
      {actionMessage ? (
        <p role="status" className="mb-4 text-sm text-[var(--text-muted)]">
          {actionMessage}
        </p>
      ) : null}

      <h2 className="mb-3 text-xl font-semibold text-[var(--text)]">
        Системные и опубликованные блоки
      </h2>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_240px] mb-6">
        <label className="relative block">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          />
          <span className="sr-only">Поиск блоков</span>
          <input
            data-testid="blocks-search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-3 pl-10 pr-3 text-[var(--text)]"
            placeholder="Найти блок по названию или назначению"
          />
        </label>
        <label>
          <span className="sr-only">Категория блоков</span>
          <select
            data-testid="blocks-category"
            value={category}
            onChange={event => setCategory(event.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-[var(--text)]"
          >
            <option value="all">Все категории</option>
            {categories.map(value => (
              <option key={value} value={value}>
                {BLOCK_CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <p className="text-[var(--text-muted)]">Загружаем доступные блоки…</p> : null}
      {error ? (
        <Card>
          <p role="alert" className="text-red-400">
            {error}
          </p>
        </Card>
      ) : null}
      {!loading && !error && filtered.length === 0 ? (
        <Card>
          <p className="text-[var(--text)] font-medium">Подходящие блоки не найдены</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">Измените запрос или категорию.</p>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="blocks-catalog">
        {filtered.map(block => (
          <Card key={block.id} padding="20px" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="flex items-start gap-3">
              <span className="text-3xl" aria-hidden>
                {block.icon}
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-[var(--text)]">
                  {blockDisplayTitle(block)}
                </h2>
                <p className="text-xs text-[var(--accent)] mt-1">
                  {BLOCK_CATEGORY_LABELS[block.category]}
                </p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-[var(--text-muted)] mt-4 flex-1">
              {blockSummary(block)}
            </p>
            {block.configSchema.length > 0 ? (
              <p className="text-xs text-[var(--text-muted)] mt-4">
                Основные параметры:{' '}
                {block.configSchema
                  .slice(0, 3)
                  .map(field => blockFieldDisplayLabel(block.id, field))
                  .join(' · ')}
              </p>
            ) : (
              <p className="text-xs text-[var(--text-muted)] mt-4">
                Дополнительная настройка не требуется
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-5">
              <Link
                to={`/dashboard/block-library/${block.id}`}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:border-[var(--accent)]"
                data-testid={`block-details-${block.id}`}
              >
                <BookOpen size={16} /> Подробнее
              </Link>
              <Link
                to="/editor"
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-[#0A1B3D]"
              >
                Открыть в редакторе <ArrowRight size={15} />
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </DashboardPage>
  );
}
