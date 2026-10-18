import PageShell from '../../../ui/PageShell';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  contactCustomBlockMarketplaceAuthor,
  getCustomBlockMarketplaceListings,
  getMyGrantedCustomBlockVersions,
  installCustomBlockMarketplaceListing,
  installGrantedCustomBlockVersion,
  type CustomBlockMarketplaceListing,
  type GrantedCustomBlockVersion,
} from '../../../api/customBlockMarketplace';
import {
  MarketCatalogCard,
  MarketGrid,
  MarketStickyToolbar,
} from '../../../components/market/MarketCards';
import {
  MARKETPLACE_CATEGORIES,
  MARKET_SECTION_TABS,
  marketSectionPath,
  marketplaceCategoryLabel,
  isCurrentCustomBlockOffer,
  marketplacePriceLabel,
  type MarketSectionId,
} from '../../../constants/marketplaceNavigation';

export default function CustomBlockMarketplacePage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<CustomBlockMarketplaceListing[]>([]);
  const [granted, setGranted] = useState<GrantedCustomBlockVersion[]>([]);
  const [grantNotice, setGrantNotice] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');

  const load = async (query = '', categoryFilter = '') => {
    setLoading(true);
    setError('');
    try {
      setItems(
        (
          await getCustomBlockMarketplaceListings({ search: query, category: categoryFilter })
        ).items.filter(isCurrentCustomBlockOffer)
      );
    } catch {
      setError('Не удалось загрузить карточки в Маркете.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    void getMyGrantedCustomBlockVersions()
      .then(setGranted)
      .catch(() => setGrantNotice('Не удалось загрузить выданный доступ.'));
  }, []);
  const addGranted = async (versionId: number) => {
    try {
      await installGrantedCustomBlockVersion(versionId);
      setGranted(await getMyGrantedCustomBlockVersions());
      setGrantNotice('Добавлено в мои блоки.');
    } catch {
      setGrantNotice('Не удалось добавить версию. Проверьте состояние права доступа.');
    }
  };
  const actOnListing = async (item: CustomBlockMarketplaceListing) => {
    setActionId(item.id);
    setActionError('');
    try {
      if (item.commercial_mode === 'free' || item.access.has_active_grant) {
        await installCustomBlockMarketplaceListing(item.id);
        await load(search, category);
      } else {
        const room = await contactCustomBlockMarketplaceAuthor(item.id, '');
        navigate(`/dashboard/messages?roomId=${room.chat_room_id}`);
      }
    } catch {
      setActionError('Не удалось выполнить действие с блоком.');
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="bf-market-container p-4 md:px-4 md:py-8">
      <PageShell
        testId="market-custom-blocks-shell"
        className="bf-market-shell"
        title="Маркет"
        subtitle="Покупайте и продавайте шаблоны, сценарии, размещайте заказы и находите исполнителей"
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
          <span
            aria-current="page"
            className="rounded-lg bg-[var(--primary-bg)] px-3 py-2 font-semibold text-[var(--primary)]"
          >
            Каталог
          </span>
          <Link
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-[var(--primary)]"
            to="/market/my-listings/custom-blocks"
          >
            Мои блоки
          </Link>
        </nav>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">Кастомные блоки</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Опубликованные версии блоков с защищённым правом использования.
            </p>
          </div>
        </div>
        <MarketStickyToolbar>
          <form
            className="grid min-w-0 grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_220px_auto]"
            onSubmit={event => {
              event.preventDefault();
              void load(search, category);
            }}
          >
            <input
              className="col-span-2 bg-[var(--surface)] text-[var(--text)] min-h-11 min-w-0 w-full rounded-lg border border-[var(--border)] px-3 py-2 md:col-span-1"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Поиск блоков"
            />
            <select
              aria-label="Категория"
              className="bg-[var(--surface)] text-[var(--text)] min-h-11 min-w-0 rounded-lg border border-[var(--border)] px-3 py-2"
              value={category}
              onChange={event => setCategory(event.target.value)}
            >
              <option value="">Все категории</option>
              {MARKETPLACE_CATEGORIES.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <button className="rounded bf-primary-cta px-4 py-2">Найти</button>
          </form>
        </MarketStickyToolbar>
        {error && (
          <p role="alert" className="text-[var(--error)]">
            {error}
          </p>
        )}
        {actionError && (
          <p role="alert" className="text-[var(--error)]">
            {actionError}
          </p>
        )}
        {loading ? (
          <p>Загрузка...</p>
        ) : (
          <MarketGrid testId="market-custom-block-grid">
            {items.map(item => (
              <MarketCatalogCard
                key={item.id}
                testId="custom-block-product-card"
                itemId={item.id}
                kind="custom-block"
                href={`/market/custom-blocks/${item.id}`}
                title={item.title}
                description={item.description}
                author={`${item.author.name || `Пользователь #${item.author.id}`}${item.author.username ? ` · @${item.author.username}` : ''}`}
                meta={
                  <>
                    v{item.version} · {marketplaceCategoryLabel(item.category)}
                  </>
                }
                rating={item.rating_average}
                ratingCount={item.rating_count}
                priceLabel={
                  item.commercial_mode === 'free'
                    ? 'БЕСПЛАТНО'
                    : marketplacePriceLabel(item.price_amount, item.price_currency)
                }
                free={item.commercial_mode === 'free'}
                action={
                  item.access.is_owner ? (
                    <Link to="/market/my-listings/custom-blocks" className="bf-primary-cta">
                      Управлять
                    </Link>
                  ) : item.access.is_installed && item.access.has_active_grant ? (
                    <Link to="/dashboard/block-library" className="bf-primary-cta">
                      Открыть в библиотеке
                    </Link>
                  ) : item.access.has_grant_history && !item.access.has_active_grant ? (
                    <span className="text-[var(--text-muted)]">Доступ отозван</span>
                  ) : item.commercial_mode === 'free' && !item.access.can_self_install ? (
                    <span className="text-[var(--text-muted)]">Добавление недоступно</span>
                  ) : (
                    <button
                      type="button"
                      disabled={actionId === item.id}
                      className="bf-primary-cta"
                      onClick={() => void actOnListing(item)}
                    >
                      {item.commercial_mode === 'free' || item.access.has_active_grant
                        ? 'Добавить в мои блоки'
                        : 'Связаться с автором'}
                    </button>
                  )
                }
              />
            ))}
            {!error && !items.length && (
              <p className="col-span-full text-[var(--text-muted)]">Подходящих блоков пока нет.</p>
            )}
          </MarketGrid>
        )}
        <section className="mt-6 bf-section-card min-w-0" aria-label="Предоставленные мне блоки">
          <h3 className="font-semibold">Предоставленные мне блоки</h3>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Личный доступ к точным версиям, в том числе переданным автором без размещения в Маркете.
          </p>
          {grantNotice && (
            <p role="status" className="mt-2 text-sm">
              {grantNotice}
            </p>
          )}
          {granted.map(row => (
            <div
              key={row.custom_block_version_id}
              className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3 text-sm"
            >
              <span>
                {row.title} · v{row.version} · автор #{row.original_author_user_id}
              </span>
              {row.is_installed ? (
                <span>Добавлено в мои блоки</span>
              ) : row.can_install ? (
                <button
                  type="button"
                  className="min-h-11 rounded bf-primary-cta px-3 py-2"
                  onClick={() => void addGranted(row.custom_block_version_id)}
                >
                  Добавить в мои блоки
                </button>
              ) : (
                <span>Версия недоступна для добавления</span>
              )}
            </div>
          ))}
          {!granted.length && !grantNotice && (
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Предоставленных версий пока нет.
            </p>
          )}
        </section>
      </PageShell>
    </div>
  );
}
