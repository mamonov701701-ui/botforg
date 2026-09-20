import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ChevronDown,
  ChevronUp,
  CopyPlus,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
} from 'lucide-react';
import {
  archiveCustomBlock,
  createCustomBlockVersion,
  deleteCustomBlockDraft,
  fetchAdminBlocksCatalog,
  fetchAllCustomBlocksAdmin,
  publishCustomBlock,
  restoreCustomBlock,
  validateCustomBlock,
} from '../../../api/blocks';
import type { BlockCatalogItem, CustomBlockVersion } from '../../../types/blocks';
import { BLOCK_GUIDE_RU } from '../../../pages/features/blockGuideRu';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import {
  BLOCK_CATEGORY_LABELS,
  blockContractClassification,
  blockContractSummary,
  blockDisplayTitle,
  blockHasGuide,
} from '../../../utils/blockCatalogPresentation';
import { Link, useNavigate } from 'react-router-dom';

export default function PlatformBlocksPage() {
  const [blocks, setBlocks] = useState<BlockCatalogItem[]>([]);
  const [customBlocks, setCustomBlocks] = useState<CustomBlockVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [customNotice, setCustomNotice] = useState('');
  const mountedRef = useRef(true);
  const navigate = useNavigate();
  const load = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const [items, custom] = await Promise.all([
        fetchAdminBlocksCatalog(),
        fetchAllCustomBlocksAdmin(),
      ]);
      if (mountedRef.current) {
        setBlocks(items);
        setCustomBlocks(custom);
      }
    } catch (requestError: any) {
      if (mountedRef.current)
        setError(
          requestError?.status === 403
            ? 'Недостаточно прав для управления каталогом блоков.'
            : 'Не удалось загрузить каталог блоков.'
        );
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);
  const runCustomAction = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      setCustomNotice(success);
      await load();
    } catch (actionError: any) {
      setCustomNotice(actionError?.message || 'Не удалось выполнить действие.');
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru-RU');
    if (!needle) return blocks;
    return blocks.filter(block =>
      [block.id, block.title, block.description, BLOCK_CATEGORY_LABELS[block.category]]
        .join(' ')
        .toLocaleLowerCase('ru-RU')
        .includes(needle)
    );
  }, [blocks, query]);

  return (
    <DashboardPage
      title="Управление блоками"
      subtitle="Read-only представление текущего системного каталога и контрактов блоков."
      actions={
        <div className="flex gap-2">
          <Link
            to="/dashboard/block-library/create"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#0A1B3D]"
          >
            <Plus size={16} /> Создать блок
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text)] hover:border-[var(--accent)]"
          >
            <RefreshCw size={16} /> Обновить
          </button>
        </div>
      }
    >
      <Card padding="16px" style={{ marginBottom: 20 }}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="relative block flex-1 max-w-xl">
            <Search
              size={17}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <span className="sr-only">Поиск в каталоге</span>
            <input
              data-testid="admin-blocks-search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Название, описание или системный код"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] py-2.5 pl-9 pr-3 text-[var(--text)]"
            />
          </label>
          <p className="text-xs text-[var(--text-muted)]">
            Источник: backend/data/editor_blocks.json
          </p>
        </div>
      </Card>

      {loading ? <p className="text-[var(--text-muted)]">Загрузка системного каталога…</p> : null}
      {error ? (
        <Card>
          <p role="alert" className="text-red-400">
            {error}
          </p>
        </Card>
      ) : null}
      {!loading && !error && filtered.length === 0 ? (
        <Card>
          <p>Записи не найдены.</p>
        </Card>
      ) : null}

      <div className="space-y-3" data-testid="admin-blocks-catalog">
        {filtered.map(block => {
          const expanded = expandedId === block.id;
          const guide = BLOCK_GUIDE_RU[block.id];
          return (
            <Card key={block.id} padding="0">
              <div className="grid gap-3 p-4 md:grid-cols-[minmax(220px,1.4fr)_minmax(150px,.8fr)_minmax(170px,1fr)_auto] md:items-center">
                <div className="flex items-start gap-3">
                  <span className="text-2xl" aria-hidden>
                    {block.icon}
                  </span>
                  <div>
                    <h2 className="font-semibold text-[var(--text)]">{blockDisplayTitle(block)}</h2>
                    <p className="text-xs font-mono text-[var(--text-muted)] mt-1">{block.id}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-[var(--text)]">
                    {BLOCK_CATEGORY_LABELS[block.category]}
                  </p>
                  <p
                    className={`text-xs mt-1 ${block.disabled ? 'text-amber-400' : 'text-emerald-400'}`}
                  >
                    {block.disabled ? 'Отключён' : 'Активен'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-[var(--text)]">
                    {blockContractClassification(block.id)}
                  </p>
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {blockHasGuide(block.id) ? 'Инструкция есть' : 'Инструкция отсутствует'}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid={`admin-block-details-${block.id}`}
                  onClick={() => setExpandedId(expanded ? null : block.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)] hover:border-[var(--accent)]"
                >
                  {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {expanded ? 'Скрыть' : 'Подробнее'}
                </button>
              </div>
              {expanded ? (
                <div
                  className="border-t border-[var(--border)] p-4 grid gap-5 lg:grid-cols-2"
                  data-testid={`admin-block-expanded-${block.id}`}
                >
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Описание</h3>
                    <p className="text-sm leading-6 text-[var(--text-muted)]">
                      {block.description}
                    </p>
                    {guide ? (
                      <p className="text-sm leading-6 text-[var(--text-muted)] mt-3 whitespace-pre-line">
                        {guide.purpose}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text)] mb-2">Контракт</h3>
                    <p className="text-sm text-[var(--text-muted)]">
                      {blockContractSummary(block.id)}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-3">
                      Полей конфигурации: {block.configSchema.length}. Доступ по тарифам:{' '}
                      {block.planAccess.join(', ')}.
                    </p>
                  </div>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <Card style={{ marginTop: 20 }}>
        <p className="text-sm text-[var(--text-muted)]">
          Изменение системного JSON из интерфейса намеренно недоступно. Управляемый CRUD появится
          после внедрения Block Passport и Block Registry.
        </p>
      </Card>

      <h2 className="mb-3 mt-8 text-xl font-semibold">Пользовательские блоки</h2>
      {customNotice ? (
        <p role="status" className="mb-3 text-sm text-[var(--text-muted)]">
          {customNotice}
        </p>
      ) : null}
      <div className="space-y-3" data-testid="admin-custom-blocks">
        {customBlocks.length === 0 ? (
          <Card>
            <p>Пользовательских блоков пока нет.</p>
          </Card>
        ) : (
          customBlocks.map(item => (
            <Card key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {item.title}{' '}
                    <span className="text-xs font-normal text-[var(--text-muted)]">
                      ({item.stable_block_id})
                    </span>
                  </h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Автор: пользователь #{item.owner_user_id} · Версия {item.version} ·{' '}
                    {item.status_label}
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Источник: пользовательский · Использований: {item.usage_count} · Паспорт: есть ·
                    Инструкция: {item.user_guide?.content ? 'есть' : 'нет'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.status === 'draft' ? (
                    <>
                      <Link
                        to={`/dashboard/block-library/custom/${item.id}/edit`}
                        className="rounded border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        Редактировать
                      </Link>
                      <button
                        onClick={() =>
                          void validateCustomBlock(item.id).then(result =>
                            setCustomNotice(
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
                        onClick={() =>
                          void runCustomAction(
                            () => publishCustomBlock(item.id),
                            'Блок опубликован.'
                          )
                        }
                        className="rounded border border-[var(--accent)] px-3 py-2 text-sm"
                      >
                        Опубликовать
                      </button>
                      <button
                        onClick={() =>
                          void runCustomAction(
                            () => deleteCustomBlockDraft(item.id),
                            'Черновик удалён.'
                          )
                        }
                        className="rounded border border-red-500/40 px-3 py-2 text-sm text-red-400"
                      >
                        Удалить
                      </button>
                    </>
                  ) : null}
                  {item.status === 'published' ? (
                    <>
                      <button
                        onClick={() =>
                          void createCustomBlockVersion(item.id)
                            .then(next =>
                              navigate(`/dashboard/block-library/custom/${next.id}/edit`)
                            )
                            .catch(error =>
                              setCustomNotice(error?.message || 'Не удалось создать версию.')
                            )
                        }
                        className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        <CopyPlus size={14} /> Новая версия
                      </button>
                      <button
                        onClick={() =>
                          void runCustomAction(
                            () => archiveCustomBlock(item.id),
                            'Версия перемещена в архив.'
                          )
                        }
                        className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        <Archive size={14} /> Архивировать
                      </button>
                    </>
                  ) : null}
                  {item.status === 'archived' ? (
                    <button
                      onClick={() =>
                        void runCustomAction(
                          () => restoreCustomBlock(item.id),
                          'Версия восстановлена.'
                        )
                      }
                      className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      <RotateCcw size={14} /> Восстановить
                    </button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </DashboardPage>
  );
}
