import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchBlocksLearnCatalog } from '../../api/blocks';
import type { BlockCatalogItem } from '../../types/blocks';
import { SIMULATOR_SUPPORTED_BLOCK_IDS } from '../../constants/simulatorSupportedBlocks';
import {
  BLOCK_GUIDE_RU,
  GUIDE_SECTIONS_AFTER_CONFIGURE,
  GUIDE_SECTIONS_BEFORE_CONFIGURE,
  LEARNING_BLOCK_TEASER,
  LEARNING_BLOCK_TITLE,
} from './blockGuideRu';
import { LEARN_CATALOG_FALLBACK } from './learnCatalogFallback';
import CrmPublicTab from './CrmPublicTab';
import PageShell from '../../ui/PageShell';

type TabId = 'overview' | 'learning' | 'crm' | 'blocks' | 'videos' | 'policy';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Обзор' },
  { id: 'learning', label: 'Обучение' },
  { id: 'crm', label: 'CRM' },
  { id: 'blocks', label: 'Блоки редактора' },
  { id: 'videos', label: 'Видеоуроки' },
  { id: 'policy', label: 'Политика' },
];

const CATEGORY_LABELS: Record<BlockCatalogItem['category'], string> = {
  basic: 'Базовые',
  business: 'Бизнес',
  service: 'Сервисы и связь',
  system: 'Системные',
  ai: 'ИИ',
  custom: 'Расширения',
};

function formatConfigureLines(
  block: BlockCatalogItem,
  hints?: Record<string, string>
): { main: string[]; advanced: string[] } {
  const main: string[] = [];
  const advanced: string[] = [];
  const actionAllowedFields = new Set([
    'mode',
    'tagAction',
    'statusAction',
    'fieldAction',
    'tag',
    'status',
    'fieldKey',
    'fieldValue',
  ]);
  const schemaForGuide =
    block.id === 'action'
      ? block.configSchema.filter(f => actionAllowedFields.has(f.name))
      : block.configSchema;

  for (const f of schemaForGuide) {
    const label = hints?.[f.name] ?? f.label;
    const line = `${label}${f.required ? ' — обязательное поле' : ' — необязательное поле'}`;
    if (f.isAdvanced) advanced.push(line);
    else main.push(line);
  }
  return { main, advanced };
}

function renderGuideText(text: string): React.ReactNode {
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul
        key={`list-${key++}`}
        className="text-sm text-[var(--text-muted)] list-disc pl-5 space-y-1"
      >
        {listItems.map((item, idx) => (
          <li key={idx}>{item}</li>
        ))}
      </ul>
    );
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      blocks.push(<div key={`sp-${key++}`} className="h-2" />);
      continue;
    }
    if (line.startsWith('- ')) {
      listItems.push(line.slice(2));
      continue;
    }
    flushList();
    const isSubsectionTitle =
      line.endsWith(':') ||
      line === 'Основные поля' ||
      line === 'Как работают переменные' ||
      line === 'Чем отличается от блока «Переменная»' ||
      line === 'Важно';
    blocks.push(
      <p
        key={`p-${key++}`}
        className={`text-sm leading-relaxed ${isSubsectionTitle ? 'font-medium text-[var(--text)]' : 'text-[var(--text-muted)]'}`}
      >
        {line}
      </p>
    );
  }
  flushList();
  return <div className="space-y-1">{blocks}</div>;
}

function BlockCardInnerContent({ block }: { block: BlockCatalogItem }) {
  const guide = BLOCK_GUIDE_RU[block.id];
  const hints = guide?.friendlyFieldHints;
  const { main, advanced } = formatConfigureLines(block, hints);

  if (!guide) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Текст для этого блока не найден в справочнике. Откройте настройки блока в редакторе
        сценария.
      </p>
    );
  }

  return (
    <>
      {GUIDE_SECTIONS_BEFORE_CONFIGURE.map(({ title, key }) => (
        <section key={key}>
          <h4 className="text-sm font-medium text-[var(--accent)] mb-1">{title}</h4>
          <div className="mt-2">{renderGuideText(guide[key])}</div>
        </section>
      ))}
      <section>
        <h4 className="text-sm font-medium text-[var(--accent)] mb-1">Что нужно настроить</h4>
        <div className="mt-2 mb-3">{renderGuideText(guide.whatToConfigure)}</div>
        {main.length === 0 && advanced.length === 0 ? null : (
          <>
            <ul className="text-sm text-[var(--text-muted)] list-disc pl-5 space-y-1">
              {main.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            {advanced.length > 0 && (
              <p className="text-xs text-[var(--text-muted)] mt-2 opacity-90">
                Расширенные настройки блока: {advanced.join(' · ')}
              </p>
            )}
          </>
        )}
      </section>
      {GUIDE_SECTIONS_AFTER_CONFIGURE.map(({ title, key }) => (
        <section key={key}>
          <h4 className="text-sm font-medium text-[var(--accent)] mb-1">{title}</h4>
          <div className="mt-2">{renderGuideText(guide[key])}</div>
        </section>
      ))}
      <section>
        <h4 className="text-sm font-medium text-[var(--accent)] mb-1">Чек-лист</h4>
        <ul className="text-sm text-[var(--text-muted)] list-disc pl-5 space-y-1">
          {guide.checklist.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>
    </>
  );
}

function BlockCard({
  block,
  expanded,
  onExpand,
  onCollapse,
}: {
  block: BlockCatalogItem;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
}) {
  const displayTitle = LEARNING_BLOCK_TITLE[block.id] || block.title;
  const editorTitle = block.id === 'action' ? displayTitle : block.title;
  const editorCategory = block.id === 'action' ? 'Системные' : CATEGORY_LABELS[block.category];
  const cardIcon = block.id === 'action' ? '👤' : block.icon;
  const teaser =
    LEARNING_BLOCK_TEASER[block.id] ?? block.description ?? 'Краткое описание появится позже.';

  return (
    <article
      aria-expanded={expanded}
      className="rounded-xl border text-left overflow-hidden transition-[box-shadow] duration-300 ease-out"
      style={{
        borderColor: 'var(--border)',
        backgroundColor: 'var(--card)',
        boxShadow: expanded
          ? '0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent)'
          : undefined,
      }}
    >
      <div className="p-5 pb-4">
        <div className="flex flex-wrap items-start gap-3 gap-y-2">
          <span className="text-2xl shrink-0" aria-hidden>
            {cardIcon}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-lg font-semibold text-[var(--text)] leading-snug">
                {displayTitle}
              </h3>
              <ChevronDown
                className="shrink-0 w-5 h-5 text-[var(--text-muted)] transition-transform duration-300 mt-0.5"
                style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                aria-hidden
              />
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              В редакторе: «{editorTitle}» · {editorCategory}
            </p>
            {!expanded && (
              <p className="text-sm text-[var(--text-muted)] leading-relaxed line-clamp-2">
                {teaser}
              </p>
            )}
            {!expanded && (
              <button
                type="button"
                onClick={onExpand}
                aria-expanded="false"
                className="mt-1 inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
              >
                Открыть инструкцию
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className="px-5 pb-5 pt-0 space-y-4 border-t"
            style={{ borderColor: 'var(--border)' }}
          >
            <div className="pt-4">
              <BlockCardInnerContent block={block} />
            </div>
            <button
              type="button"
              onClick={onCollapse}
              className="text-sm font-medium text-[var(--accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded"
            >
              Свернуть
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

const ALLOWED_BLOCK_IDS = new Set<string>(SIMULATOR_SUPPORTED_BLOCK_IDS);
const BLOCK_SORT_ORDER = [...SIMULATOR_SUPPORTED_BLOCK_IDS];

export default function FeaturesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = (searchParams.get('tab') || '') as TabId;
  const initialTab: TabId = ['overview', 'learning', 'crm', 'blocks', 'videos', 'policy'].includes(
    tabFromUrl
  )
    ? tabFromUrl
    : 'overview';

  const [tab, setTab] = useState<TabId>(initialTab);
  const [blocks, setBlocks] = useState<BlockCatalogItem[]>(LEARN_CATALOG_FALLBACK);
  /** Показывать мягкое предупреждение: данные с сервера не подтянулись или ответ пустой */
  const [learnCatalogOffline, setLearnCatalogOffline] = useState(false);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  /** Аккордеон: одновременно развёрнут только один блок */
  const [expandedBlockId, setExpandedBlockId] = useState<string | null>(null);

  useEffect(() => {
    const t = (searchParams.get('tab') || '') as TabId;
    if (['overview', 'learning', 'crm', 'blocks', 'videos', 'policy'].includes(t)) {
      setTab(t);
    }
  }, [searchParams]);

  const setTabAndUrl = (id: TabId) => {
    setTab(id);
    if (id === 'overview') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: id }, { replace: true });
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const baseById = new Map(LEARN_CATALOG_FALLBACK.map(b => [b.id, b]));
      let fromApi: BlockCatalogItem[] = [];
      let apiOk = false;

      try {
        fromApi = await fetchBlocksLearnCatalog();
        apiOk = Array.isArray(fromApi) && fromApi.length > 0;
      } catch {
        apiOk = false;
      }

      if (cancelled) return;

      if (apiOk) {
        for (const b of fromApi) {
          if (ALLOWED_BLOCK_IDS.has(b.id)) {
            baseById.set(b.id, b);
          }
        }
        setLearnCatalogOffline(false);
      } else {
        setLearnCatalogOffline(true);
      }

      const merged = BLOCK_SORT_ORDER.map(id => baseById.get(id)).filter(
        (b): b is BlockCatalogItem => b != null
      );
      setBlocks(merged.length > 0 ? merged : [...LEARN_CATALOG_FALLBACK]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const supportedBlocks = useMemo(() => {
    const list = blocks.filter(b => ALLOWED_BLOCK_IDS.has(b.id));
    return [...list].sort(
      (a, b) => BLOCK_SORT_ORDER.indexOf(a.id as any) - BLOCK_SORT_ORDER.indexOf(b.id as any)
    );
  }, [blocks]);

  const categoriesInData = useMemo(() => {
    const set = new Set(supportedBlocks.map(b => b.category));
    return Array.from(set).sort();
  }, [supportedBlocks]);

  const filteredBlocks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return supportedBlocks.filter(b => {
      if (categoryFilter !== 'all' && b.category !== categoryFilter) return false;
      if (!q) return true;
      const g = BLOCK_GUIDE_RU[b.id];
      const learnTitle = LEARNING_BLOCK_TITLE[b.id] || '';
      const teaser = LEARNING_BLOCK_TEASER[b.id];
      const hay = [
        b.title,
        learnTitle,
        b.description,
        teaser,
        g?.purpose,
        g?.whenToUse,
        g?.whenNotToUse,
        g?.whatToConfigure,
        g?.limitations,
        g?.howItWorks,
        g?.howPreviewWorks,
        g?.mistakes,
        g?.example,
        g?.checklist?.join(' '),
        CATEGORY_LABELS[b.category],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [supportedBlocks, query, categoryFilter]);

  useEffect(() => {
    if (expandedBlockId != null && !filteredBlocks.some(b => b.id === expandedBlockId)) {
      setExpandedBlockId(null);
    }
  }, [filteredBlocks, expandedBlockId]);

  return (
    <div className="min-h-screen font-sans pb-20" style={{ color: 'var(--text)' }}>
      <div className="max-w-5xl mx-auto px-4 pt-6 md:pt-8">
        <PageShell
          testId="features-page-shell"
          eyebrow="БОТФОРГ"
          title="Возможности платформы"
          subtitle={
            <>
              Как устроен редактор и блоки сценария, отдельный продуктовый обзор{' '}
              <strong style={{ color: 'var(--text)' }}>CRM</strong> по аудитории бота — на одной
              странице, без отдельного сайта документации.
            </>
          }
          tabs={TABS.map(t => ({ id: t.id, label: t.label, testId: `features-tab-${t.id}` }))}
          activeTabId={tab}
          onTabChange={id => setTabAndUrl(id as TabId)}
          tabsAriaLabel="Разделы возможностей"
          tabsTestId="features-tablist"
        >
          {tab === 'overview' && (
            <div className="space-y-6 text-[var(--text-muted)] max-w-3xl">
              <p className="leading-relaxed">
                Редактор «БотФорг» — это схема из блоков и стрелок. Каждый блок — один шаг для бота:
                отправить текст, задать вопрос, проверить ответ, перейти в другой сценарий и т.д.
                Сценарий всегда начинается с блока «Начало»; дальше пользователь идёт по цепочке,
                пока есть куда идти.
              </p>
              <p className="leading-relaxed">
                Вы перетаскиваете блоки из библиотеки, соединяете выходы стрелками и заполняете поля
                в боковой панели. Предпросмотр помогает пройти диалог так, как его увидит клиент.
              </p>
              <div className="flex flex-wrap gap-3 items-center">
                <Link
                  to="/editor"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-black transition hover:opacity-90"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  Открыть редактор
                </Link>
                <button
                  type="button"
                  onClick={() => setTabAndUrl('crm')}
                  className="text-sm text-[var(--accent)] hover:underline font-medium"
                >
                  CRM по аудитории бота →
                </button>
                <button
                  type="button"
                  onClick={() => setTabAndUrl('blocks')}
                  className="text-sm text-[var(--accent)] hover:underline font-medium"
                >
                  Справка по блокам →
                </button>
              </div>
            </div>
          )}

          {tab === 'crm' && <CrmPublicTab />}

          {tab === 'learning' && (
            <div className="space-y-8 text-[var(--text-muted)] max-w-3xl">
              <section>
                <h2 className="text-xl font-semibold text-[var(--text)] mb-3">
                  Как собрать первый сценарий
                </h2>
                <ol className="list-decimal pl-5 space-y-3 leading-relaxed">
                  <li>
                    Создайте сценарий и поместите блок «Начало». От него протяните стрелку к блоку
                    «Сообщение».
                  </li>
                  <li>
                    В сообщении напишите короткий текст приветствия. При необходимости добавьте
                    кнопки — от каждой кнопки должна уходить своя стрелка к следующему шагу.
                  </li>
                  <li>
                    Если нужна развилка, поставьте блок «Выбор» и заранее подготовьте значение
                    (после кнопки, блока «Ввод» или данных пользователя), по которому будет
                    выбираться ветка.
                  </li>
                  <li>
                    Длинные ветки удобно выносить в отдельный сценарий и соединять блоком «Перейти в
                    сценарий».
                  </li>
                  <li>Сохраните сценарий и проверьте цепочку в предпросмотре.</li>
                </ol>
                <p className="mt-4">
                  <button
                    type="button"
                    onClick={() => setTabAndUrl('blocks')}
                    className="text-[var(--accent)] hover:underline font-medium text-base"
                  >
                    Открыть справку по всем блокам →
                  </button>
                </p>
              </section>
              <section>
                <h2 className="text-xl font-semibold text-[var(--text)] mb-3">Полезные привычки</h2>
                <ul className="list-disc pl-5 space-y-2 leading-relaxed">
                  <li>Один сценарий — одна понятная цель (заказ, запись, поддержка).</li>
                  <li>
                    Не оставляйте «висячих» стрелок: у каждого шага должен быть понятный выход.
                  </li>
                  <li>Одинаковые имена переменных во всех блоках, где вы их читаете и пишете.</li>
                </ul>
              </section>
            </div>
          )}

          {tab === 'blocks' && (
            <div className="space-y-6">
              <section
                className="max-w-3xl space-y-4 text-[var(--text-muted)]"
                aria-labelledby="blocks-editor-intro"
              >
                <h2 id="blocks-editor-intro" className="text-xl font-semibold text-[var(--text)]">
                  Сценарий чат-бота и блоки в редакторе «БотФорг»
                </h2>
                <p className="text-sm leading-relaxed">
                  Сценарий чат-бота — это цепочка шагов, по которой бот ведёт человека в чате. В
                  конструкторе чат-ботов «БотФорг» каждый шаг — отдельный блок: отправить сообщение,
                  запросить ответ, сделать паузу, сделать выбор по значению или перейти в другой
                  сценарий. Так на схеме в редакторе сценариев складывается логика чат-бота без
                  кода, и с первого взгляда понятно, как работает бот от входа пользователя до цели.
                </p>
                <p className="text-sm leading-relaxed">
                  Ниже — справка по блокам чат-бота, которые доступны в редакторе и ведут себя
                  предсказуемо в предпросмотре. Раздел поможет при создании чат-бота без
                  программирования: что делает шаг, когда его выбирать и какие ошибки чаще всего
                  встречаются.
                </p>
                <p
                  className="text-sm leading-relaxed rounded-lg border px-4 py-3"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
                >
                  Подробные поля и настройки могут отличаться в зависимости от версии редактора и
                  загружаются из каталога блоков автоматически. Если в карточке нет списка полей —
                  откройте блок в редакторе: там видны актуальные подписи и обязательность.
                </p>
              </section>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <label className="flex-1 max-w-md">
                  <span className="sr-only">Поиск по блокам</span>
                  <input
                    type="search"
                    placeholder="Поиск по названию и подсказкам…"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)]"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderColor: 'var(--border)',
                    }}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <span className="whitespace-nowrap">Категория</span>
                  <select
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                    className="rounded-lg border px-3 py-2.5 text-[var(--text)] min-w-[11rem]"
                    style={{
                      backgroundColor: 'var(--surface)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    <option value="all">Все</option>
                    {categoriesInData.map(c => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {learnCatalogOffline && (
                <div
                  className="rounded-lg border px-4 py-3 text-sm leading-relaxed"
                  style={{
                    borderColor: 'rgba(245, 158, 11, 0.45)',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    color: 'var(--text)',
                  }}
                  role="status"
                >
                  Не удалось загрузить данные с сервера. Показаны базовые блоки и тексты справки —
                  без них тоже можно работать. Чтобы в карточках появился полный список полей из
                  каталога, подключите серверную часть приложения с актуальным каталогом или укажите
                  в настройках сборки адрес этой службы.
                </div>
              )}

              <div className="max-h-[calc(100vh-12rem)] overflow-y-auto pr-1 space-y-4 custom-scroll">
                {filteredBlocks.length === 0 && (
                  <p className="text-[var(--text-muted)]">
                    Ничего не найдено — измените поиск или фильтр.
                  </p>
                )}
                {filteredBlocks.map(block => (
                  <BlockCard
                    key={block.id}
                    block={block}
                    expanded={expandedBlockId === block.id}
                    onExpand={() => setExpandedBlockId(block.id)}
                    onCollapse={() =>
                      setExpandedBlockId(current => (current === block.id ? null : current))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {tab === 'videos' && (
            <div
              className="rounded-xl border p-8 text-center max-w-xl mx-auto"
              style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
            >
              <p className="text-[var(--text-muted)] leading-relaxed">
                Видеоуроки по редактору и сценариям мы готовим. Загляните сюда позже или начните с
                вкладок «Обзор», «Обучение» и «Блоки редактора» — там уже есть пошаговые текстовые
                материалы.
              </p>
            </div>
          )}

          {tab === 'policy' && (
            <div className="space-y-6 text-[var(--text-muted)] max-w-3xl">
              <p className="leading-relaxed">
                Официальные документы размещены по постоянным адресам. Ознакомьтесь с ними перед
                запуском бота для клиентов.
              </p>
              <ul className="space-y-3">
                <li>
                  <a
                    href="/legal/doc/privacy_policy"
                    className="text-[var(--accent)] hover:underline font-medium"
                  >
                    Политика конфиденциальности
                  </a>
                </li>
                <li>
                  <a
                    href="/legal/doc/terms"
                    className="text-[var(--accent)] hover:underline font-medium"
                  >
                    Пользовательское соглашение
                  </a>
                </li>
              </ul>
            </div>
          )}
        </PageShell>
      </div>

      <style>{`
        .custom-scroll {
          scrollbar-color: var(--border) transparent;
          scrollbar-width: thin;
        }
        .block-doc-md {
          font-size: 0.875rem;
          line-height: 1.65;
          color: var(--text-muted);
        }
        .block-doc-md h1 {
          font-size: 1.375rem;
          font-weight: 700;
          color: var(--text);
          margin: 0.25rem 0 0.75rem;
          line-height: 1.3;
        }
        .block-doc-md h2 {
          font-size: 1.05rem;
          font-weight: 600;
          color: var(--text);
          margin: 1.15rem 0 0.5rem;
        }
        .block-doc-md h3 {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text);
          margin: 1rem 0 0.35rem;
        }
        .block-doc-md h4 {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text);
          margin: 0.85rem 0 0.3rem;
        }
        .block-doc-md p {
          margin: 0.4rem 0;
        }
        .block-doc-md ul {
          list-style: disc;
          padding-left: 1.25rem;
          margin: 0.35rem 0 0.5rem;
        }
        .block-doc-md li {
          margin: 0.2rem 0;
        }
        .block-doc-md hr {
          border: none;
          border-top: 1px solid var(--border);
          margin: 0.85rem 0;
        }
        .block-doc-md a {
          color: var(--accent);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .block-doc-md strong {
          color: var(--text);
          font-weight: 600;
        }
        .block-doc-md em {
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
