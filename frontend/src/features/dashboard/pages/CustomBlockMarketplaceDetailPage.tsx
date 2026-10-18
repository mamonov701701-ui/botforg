import PageShell from '../../../ui/PageShell';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  contactCustomBlockMarketplaceAuthor,
  getCustomBlockMarketplaceListing,
  installCustomBlockMarketplaceListing,
  installGrantedCustomBlockVersion,
  type CustomBlockMarketplaceListing,
} from '../../../api/customBlockMarketplace';
import {
  MARKET_SECTION_TABS,
  isCurrentCustomBlockOffer,
  marketSectionPath,
  marketplaceCategoryLabel,
  marketplacePriceLabel,
  type MarketSectionId,
} from '../../../constants/marketplaceNavigation';

export default function CustomBlockMarketplaceDetailPage() {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState<CustomBlockMarketplaceListing | null>(null);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [chatRoomId, setChatRoomId] = useState<number | null>(null);

  const refresh = async (id: number) => {
    const updated = await getCustomBlockMarketplaceListing(id);
    setItem(updated);
    setChatRoomId(updated.access.chat_room_id ?? null);
  };
  useEffect(() => {
    if (!listingId) return;
    let cancelled = false;
    void getCustomBlockMarketplaceListing(Number(listingId))
      .then(updated => {
        if (!cancelled) {
          setItem(updated);
          setChatRoomId(updated.access.chat_room_id ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setNotice('Блок недоступен.');
      });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  const install = async () => {
    if (!item || busy) return;
    setBusy(true);
    setNotice('');
    try {
      await (item.access.has_active_grant
        ? installGrantedCustomBlockVersion(item.custom_block_version_id)
        : installCustomBlockMarketplaceListing(item.id));
      await refresh(item.id);
    } catch {
      setNotice('Не удалось добавить блок в библиотеку.');
    } finally {
      setBusy(false);
    }
  };
  const contact = async () => {
    if (!item || busy) return;
    setBusy(true);
    setNotice('');
    try {
      const result = await contactCustomBlockMarketplaceAuthor(item.id, message);
      setChatRoomId(result.chat_room_id);
      navigate(`/dashboard/messages?roomId=${result.chat_room_id}`);
    } catch {
      setNotice('Не удалось открыть чат с автором.');
    } finally {
      setBusy(false);
    }
  };
  if (!item) return <div className="p-6">{notice || 'Загрузка...'}</div>;
  if (!isCurrentCustomBlockOffer(item))
    return (
      <main className="mx-auto max-w-7xl p-4">
        <p>Карточка недоступна в каталоге.</p>
        <Link className="text-[var(--primary)]" to="/market/custom-blocks">
          Вернуться в каталог
        </Link>
      </main>
    );

  const access = item.access;
  const unavailable = !access.listing_available && !access.has_active_grant;
  const revoked = access.has_grant_history && !access.has_active_grant;
  const canAdd = !access.is_installed && (access.has_active_grant || access.can_self_install);
  const guide = item.user_guide?.content;

  return (
    <main className="mx-auto max-w-7xl p-4 pb-32 md:px-4 md:pt-8 md:pb-36">
      <PageShell
        title="Маркет"
        subtitle="Кастомные блоки"
        tabs={MARKET_SECTION_TABS.map(tab => ({
          id: tab.id,
          label: tab.label,
          testId: `market-tab-${tab.id}`,
        }))}
        activeTabId="custom-blocks"
        onTabChange={id => navigate(marketSectionPath(id as MarketSectionId))}
        tabsAriaLabel="Разделы маркета"
      >
        <Link className="text-sm text-[var(--primary)]" to="/market/custom-blocks">
          ← Кастомные блоки
        </Link>
        <article className="mt-4 bf-section-card min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-2xl font-bold">{item.title}</h1>
            <span>v{item.version}</span>
          </div>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Связанный блок: {item.block_title} · Точная версия: v{item.version}
          </p>
          <p className="mt-3 text-[var(--text-muted)]">{item.description}</p>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Автор: {item.author.name || `Пользователь #${item.author.id}`}
            {item.author.username ? ` · @${item.author.username}` : ''} · Категория:{' '}
            {marketplaceCategoryLabel(item.category)} · Точная версия: v{item.version}
          </p>
          <div className="mt-5 border-y border-[var(--border)] py-4">
            <strong
              className={
                item.commercial_mode === 'paid'
                  ? 'text-3xl text-[var(--text)]'
                  : 'text-2xl text-[var(--primary)]'
              }
            >
              {item.commercial_mode === 'paid'
                ? marketplacePriceLabel(item.price_amount, item.price_currency)
                : 'БЕСПЛАТНО'}
            </strong>
            {item.commercial_mode === 'paid' && (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Оплата напрямую автору. BotForg не участвует в расчётах.
              </p>
            )}
          </div>
          <p className="mt-3 text-sm">
            Рейтинг: {item.rating_average ?? '—'} ★ ({item.rating_count})
          </p>
          {typeof guide === 'string' && guide.trim() && (
            <section className="mt-5">
              <h2 className="font-semibold">Инструкция</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--text-muted)]">{guide}</p>
            </section>
          )}

          <div className="mt-5 border-t border-[var(--border)] pt-4">
            {access.is_owner ? (
              <p>Это ваш блок. Управление размещением доступно в разделе «Мои блоки».</p>
            ) : unavailable ? (
              <p>Размещение архивировано или версия недоступна для нового использования.</p>
            ) : revoked ? (
              <p>Доступ отозван. Новое использование недоступно.</p>
            ) : access.is_installed && access.has_active_grant ? (
              <>
                <p>Добавлено в мои блоки.</p>
                <Link
                  className="mt-3 inline-flex min-h-11 items-center rounded bf-primary-cta px-4 py-2 text-sm"
                  to="/dashboard/block-library"
                >
                  Открыть в библиотеке
                </Link>
              </>
            ) : canAdd ? (
              <>
                <p>
                  {access.has_active_grant
                    ? 'Доступ получен. Блок ещё не добавлен в библиотеку.'
                    : 'Блок доступен для самостоятельного добавления.'}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  className="mt-3 min-h-11 rounded bf-primary-cta px-4 py-2"
                  onClick={() => void install()}
                >
                  Добавить в мои блоки
                </button>
              </>
            ) : (
              <p>Доступа к этой версии пока нет.</p>
            )}

            {!access.is_owner &&
              !unavailable &&
              !revoked &&
              !access.has_active_grant &&
              !canAdd &&
              item.commercial_mode === 'paid' && (
                <div className="mt-4">
                  <textarea
                    aria-label="Сообщение автору"
                    className="min-h-11 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-[var(--text)]"
                    value={message}
                    onChange={event => setMessage(event.target.value)}
                    placeholder="Сообщение автору (необязательно)"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    className="mt-2 min-h-11 rounded bf-primary-cta px-4 py-2"
                    onClick={() => void contact()}
                  >
                    Связаться с автором
                  </button>
                </div>
              )}
            {!access.is_owner && chatRoomId && (
              <Link
                className="mt-3 inline-flex min-h-11 items-center rounded bf-secondary-cta px-4 py-2 text-sm"
                to={`/dashboard/messages?roomId=${chatRoomId}`}
              >
                Открыть чат
              </Link>
            )}
            {notice && (
              <p role="status" className="mt-4 text-sm">
                {notice}
              </p>
            )}
          </div>
        </article>
        <section className="mt-5 bf-section-card min-w-0">
          <h2 className="font-semibold">Отзывы</h2>
          {item.reviews?.length ? (
            item.reviews.map(review => (
              <div
                key={review.id}
                className="mt-3 rounded-lg border border-[var(--border)] p-3 text-sm"
              >
                {review.rating} ★ · Пользователь #{review.author_user_id}
                <p className="mt-1 text-[var(--text-muted)]">{review.text}</p>
              </div>
            ))
          ) : (
            <p className="mt-2 text-sm text-[var(--text-muted)]">Отзывов пока нет.</p>
          )}
        </section>
      </PageShell>
    </main>
  );
}
