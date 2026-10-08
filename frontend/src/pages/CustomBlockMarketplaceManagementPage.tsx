import PageShell from '../ui/PageShell';
import { MarketManagementCard } from '../components/market/MarketCards';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import {
  approveCustomBlockMarketplaceRequest,
  archiveCustomBlockMarketplaceListing,
  createCustomBlockMarketplaceListing,
  getCustomBlockMarketplaceGrants,
  getCustomBlockMarketplaceReviews,
  getMyCustomBlockMarketplaceListings,
  getMyCustomBlockMarketplaceRequests,
  getMyEligibleCustomBlockVersions,
  grantCustomBlockMarketplaceAccess,
  publishCustomBlockMarketplaceListing,
  grantCustomBlockDistribution,
  rejectCustomBlockMarketplaceRequest,
  restoreCustomBlockMarketplaceListing,
  revokeCustomBlockMarketplaceGrant,
  updateCustomBlockMarketplaceListing,
  type CustomBlockMarketplaceGrant,
  type CustomBlockMarketplaceListing,
  type CustomBlockMarketplaceRequest,
} from '../api/customBlockMarketplace';
import {
  MARKETPLACE_CATEGORIES,
  MARKET_SECTION_TABS,
  marketSectionPath,
  marketplaceCategoryLabel,
  type MarketSectionId,
} from '../constants/marketplaceNavigation';

type Draft = {
  versionId: string;
  title: string;
  description: string;
  category: string;
  commercial_mode: 'free' | 'paid';
  price_amount: string;
  price_currency: string;
};
const emptyDraft = (versionId = ''): Draft => ({
  versionId,
  title: '',
  description: '',
  category: 'other',
  commercial_mode: 'free',
  price_amount: '',
  price_currency: 'RUB',
});
const listingDraft = (listing: CustomBlockMarketplaceListing): Draft => ({
  versionId: String(listing.custom_block_version_id),
  title: listing.title,
  description: listing.description,
  category: MARKETPLACE_CATEGORIES.some(item => item.id === listing.category)
    ? listing.category
    : 'other',
  commercial_mode: listing.commercial_mode === 'paid' ? 'paid' : 'free',
  price_amount: listing.price_amount == null ? '' : String(listing.price_amount),
  price_currency: listing.price_currency || 'RUB',
});
const lifecycleLabel = { draft: 'Черновик', published: 'Опубликовано', archived: 'Архивировано' };
const legacyListing = (listing: CustomBlockMarketplaceListing) =>
  listing.commercial_mode === 'external_terms' ||
  (listing.commercial_mode === 'free' && listing.access_policy !== 'self_install');
const offerLabel = (listing: CustomBlockMarketplaceListing) =>
  legacyListing(listing)
    ? 'Старая модель условий'
    : listing.commercial_mode === 'paid'
      ? `Платно · ${listing.price_amount} ${listing.price_currency}`
      : 'Бесплатно';
const fieldClass =
  'min-h-11 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-[var(--text)]';
const dateLabel = (value: string) =>
  value
    ? new Date(value).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—';

export default function CustomBlockMarketplaceManagementPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialVersionId = useRef(Number(searchParams.get('versionId')) || null);
  const selectedIdRef = useRef<number | null>(Number(searchParams.get('listingId')) || null);
  const loadRequestRef = useRef(0);
  const [listings, setListings] = useState<CustomBlockMarketplaceListing[]>([]);
  const [eligible, setEligible] = useState<{ id: number; title: string; version: number }[]>([]);
  const [requests, setRequests] = useState<CustomBlockMarketplaceRequest[]>([]);
  const [selected, setSelected] = useState<CustomBlockMarketplaceListing | null>(null);
  const [grants, setGrants] = useState<CustomBlockMarketplaceGrant[]>([]);
  const [reviews, setReviews] = useState<
    { id: number; author_name: string; rating: number; text: string }[]
  >([]);
  const [showCreate, setShowCreate] = useState(Boolean(initialVersionId.current));
  const [newDraft, setNewDraft] = useState<Draft>(() =>
    emptyDraft(searchParams.get('versionId') || '')
  );
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [grantRecipientId, setGrantRecipientId] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  const load = async (preferredListingId?: number) => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    setLoadError('');
    try {
      const [nextListings, nextEligible, nextRequests] = await Promise.all([
        getMyCustomBlockMarketplaceListings(),
        getMyEligibleCustomBlockVersions(),
        getMyCustomBlockMarketplaceRequests(),
      ]);
      if (requestId !== loadRequestRef.current) return;
      setListings(nextListings);
      setEligible(nextEligible);
      setRequests(nextRequests);
      const id = preferredListingId ?? selectedIdRef.current;
      const refreshed =
        nextListings.find(item => item.id === id) ||
        (!id && initialVersionId.current
          ? nextListings.find(item => item.custom_block_version_id === initialVersionId.current)
          : null) ||
        null;
      selectedIdRef.current = refreshed?.id ?? null;
      setSelected(refreshed);
      if (refreshed) {
        setDraft(listingDraft(refreshed));
        setShowCreate(false);
      } else if (
        initialVersionId.current &&
        !nextEligible.some(item => item.id === initialVersionId.current)
      ) {
        setNewDraft(emptyDraft());
      }
    } catch (error) {
      if (requestId === loadRequestRef.current)
        setLoadError(
          `Не удалось загрузить данные размещений. ${error instanceof Error ? error.message : ''}`
        );
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!selected) {
      setGrants([]);
      setReviews([]);
      return;
    }
    let cancelled = false;
    setDetailsLoading(true);
    setDetailsError('');
    setGrants([]);
    setReviews([]);
    void Promise.all([
      getCustomBlockMarketplaceGrants(selected.custom_block_version_id),
      getCustomBlockMarketplaceReviews(selected.custom_block_version_id),
    ])
      .then(([nextGrants, nextReviews]) => {
        if (!cancelled) {
          setGrants(nextGrants);
          setReviews(nextReviews);
        }
      })
      .catch(() => {
        if (!cancelled) setDetailsError('Не удалось загрузить выданный доступ или отзывы.');
      })
      .finally(() => {
        if (!cancelled) setDetailsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  const openListing = (listing: CustomBlockMarketplaceListing) => {
    selectedIdRef.current = listing.id;
    setSelected(listing);
    setDraft(listingDraft(listing));
    setShowCreate(false);
    setSearchParams({ listingId: String(listing.id) });
  };
  const backToList = () => {
    selectedIdRef.current = null;
    initialVersionId.current = null;
    setSelected(null);
    setShowCreate(false);
    setSearchParams({});
  };
  const saveNew = async () => {
    if (!newDraft.versionId) return setNotice('Выберите опубликованную версию блока.');
    if (
      newDraft.commercial_mode === 'paid' &&
      (!newDraft.price_amount || Number(newDraft.price_amount) <= 0 || !newDraft.price_currency)
    )
      return setNotice('Укажите фиксированную цену и валюту.');
    try {
      const created = await createCustomBlockMarketplaceListing(Number(newDraft.versionId), {
        title: newDraft.title || null,
        description: newDraft.description || null,
        category: newDraft.category,
        commercial_mode: newDraft.commercial_mode,
        price_amount: newDraft.commercial_mode === 'paid' ? newDraft.price_amount : null,
        price_currency: newDraft.commercial_mode === 'paid' ? newDraft.price_currency : null,
        tags: [],
      });
      setNewDraft(emptyDraft());
      setNotice(
        'Карточка создана как черновик и пока не видна в каталоге. Чтобы разместить её в Маркете, нажмите «Опубликовать».'
      );
      selectedIdRef.current = created.id;
      setSearchParams({ listingId: String(created.id) });
      await load(created.id);
    } catch {
      setNotice('Не удалось создать карточку. Проверьте состояние версии.');
    }
  };
  const saveSelected = async () => {
    if (!selected || legacyListing(selected)) return;
    try {
      await updateCustomBlockMarketplaceListing(selected.id, {
        title: draft.title || null,
        description: draft.description || null,
        category: draft.category,
        commercial_mode: draft.commercial_mode,
        price_amount: draft.commercial_mode === 'paid' ? draft.price_amount : null,
        price_currency: draft.commercial_mode === 'paid' ? draft.price_currency : null,
        tags: selected.tags,
      });
      await load(selected.id);
      setNotice('Карточка сохранена.');
    } catch {
      setNotice('Карточку не удалось сохранить.');
    }
  };
  const changeLifecycle = async (action: (id: number) => Promise<unknown>, success: string) => {
    if (!selected) return;
    try {
      await action(selected.id);
      await load(selected.id);
      setNotice(success);
    } catch {
      setNotice('Не удалось изменить состояние карточки.');
    }
  };
  const decision = async (request: CustomBlockMarketplaceRequest, approve: boolean) => {
    try {
      await (approve
        ? approveCustomBlockMarketplaceRequest(request.id)
        : rejectCustomBlockMarketplaceRequest(request.id));
      await load(selected?.id);
      setNotice(approve ? 'Доступ выдан для точной версии.' : 'Запрос отклонён.');
    } catch {
      setNotice('Не удалось обработать запрос.');
    }
  };
  const grantAccess = async () => {
    if (!selected || !Number.isInteger(Number(grantRecipientId)) || Number(grantRecipientId) <= 0)
      return setNotice('Укажите публичный ID пользователя.');
    try {
      await grantCustomBlockMarketplaceAccess(
        selected.custom_block_version_id,
        Number(grantRecipientId)
      );
      setGrantRecipientId('');
      setGrants(await getCustomBlockMarketplaceGrants(selected.custom_block_version_id));
      setNotice('Доступ выдан для точной версии.');
    } catch {
      setNotice('Не удалось выдать доступ. Проверьте публичный ID пользователя.');
    }
  };
  const grantDistribution = async () => {
    if (!selected || !Number.isInteger(Number(grantRecipientId)) || Number(grantRecipientId) <= 0)
      return setNotice('Укажите публичный ID пользователя.');
    try {
      await grantCustomBlockDistribution(
        selected.custom_block_version_id,
        Number(grantRecipientId)
      );
      setNotice('Право распространения выдано для точной версии.');
    } catch {
      setNotice('Не удалось выдать право распространения. Сначала выдайте право использования.');
    }
  };
  const selectedRequests = requests.filter(row => row.listing_id === selected?.id);

  return (
    <main className="mx-auto max-w-7xl p-4 pb-32 md:px-4 md:pt-8 md:pb-36">
      <PageShell
        testId="market-custom-blocks-management-shell"
        title="Маркет"
        subtitle="Управляйте размещениями кастомных блоков, запросами и выданным доступом"
        tabs={MARKET_SECTION_TABS.map(tab => ({
          id: tab.id,
          label: tab.label,
          testId: `market-tab-${tab.id}`,
        }))}
        activeTabId="custom-blocks"
        onTabChange={id => navigate(marketSectionPath(id as MarketSectionId))}
        tabsAriaLabel="Разделы маркета"
        tabsTestId="market-tablist"
      >
        <nav aria-label="Раздел кастомных блоков" className="mb-5 flex flex-wrap gap-2 text-sm">
          <Link
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--primary)]"
            to="/market/custom-blocks"
          >
            Каталог
          </Link>
          <span
            aria-current="page"
            className="rounded-lg bg-[var(--primary-bg)] px-3 py-2 font-semibold text-[var(--primary)]"
          >
            Мои блоки
          </span>
        </nav>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Мои блоки</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Ваши размещения кастомных блоков в Маркете.
            </p>
          </div>
          {!selected && !showCreate && (
            <button
              type="button"
              className="min-h-11 rounded bf-primary-cta px-4 py-2"
              onClick={() => setShowCreate(true)}
            >
              Разместить блок
            </button>
          )}
        </div>
        {notice && (
          <p role="status" className="mb-4 rounded-lg border border-[var(--border)] p-2 text-sm">
            {notice}
          </p>
        )}
        {loadError && (
          <p role="alert" className="mb-4 text-[var(--error)]">
            {loadError}
          </p>
        )}
        {loading && (
          <p role="status" className="mb-4 text-sm text-[var(--text-muted)]">
            Загрузка размещений…
          </p>
        )}

        {showCreate && !selected && (
          <section className="bf-section-card min-w-0" aria-label="Разместить блок">
            <button
              type="button"
              className="mb-4 text-sm text-[var(--primary)]"
              onClick={backToList}
            >
              ← Мои блоки
            </button>
            <h3 className="text-xl font-semibold">Разместить блок</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Сначала создайте черновик карточки. После создания отдельно нажмите «Опубликовать»,
              чтобы блок появился в каталоге.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block text-sm">
                Блок и версия
                <select
                  aria-label="Блок и версия"
                  aria-describedby={
                    !loading && !loadError && !eligible.length
                      ? 'market-no-eligible-versions'
                      : undefined
                  }
                  disabled={loading || Boolean(loadError) || !eligible.length}
                  className={`mt-1 ${fieldClass} disabled:cursor-not-allowed disabled:opacity-55`}
                  value={newDraft.versionId}
                  onChange={e => setNewDraft({ ...newDraft, versionId: e.target.value })}
                >
                  <option value="">
                    {eligible.length ? 'Выберите версию' : 'Нет доступных версий'}
                  </option>
                  {eligible.map(version => (
                    <option key={version.id} value={version.id}>
                      {version.title} · v{version.version}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Название
                <input
                  className={`mt-1 ${fieldClass}`}
                  placeholder="Название (необязательно)"
                  value={newDraft.title}
                  onChange={e => setNewDraft({ ...newDraft, title: e.target.value })}
                />
              </label>
              <label className="block text-sm md:col-span-2">
                Описание
                <textarea
                  className={`mt-1 ${fieldClass}`}
                  placeholder="Описание"
                  value={newDraft.description}
                  onChange={e => setNewDraft({ ...newDraft, description: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Категория
                <select
                  aria-label="Категория нового размещения"
                  className={`mt-1 ${fieldClass}`}
                  value={newDraft.category}
                  onChange={e => setNewDraft({ ...newDraft, category: e.target.value })}
                >
                  {MARKETPLACE_CATEGORIES.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Вариант размещения
                <select
                  className={`mt-1 ${fieldClass}`}
                  value={newDraft.commercial_mode}
                  onChange={e =>
                    setNewDraft({ ...newDraft, commercial_mode: e.target.value as 'free' | 'paid' })
                  }
                >
                  <option value="free">Бесплатно</option>
                  <option value="paid">Платно</option>
                </select>
              </label>
              {newDraft.commercial_mode === 'paid' && (
                <>
                  <label className="block text-sm">
                    Фиксированная цена
                    <input
                      aria-label="Цена нового размещения"
                      type="number"
                      min="0.01"
                      step="0.01"
                      className={`mt-1 ${fieldClass}`}
                      value={newDraft.price_amount}
                      onChange={e => setNewDraft({ ...newDraft, price_amount: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    Валюта
                    <input
                      aria-label="Валюта нового размещения"
                      maxLength={3}
                      className={`mt-1 ${fieldClass}`}
                      value={newDraft.price_currency}
                      onChange={e =>
                        setNewDraft({ ...newDraft, price_currency: e.target.value.toUpperCase() })
                      }
                    />
                  </label>
                </>
              )}
            </div>
            {!loading && !loadError && !eligible.length && (
              <div
                id="market-no-eligible-versions"
                role="alert"
                className="mt-3 rounded-lg border border-[var(--error-border)] bg-[var(--bf-section-bg)] p-4 text-sm"
              >
                <div className="flex items-center gap-2 text-[var(--error)]">
                  <AlertCircle size={18} aria-hidden="true" />
                  <h4 className="font-semibold">Нет доступных версий для размещения</h4>
                </div>
                <p className="mt-2 text-[var(--text)]">
                  Все ваши опубликованные версии уже размещены в Маркете. Создайте новую версию
                  блока или откройте существующее размещение.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link
                    to="/dashboard/block-library"
                    className="min-h-11 inline-flex items-center text-[var(--primary)] underline"
                  >
                    Перейти в Библиотеку блоков
                  </Link>
                  <button
                    type="button"
                    className="min-h-11 text-[var(--primary)] underline"
                    onClick={backToList}
                  >
                    Мои размещения
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              className="mt-4 min-h-11 rounded bf-primary-cta px-4 py-2"
              disabled={
                loading ||
                Boolean(loadError) ||
                !eligible.some(version => String(version.id) === newDraft.versionId)
              }
              onClick={() => void saveNew()}
            >
              Создать черновик карточки
            </button>
          </section>
        )}

        {!showCreate && !selected && (
          <section aria-label="Список моих блоков" className="bf-market-management-grid">
            {listings.map(listing => (
              <MarketManagementCard
                key={listing.id}
                kind="custom-block"
                title={listing.title}
                testId="custom-block-management-card"
                action={
                  <button
                    type="button"
                    className="bf-primary-cta"
                    onClick={() => openListing(listing)}
                  >
                    Управлять
                  </button>
                }
              >
                <p>Связанный блок: {listing.block_title}</p>
                <p>Точная версия: v{listing.version}</p>
                <p>
                  {marketplaceCategoryLabel(listing.category)} · {lifecycleLabel[listing.lifecycle]}
                </p>
                <p>{offerLabel(listing)}</p>
                <p>Создано: {dateLabel(listing.created_at)}</p>
              </MarketManagementCard>
            ))}
            {!loading && !loadError && !listings.length && (
              <p className="text-[var(--text-muted)]">Размещений пока нет.</p>
            )}
          </section>
        )}

        {selected && (
          <>
            <button
              type="button"
              className="mb-4 text-sm text-[var(--primary)]"
              onClick={backToList}
            >
              ← Мои блоки
            </button>
            <section className="bf-section-card min-w-0" aria-label="Управление карточкой">
              <h3 className="text-xl font-semibold">
                {selected.title} · v{selected.version}
              </h3>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Связанный блок: {selected.block_title} · Точная версия: v{selected.version}
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {lifecycleLabel[selected.lifecycle]} · Создано: {dateLabel(selected.created_at)}
              </p>
              {selected.lifecycle === 'draft' && (
                <p className="mt-3 rounded-lg border border-[var(--border)] p-3 text-sm">
                  Карточка пока не видна в каталоге. Чтобы разместить её в Маркете, нажмите
                  «Опубликовать» ниже.
                </p>
              )}
              {legacyListing(selected) && (
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Эта карточка создана по старой модели доступа. Условия сохранены для
                  совместимости; новые карточки создаются только как Бесплатно или Платно.
                </p>
              )}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="block text-sm">
                  Название
                  <input
                    className={`mt-1 ${fieldClass}`}
                    value={draft.title}
                    onChange={e => setDraft({ ...draft, title: e.target.value })}
                    disabled={selected.lifecycle === 'archived' || legacyListing(selected)}
                  />
                </label>
                <label className="block text-sm">
                  Категория
                  <select
                    aria-label="Категория размещения"
                    className={`mt-1 ${fieldClass}`}
                    value={draft.category}
                    onChange={e => setDraft({ ...draft, category: e.target.value })}
                    disabled={selected.lifecycle === 'archived' || legacyListing(selected)}
                  >
                    {MARKETPLACE_CATEGORIES.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm md:col-span-2">
                  Описание
                  <textarea
                    className={`mt-1 ${fieldClass}`}
                    value={draft.description}
                    onChange={e => setDraft({ ...draft, description: e.target.value })}
                    disabled={selected.lifecycle === 'archived' || legacyListing(selected)}
                  />
                </label>
                {!legacyListing(selected) && (
                  <label className="block text-sm">
                    Вариант размещения
                    <select
                      className={`mt-1 ${fieldClass}`}
                      value={draft.commercial_mode}
                      onChange={e =>
                        setDraft({ ...draft, commercial_mode: e.target.value as 'free' | 'paid' })
                      }
                      disabled={
                        selected.lifecycle === 'archived' ||
                        (selected.lifecycle === 'published' && selected.commercial_mode === 'free')
                      }
                    >
                      <option value="free">Бесплатно</option>
                      <option value="paid">Платно</option>
                    </select>
                  </label>
                )}
                {!legacyListing(selected) && draft.commercial_mode === 'paid' && (
                  <>
                    <label className="block text-sm">
                      Фиксированная цена
                      <input
                        aria-label="Цена размещения"
                        type="number"
                        min="0.01"
                        step="0.01"
                        className={`mt-1 ${fieldClass}`}
                        value={draft.price_amount}
                        onChange={e => setDraft({ ...draft, price_amount: e.target.value })}
                        disabled={selected.lifecycle === 'archived'}
                      />
                    </label>
                    <label className="block text-sm">
                      Валюта
                      <input
                        aria-label="Валюта размещения"
                        maxLength={3}
                        className={`mt-1 ${fieldClass}`}
                        value={draft.price_currency}
                        onChange={e =>
                          setDraft({ ...draft, price_currency: e.target.value.toUpperCase() })
                        }
                        disabled={selected.lifecycle === 'archived'}
                      />
                    </label>
                  </>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {selected.lifecycle !== 'archived' && !legacyListing(selected) && (
                  <button
                    type="button"
                    className="min-h-11 rounded bf-primary-cta px-4 py-2 text-sm"
                    onClick={() => void saveSelected()}
                  >
                    Сохранить
                  </button>
                )}
                {selected.lifecycle === 'draft' && (
                  <button
                    type="button"
                    className="min-h-11 rounded bf-primary-cta px-4 py-2 text-sm"
                    onClick={() =>
                      void changeLifecycle(
                        publishCustomBlockMarketplaceListing,
                        'Карточка опубликована.'
                      )
                    }
                  >
                    Опубликовать
                  </button>
                )}
                {selected.lifecycle === 'published' && (
                  <button
                    type="button"
                    className="bf-danger-cta text-sm"
                    onClick={() =>
                      void changeLifecycle(
                        archiveCustomBlockMarketplaceListing,
                        'Карточка архивирована.'
                      )
                    }
                  >
                    Архивировать
                  </button>
                )}
                {selected.lifecycle === 'archived' && (
                  <button
                    type="button"
                    className="min-h-11 rounded bf-primary-cta px-4 py-2 text-sm"
                    onClick={() =>
                      void changeLifecycle(
                        restoreCustomBlockMarketplaceListing,
                        'Карточка восстановлена.'
                      )
                    }
                  >
                    Восстановить
                  </button>
                )}
              </div>
            </section>
            {legacyListing(selected) && (
              <section className="mt-5 bf-section-card min-w-0">
                <h3 className="font-semibold">Ранее созданные запросы доступа</h3>
                {selectedRequests.map(row => (
                  <div
                    key={row.id}
                    className="mt-3 rounded-lg border border-[var(--border)] p-3 text-sm"
                  >
                    <strong>{row.requester_name}</strong> · v{row.version} ·{' '}
                    {
                      { pending: 'Ожидает решения', approved: 'Одобрен', rejected: 'Отклонён' }[
                        row.state
                      ]
                    }
                    <p className="text-[var(--text-muted)]">{row.message || 'Без сообщения'}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {row.chat_room_id && (
                        <Link
                          className="bf-secondary-cta"
                          to={`/dashboard/messages?roomId=${row.chat_room_id}`}
                        >
                          Открыть чат
                        </Link>
                      )}
                      {row.state === 'pending' && (
                        <>
                          <button
                            type="button"
                            className="min-h-11 rounded bf-primary-cta px-3 py-1"
                            onClick={() => void decision(row, true)}
                          >
                            Одобрить
                          </button>
                          <button
                            type="button"
                            className="bf-danger-cta"
                            onClick={() => void decision(row, false)}
                          >
                            Отклонить
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {!loading && !loadError && !selectedRequests.length && (
                  <p className="mt-2 text-sm text-[var(--text-muted)]">Запросов пока нет.</p>
                )}
              </section>
            )}
            {selected.lifecycle === 'published' && selected.commercial_mode !== 'free' && (
              <section className="mt-5 bf-section-card min-w-0">
                <h3 className="font-semibold">Выдать право после договорённости</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Расчёт происходит напрямую с пользователем вне BotForg. Укажите его публичный ID.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    aria-label="Публичный ID пользователя"
                    className={`${fieldClass} sm:max-w-56`}
                    inputMode="numeric"
                    value={grantRecipientId}
                    onChange={e => setGrantRecipientId(e.target.value)}
                    placeholder="Публичный ID"
                  />
                  <button
                    type="button"
                    className="min-h-11 rounded bf-primary-cta px-4 py-2"
                    onClick={() => void grantAccess()}
                  >
                    Выдать право использования
                  </button>
                  <button
                    type="button"
                    className="bf-secondary-cta"
                    onClick={() => void grantDistribution()}
                  >
                    Выдать право распространения
                  </button>
                </div>
              </section>
            )}
            {detailsError && (
              <p role="alert" className="mt-4 text-[var(--error)]">
                {detailsError}
              </p>
            )}
            {detailsLoading && (
              <p role="status" className="mt-4">
                Загрузка доступа и отзывов…
              </p>
            )}
            <section className="mt-5 grid gap-5 md:grid-cols-2">
              <div className="bf-section-card min-w-0">
                <h3 className="font-semibold">Выданный доступ</h3>
                {grants.map(grant => (
                  <div
                    key={grant.id}
                    className="mt-2 rounded-lg border border-[var(--border)] p-2 text-sm"
                  >
                    {grant.recipient_name} · {grant.status === 'active' ? 'Действует' : 'Отозван'}
                    {grant.status === 'active' && (
                      <button
                        type="button"
                        className="ml-2 text-[var(--primary)]"
                        onClick={() =>
                          void revokeCustomBlockMarketplaceGrant(grant.id).then(() =>
                            getCustomBlockMarketplaceGrants(selected.custom_block_version_id).then(
                              setGrants
                            )
                          )
                        }
                      >
                        Отозвать
                      </button>
                    )}
                  </div>
                ))}
                {!detailsLoading && !detailsError && !grants.length && (
                  <p className="mt-2 text-sm text-[var(--text-muted)]">Доступ пока не выдан.</p>
                )}
              </div>
              <div className="bf-section-card min-w-0">
                <h3 className="font-semibold">Отзывы</h3>
                {reviews.map(review => (
                  <div
                    key={review.id}
                    className="mt-2 rounded-lg border border-[var(--border)] p-2 text-sm"
                  >
                    {review.author_name} · {review.rating} ★<br />
                    {review.text}
                  </div>
                ))}
                {!detailsLoading && !detailsError && !reviews.length && (
                  <p className="mt-2 text-sm text-[var(--text-muted)]">Отзывов пока нет.</p>
                )}
              </div>
            </section>
          </>
        )}
      </PageShell>
    </main>
  );
}
