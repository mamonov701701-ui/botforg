/**
 * Детальная страница товара маркетплейса
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Star, User, ShoppingCart } from 'lucide-react';
import {
  getMarketItem,
  installMarketBot,
  installMarketScenario,
  parseMarketPrice,
  isPaidMarketItem,
  getMarketInstallErrorMessage,
  getMarketItemActionLabel,
  getMarketInstallSuccessMessage,
  getMarketInstallDestination,
  MARKET_MANUAL_ACCESS_REQUIRED_MESSAGE,
  MARKET_SELLER_CONTACTS_PLACEHOLDER,
  type MarketItemDetail,
  type MarketReview,
} from '../api/market';
import { ApiError } from '../api/client';
import { toast } from '../utils/toast';

function itemTypeLabel(itemType: string): string {
  if (itemType === 'scenario') return 'Сценарий';
  if (itemType === 'template') return 'Шаблон бота';
  return itemType;
}

function formatDetailError(err: unknown): { message: string; notFound: boolean } {
  if (err instanceof ApiError) {
    return {
      message: err.message || 'Не удалось загрузить товар',
      notFound: err.status === 404,
    };
  }
  if (err instanceof Error) {
    return { message: err.message, notFound: false };
  }
  return { message: 'Не удалось загрузить товар', notFound: false };
}

export default function MarketItemDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const itemId = id ? parseInt(id, 10) : NaN;

  const [item, setItem] = useState<MarketItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!id || Number.isNaN(itemId) || itemId <= 0) {
      setLoading(false);
      setNotFound(true);
      setError('Некорректный адрес товара');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    setItem(null);

    getMarketItem(itemId)
      .then(data => {
        if (!cancelled) setItem(data);
      })
      .catch(err => {
        if (!cancelled) {
          const { message, notFound: nf } = formatDetailError(err);
          setError(message);
          setNotFound(nf);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, itemId]);

  const handleRequestAccess = useCallback(() => {
    toast.info(MARKET_MANUAL_ACCESS_REQUIRED_MESSAGE);
    toast.info(MARKET_SELLER_CONTACTS_PLACEHOLDER);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!item) return;

    if (isPaidMarketItem(item.price)) {
      handleRequestAccess();
      return;
    }

    setInstalling(true);
    try {
      const result =
        item.item_type === 'scenario'
          ? await installMarketScenario(item.id)
          : await installMarketBot(item.id);
      const successMessage = getMarketInstallSuccessMessage(item.item_type);
      if (item.item_type === 'scenario') {
        toast.success(`${successMessage} Перейти в мои сценарии.`);
      } else {
        toast.success(successMessage);
      }
      navigate(getMarketInstallDestination(result));
    } catch (err: unknown) {
      toast.error(getMarketInstallErrorMessage(err));
    } finally {
      setInstalling(false);
    }
  }, [item, handleRequestAccess, navigate]);

  const price = item ? parseMarketPrice(item.price) : 0;
  const isPaid = price > 0;
  const actionLabel = item
    ? getMarketItemActionLabel({ price: item.price, item_type: item.item_type })
    : 'Добавить';
  const rating = item?.average_rating ?? 0;
  const reviews: MarketReview[] = item?.reviews ?? [];

  return (
    <div
      data-testid="market-item-detail"
      style={{ minHeight: '100vh', background: 'var(--background)', paddingTop: '100px' }}
    >
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link
          to="/market"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: 'var(--text-muted)',
            textDecoration: 'none',
            marginBottom: '24px',
            fontSize: '14px',
          }}
        >
          <ArrowLeft size={18} />
          Назад к маркетплейсу
        </Link>

        {loading && (
          <p
            style={{ color: 'var(--text-muted)', fontSize: '16px' }}
            data-testid="market-item-detail-loading"
          >
            Загрузка...
          </p>
        )}

        {!loading && (error || notFound) && (
          <div
            data-testid="market-item-detail-error"
            style={{
              padding: '32px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              textAlign: 'center',
            }}
          >
            <ShoppingCart size={48} color="var(--text-muted)" style={{ margin: '0 auto 16px' }} />
            <h1
              style={{
                fontSize: '20px',
                fontWeight: 600,
                color: 'var(--text)',
                marginBottom: '8px',
              }}
            >
              {notFound ? 'Товар не найден' : 'Ошибка загрузки'}
            </h1>
            <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>{error}</p>
            <Link
              to="/market"
              style={{
                color: 'var(--primary)',
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              Вернуться к списку
            </Link>
          </div>
        )}

        {!loading && item && !error && (
          <>
            <div
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                overflow: 'hidden',
                marginBottom: '24px',
              }}
            >
              <div
                style={{
                  height: '200px',
                  background: 'var(--surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShoppingCart size={64} color="var(--text-muted)" />
              </div>
              <div style={{ padding: '24px' }}>
                <p
                  style={{
                    fontSize: '12px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--text-muted)',
                    marginBottom: '8px',
                  }}
                >
                  {itemTypeLabel(item.item_type)}
                  {item.category ? ` · ${item.category}` : ''}
                </p>
                <h1
                  data-testid="market-item-detail-title"
                  style={{
                    fontSize: '28px',
                    fontWeight: 700,
                    color: 'var(--text)',
                    marginBottom: '12px',
                  }}
                >
                  {item.title}
                </h1>
                {(item.description || item.additional_description) && (
                  <p
                    style={{
                      fontSize: '15px',
                      color: 'var(--text-muted)',
                      lineHeight: 1.6,
                      marginBottom: '16px',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {item.description || item.additional_description}
                  </p>
                )}
                {item.additional_description && item.description && (
                  <p
                    style={{
                      fontSize: '14px',
                      color: 'var(--text-muted)',
                      lineHeight: 1.5,
                      marginBottom: '16px',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {item.additional_description}
                  </p>
                )}

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '16px',
                    marginBottom: '16px',
                    fontSize: '14px',
                    color: 'var(--text)',
                  }}
                >
                  <span>
                    Рейтинг: <strong>{rating > 0 ? rating.toFixed(1) : '—'}</strong>
                    {item.rating_count > 0 && (
                      <span style={{ color: 'var(--text-muted)' }}> ({item.rating_count})</span>
                    )}
                  </span>
                  <span>
                    Продаж: <strong>{item.sales_count ?? 0}</strong>
                  </span>
                </div>

                {item.seller && (
                  <div style={{ marginBottom: '16px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <User size={18} color="var(--text-muted)" />
                      <span style={{ fontSize: '14px', color: 'var(--text)' }}>
                        {item.seller.name || item.seller.email}
                      </span>
                    </div>
                    {isPaid && (
                      <p
                        style={{
                          fontSize: '13px',
                          color: 'var(--text-muted)',
                          margin: '8px 0 0 26px',
                        }}
                      >
                        {MARKET_SELLER_CONTACTS_PLACEHOLDER}
                      </p>
                    )}
                  </div>
                )}

                {item.tags && item.tags.length > 0 && (
                  <div
                    style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}
                  >
                    {item.tags.map(tag => (
                      <span
                        key={tag}
                        style={{
                          padding: '4px 10px',
                          background: 'var(--surface)',
                          borderRadius: '12px',
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px',
                    paddingTop: '16px',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <div>
                    {price === 0 ? (
                      <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--primary)' }}>
                        БЕСПЛАТНО
                      </span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                        <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text)' }}>
                          {price.toLocaleString('ru-RU')}
                        </span>
                        <span style={{ fontSize: '16px', color: 'var(--text-muted)' }}>₽</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    data-testid={
                      isPaid ? 'market-item-detail-request-access' : 'market-item-detail-install'
                    }
                    onClick={isPaid ? handleRequestAccess : handleInstall}
                    disabled={!isPaid && installing}
                    style={{
                      padding: '12px 24px',
                      background: !isPaid && installing ? 'var(--surface)' : 'var(--primary)',
                      color: !isPaid && installing ? 'var(--text-muted)' : 'var(--text-on-primary)',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '15px',
                      fontWeight: 600,
                      cursor: !isPaid && installing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {installing ? 'Добавление...' : actionLabel}
                  </button>
                </div>
              </div>
            </div>

            {reviews.length > 0 && (
              <section>
                <h2
                  style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    color: 'var(--text)',
                    marginBottom: '16px',
                  }}
                >
                  Отзывы ({reviews.length})
                </h2>
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    margin: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  {reviews.map(review => (
                    <li
                      key={review.id}
                      style={{
                        padding: '16px',
                        background: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '8px',
                        }}
                      >
                        <div style={{ display: 'flex', gap: '2px' }}>
                          {[1, 2, 3, 4, 5].map(star => (
                            <Star
                              key={star}
                              size={14}
                              fill={star <= review.rating ? 'var(--primary)' : 'none'}
                              color={star <= review.rating ? 'var(--primary)' : 'var(--text-muted)'}
                            />
                          ))}
                        </div>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                          {review.author?.name || review.author?.email || 'Пользователь'}
                        </span>
                      </div>
                      {review.comment && (
                        <p
                          style={{
                            fontSize: '14px',
                            color: 'var(--text)',
                            margin: 0,
                            lineHeight: 1.5,
                          }}
                        >
                          {review.comment}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
