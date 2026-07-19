/**
 * Marketplace Page - Маркетплейс для шаблонов, сценариев, заказов и услуг
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Star,
  User,
  DollarSign,
  ShoppingCart,
  Briefcase,
  Users,
  Plus,
  X,
} from 'lucide-react';
import { getBots } from '../api/bot';
import { getMyScenarios } from '../api/scenarios';
import {
  createMarketItem,
  createMarketOrder,
  createFreelancerProfile,
  getMarketItems,
  installMarketBot,
  installMarketScenario,
  createMarketAccessRequest,
  getMarketItemAccessStatus,
  isPaidMarketItem,
  getMarketItemActionLabel,
  getMarketInstallSuccessMessage,
  getMarketInstallDestination,
  getMarketInstallErrorMessage,
  getMarketAccessRequestSuccessMessage,
  getMarketAccessRequestErrorMessage,
  getMarketAccessRequestChatPath,
  resolveMarketItemAccessChatRoomId,
  MARKET_ACCESS_REQUEST_PENDING_LABEL,
  type MarketItemCreate,
} from '../api/market';
import { ApiError } from '../api/client';
import { toast } from '../utils/toast';
import { useAuthStore } from '../stores/authStore';
import { useUiStore } from '../stores/uiStore';
import { hasAccessToPlanRestrictedAction } from '../constants/roles';
import { Link } from 'react-router-dom';
import PageShell from '../ui/PageShell';

/** Контраст текста на тёмном фоне /market (desktop, без смены глобальной темы) */
const MARKET_TEXT = {
  subtitle: '#c8d0dc',
  tabInactive: '#c5ced8',
  muted: '#b0bcc9',
  placeholder: '#9fb0c3',
} as const;

type MarketTab = 'templates' | 'scenarios' | 'customers' | 'freelancers';

const MARKET_TABS: { id: MarketTab; label: string }[] = [
  { id: 'templates', label: 'Шаблоны' },
  { id: 'scenarios', label: 'Сценарии' },
  { id: 'customers', label: 'Заказчики' },
  { id: 'freelancers', label: 'Исполнители' },
];

interface MarketItem {
  id: number;
  title: string;
  description: string;
  price: number; // 0 = бесплатно
  image: string;
  seller: {
    id: number;
    name: string;
    avatar?: string;
    rating: number;
    reviewsCount: number;
  };
  rating: number;
  reviewsCount: number;
  salesCount: number;
  category: string;
  tags: string[];
  isPremium?: boolean;
}

interface Customer {
  id: number;
  title: string;
  description: string;
  budget: string;
  deadline: string;
  category: string;
  skills: string[];
  author: {
    id: number;
    name: string;
    avatar?: string;
  };
  createdAt: string;
  offersCount: number;
}

interface Freelancer {
  id: number;
  name: string;
  avatar?: string;
  title: string; // e.g. "Разработчик ботов"
  description: string;
  rating: number;
  reviewsCount: number;
  completedOrders: number;
  hourlyRate?: number;
  skills: string[];
  portfolio: {
    id: number;
    title: string;
    image: string;
  }[];
}

export default function MarketplacePage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { openAuth } = useUiStore();
  const [activeTab, setActiveTab] = useState<MarketTab>('templates');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sourceType, setSourceType] = useState<'new' | 'existing'>('existing');
  const [myTemplates, setMyTemplates] = useState<any[]>([]);
  const [myScenarios, setMyScenarios] = useState<any[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [marketItems, setMarketItems] = useState<any[]>([]);
  const [marketOrders, setMarketOrders] = useState<any[]>([]);
  const [freelancers, setFreelancers] = useState<any[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [installingItemId, setInstallingItemId] = useState<number | null>(null);

  // Стили для select и option элементов
  const selectStyles = `
    .marketplace-select option {
      background: #11161d;
      color: #ffffff;
      padding: 8px;
    }
    .marketplace-select {
      color-scheme: dark;
    }
    .marketplace-search::placeholder {
      color: ${MARKET_TEXT.placeholder};
      opacity: 1;
    }
  `;

  const canPublishTemplate = hasAccessToPlanRestrictedAction(user, 'template_publish');
  const canViewMyTemplates = hasAccessToPlanRestrictedAction(user, 'marketplace_stats');

  // Загрузка товаров с маркетплейса
  useEffect(() => {
    const loadMarketItems = async () => {
      setIsLoadingItems(true);
      try {
        if (activeTab === 'templates' || activeTab === 'scenarios') {
          const response = await getMarketItems({
            item_type: activeTab === 'templates' ? 'template' : 'scenario',
            is_published: true,
            page: 1,
            page_size: 50,
          });
          console.log('[MarketplacePage] Loaded items:', response);
          setMarketItems(response.items || []);
        } else if (activeTab === 'customers') {
          // TODO: Загрузить заказы
          setMarketOrders([]);
        } else if (activeTab === 'freelancers') {
          // TODO: Загрузить исполнителей
          setFreelancers([]);
        }
      } catch (error) {
        console.error('Failed to load market items:', error);
        setMarketItems([]);
      } finally {
        setIsLoadingItems(false);
      }
    };

    loadMarketItems();
  }, [activeTab]);

  // Загрузка шаблонов (ботов) и сценариев пользователя при открытии модалки
  useEffect(() => {
    if (!showCreateModal || (activeTab !== 'templates' && activeTab !== 'scenarios')) {
      return;
    }

    setIsLoading(true);

    if (activeTab === 'templates') {
      getBots()
        .then(response => {
          setMyTemplates(response?.items || []);
        })
        .catch(err => {
          console.error('Failed to load bots:', err);
          setMyTemplates([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else if (activeTab === 'scenarios') {
      getMyScenarios()
        .then(scenarios => {
          setMyScenarios(Array.isArray(scenarios) ? scenarios : []);
        })
        .catch(err => {
          console.error('Failed to load scenarios:', err);
          setMyScenarios([]);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [showCreateModal, activeTab]);

  // Mock data - в будущем будет из API
  const mockTemplates: MarketItem[] = [
    {
      id: 1,
      title: 'Готовый бот для магазина',
      description: 'Полностью готовый шаблон бота для интернет-магазина с корзиной и оплатой',
      price: 5000,
      image: '/placeholder-template.png',
      seller: {
        id: 1,
        name: 'Иван Петров',
        rating: 4.8,
        reviewsCount: 124,
      },
      rating: 4.9,
      reviewsCount: 45,
      salesCount: 156,
      category: 'E-commerce',
      tags: ['магазин', 'оплата', 'корзина'],
      isPremium: true,
    },
  ];

  const renderStars = (rating: number) => {
    return (
      <div style={{ display: 'flex', gap: '2px' }}>
        {[1, 2, 3, 4, 5].map(star => (
          <Star
            key={star}
            size={14}
            fill={star <= rating ? 'var(--primary)' : 'none'}
            color={star <= rating ? 'var(--primary)' : 'var(--text-muted)'}
          />
        ))}
      </div>
    );
  };

  const handleRequestAccess = async (sourceItem: { id: number }) => {
    setInstallingItemId(sourceItem.id);
    try {
      const result = await createMarketAccessRequest(sourceItem.id);
      toast.success(getMarketAccessRequestSuccessMessage(result.already_exists));
      navigate(getMarketAccessRequestChatPath(result.chat_room_id));
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        openAuth(`/market/items/${sourceItem.id}`);
        toast.info('Войдите, чтобы запросить доступ');
      } else {
        toast.error(getMarketAccessRequestErrorMessage(error));
      }
    } finally {
      setInstallingItemId(null);
    }
  };

  const handleInstall = async (sourceItem: any) => {
    if (!sourceItem?.id || !sourceItem?.item_type) {
      toast.error('Не удалось определить товар для установки');
      return;
    }
    if (isPaidMarketItem(sourceItem.price)) {
      try {
        const access = await getMarketItemAccessStatus(sourceItem.id);
        if (access.can_install) {
          setInstallingItemId(sourceItem.id);
          try {
            const result = await (sourceItem.item_type === 'scenario'
              ? installMarketScenario(sourceItem.id)
              : installMarketBot(sourceItem.id));
            toast.success(getMarketInstallSuccessMessage(sourceItem.item_type));
            navigate(getMarketInstallDestination(result));
          } catch (error: unknown) {
            toast.error(getMarketInstallErrorMessage(error));
          } finally {
            setInstallingItemId(null);
          }
          return;
        }
        const roomId = resolveMarketItemAccessChatRoomId(access);
        if (access.status === 'new' || access.status === 'in_discussion') {
          if (roomId != null) {
            navigate(getMarketAccessRequestChatPath(roomId));
          } else {
            toast.info(MARKET_ACCESS_REQUEST_PENDING_LABEL);
          }
          return;
        }
      } catch (error: unknown) {
        if (!(error instanceof ApiError && error.status === 401)) {
          toast.error(getMarketInstallErrorMessage(error));
          return;
        }
      }
      await handleRequestAccess(sourceItem);
      return;
    }
    setInstallingItemId(sourceItem.id);
    try {
      const result = await (sourceItem.item_type === 'scenario'
        ? installMarketScenario(sourceItem.id)
        : installMarketBot(sourceItem.id));
      toast.success(getMarketInstallSuccessMessage(sourceItem.item_type));
      navigate(getMarketInstallDestination(result));
    } catch (error: unknown) {
      toast.error(getMarketInstallErrorMessage(error));
    } finally {
      setInstallingItemId(null);
    }
  };

  const renderProductCard = (item: MarketItem, sourceItem: any) => {
    const isPaid = isPaidMarketItem(sourceItem?.price ?? item.price);
    const isInstalling = installingItemId === sourceItem?.id;
    const actionLabel = getMarketItemActionLabel({
      price: sourceItem?.price ?? item.price,
      item_type: sourceItem?.item_type,
    });

    return (
      <div
        key={item.id}
        role="link"
        tabIndex={0}
        data-testid="market-item-card"
        data-item-id={sourceItem?.id ?? item.id}
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '12px',
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
        onClick={() => {
          const targetId = sourceItem?.id ?? item.id;
          if (targetId) navigate(`/market/items/${targetId}`);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const targetId = sourceItem?.id ?? item.id;
            if (targetId) navigate(`/market/items/${targetId}`);
          }
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateY(-4px)';
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {/* Image */}
        <div
          style={{
            height: '200px',
            background: 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {item.isPremium && (
            <div
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'var(--primary)',
                color: 'var(--text-on-primary)',
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              PREMIUM
            </div>
          )}
          <ShoppingCart size={64} color="var(--text-muted)" />
        </div>

        {/* Content */}
        <div style={{ padding: '16px' }}>
          {/* Title */}
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--text)',
              marginBottom: '8px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.title}
          </h3>

          {/* Description */}
          <p
            style={{
              fontSize: '13px',
              color: 'var(--text-muted)',
              marginBottom: '12px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              lineHeight: '1.4',
              height: '36px',
            }}
          >
            {item.description}
          </p>

          {/* Rating */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            {renderStars(Math.floor(item.rating))}
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
              {item.rating}
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              ({item.reviewsCount})
            </span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {item.salesCount} продаж
            </span>
          </div>

          {/* Seller */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: 'var(--surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <User size={14} color="var(--text-muted)" />
            </div>
            <span style={{ fontSize: '13px', color: 'var(--text)' }}>{item.seller.name}</span>
            {renderStars(Math.floor(item.seller.rating))}
          </div>

          {/* Tags */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
            {item.tags.slice(0, 3).map(tag => (
              <span
                key={tag}
                style={{
                  padding: '4px 10px',
                  background: 'var(--surface)',
                  borderRadius: '12px',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>

          {/* Price and CTA */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              {item.price === 0 ? (
                <span
                  style={{
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--primary)',
                  }}
                >
                  БЕСПЛАТНО
                </span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)' }}>
                    {item.price.toLocaleString('ru-RU')}
                  </span>
                  <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>₽</span>
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label={actionLabel}
              title={isPaid ? 'Обсудите доступ с автором во внутреннем чате BotForg' : undefined}
              onClick={e => {
                e.stopPropagation();
                handleInstall(sourceItem);
              }}
              disabled={isInstalling}
              style={{
                padding: '10px 20px',
                background: isInstalling ? 'var(--surface)' : 'var(--primary)',
                color: isInstalling ? 'var(--text-muted)' : 'var(--text-on-primary)',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: isInstalling ? 'not-allowed' : 'pointer',
              }}
            >
              {isInstalling ? 'Отправка...' : actionLabel}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <style>{selectStyles}</style>
        <PageShell
          testId="market-page-shell"
          title="Маркет"
          subtitle="Покупайте и продавайте шаблоны, сценарии, размещайте заказы и находите исполнителей"
          tabs={MARKET_TABS.map(t => ({
            id: t.id,
            label: t.label,
            testId: `market-tab-${t.id}`,
          }))}
          activeTabId={activeTab}
          onTabChange={id => setActiveTab(id as MarketTab)}
          tabsAriaLabel="Разделы маркета"
          tabsTestId="market-tablist"
        >
          {/* Search and actions */}
          <div
            style={{
              marginBottom: '24px',
              display: 'flex',
              gap: '16px',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ position: 'relative', flex: 1, minWidth: '200px', maxWidth: '600px' }}>
              <Search
                size={20}
                style={{
                  position: 'absolute',
                  left: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: MARKET_TEXT.muted,
                }}
              />
              <input
                type="text"
                className="marketplace-search"
                placeholder="Поиск..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 16px 14px 48px',
                  background: 'var(--bf-section-bg)',
                  border: '1px solid var(--bf-section-border)',
                  borderRadius: 'var(--bf-section-radius)',
                  fontSize: '15px',
                  color: 'var(--text)',
                }}
              />
            </div>

            {activeTab === 'templates' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                {canViewMyTemplates && (
                  <Link
                    to="/developer/templates"
                    style={{
                      padding: '14px 24px',
                      background: 'transparent',
                      color: 'var(--primary)',
                      border: '1px solid var(--primary)',
                      borderRadius: 'var(--bf-section-radius)',
                      fontSize: '15px',
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Мои шаблоны
                  </Link>
                )}
                {canPublishTemplate ? (
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    style={{
                      padding: '14px 24px',
                      background: 'var(--primary)',
                      color: 'var(--text-on-primary)',
                      border: 'none',
                      borderRadius: 'var(--bf-section-radius)',
                      fontSize: '15px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Plus size={20} />
                    Опубликовать шаблон
                  </button>
                ) : (
                  <Link
                    to="/pricing"
                    title="Публикация шаблонов доступна на тарифе Developer"
                    style={{
                      padding: '14px 24px',
                      background: 'transparent',
                      color: MARKET_TEXT.subtitle,
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--bf-section-radius)',
                      fontSize: '15px',
                      fontWeight: 600,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Plus size={20} />
                    Публикация на тарифе Developer
                  </Link>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                style={{
                  padding: '14px 24px',
                  background: 'var(--primary)',
                  color: 'var(--text-on-primary)',
                  border: 'none',
                  borderRadius: 'var(--bf-section-radius)',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  whiteSpace: 'nowrap',
                }}
              >
                <Plus size={20} />
                {activeTab === 'scenarios' && 'Разместить сценарий'}
                {activeTab === 'customers' && 'Создать заказ'}
                {activeTab === 'freelancers' && 'Стать исполнителем'}
              </button>
            )}
          </div>

          {/* Content */}
          {activeTab === 'templates' && (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: '24px',
                }}
              >
                {isLoadingItems ? (
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      textAlign: 'center',
                      padding: '40px',
                      color: MARKET_TEXT.subtitle,
                      fontSize: '16px',
                    }}
                  >
                    Загрузка товаров...
                  </div>
                ) : marketItems.length === 0 ? (
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      textAlign: 'center',
                      padding: '48px 24px',
                      color: MARKET_TEXT.subtitle,
                      fontSize: '16px',
                      lineHeight: 1.5,
                    }}
                  >
                    <ShoppingCart size={64} style={{ margin: '0 auto 16px', opacity: 0.45 }} />
                    <p>Товары не найдены. Станьте первым, кто разместит товар на маркетплейсе!</p>
                  </div>
                ) : (
                  marketItems
                    .filter(item => {
                      if (searchQuery) {
                        const query = searchQuery.toLowerCase();
                        return (
                          item.title?.toLowerCase().includes(query) ||
                          item.description?.toLowerCase().includes(query) ||
                          item.additional_description?.toLowerCase().includes(query)
                        );
                      }
                      return true;
                    })
                    .map(item => {
                      // Преобразуем данные из API в формат для компонента
                      const formattedItem: MarketItem = {
                        id: item.id,
                        title: item.title,
                        description: item.description || item.additional_description || '',
                        price:
                          typeof item.price === 'string' ? parseFloat(item.price) : item.price || 0,
                        image: item.image_url || '/placeholder-template.png',
                        seller: {
                          id: item.seller?.id || 0,
                          name: item.seller?.name || item.seller?.email || 'Неизвестно',
                          avatar: item.seller?.avatar,
                          rating: item.seller?.rating || 0,
                          reviewsCount: item.seller?.reviewsCount || 0,
                        },
                        rating: item.average_rating || 0,
                        reviewsCount: item.rating_count || 0,
                        salesCount: item.sales_count || 0,
                        category: item.category || 'Другое',
                        tags: item.tags || [],
                        isPremium: item.is_premium || false,
                      };
                      return renderProductCard(formattedItem, item);
                    })
                )}
              </div>
            </div>
          )}

          {activeTab === 'scenarios' && (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                  gap: '24px',
                }}
              >
                {isLoadingItems ? (
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      textAlign: 'center',
                      padding: '40px',
                      color: MARKET_TEXT.subtitle,
                      fontSize: '16px',
                    }}
                  >
                    Загрузка сценариев...
                  </div>
                ) : marketItems.length === 0 ? (
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      textAlign: 'center',
                      padding: '48px 24px',
                      color: MARKET_TEXT.subtitle,
                      fontSize: '16px',
                      lineHeight: 1.5,
                    }}
                  >
                    <Briefcase size={64} style={{ margin: '0 auto 16px', opacity: 0.45 }} />
                    <p>
                      Сценарии не найдены. Станьте первым, кто разместит сценарий на маркетплейсе!
                    </p>
                  </div>
                ) : (
                  marketItems
                    .filter(item => {
                      if (searchQuery) {
                        const query = searchQuery.toLowerCase();
                        return (
                          item.title?.toLowerCase().includes(query) ||
                          item.description?.toLowerCase().includes(query) ||
                          item.additional_description?.toLowerCase().includes(query)
                        );
                      }
                      return true;
                    })
                    .map(item => {
                      // Преобразуем данные из API в формат для компонента
                      const formattedItem: MarketItem = {
                        id: item.id,
                        title: item.title,
                        description: item.description || item.additional_description || '',
                        price:
                          typeof item.price === 'string' ? parseFloat(item.price) : item.price || 0,
                        image: item.image_url || '/placeholder-template.png',
                        seller: {
                          id: item.seller?.id || 0,
                          name: item.seller?.name || item.seller?.email || 'Неизвестно',
                          avatar: item.seller?.avatar,
                          rating: item.seller?.rating || 0,
                          reviewsCount: item.seller?.reviewsCount || 0,
                        },
                        rating: item.average_rating || 0,
                        reviewsCount: item.rating_count || 0,
                        salesCount: item.sales_count || 0,
                        category: item.category || 'Другое',
                        tags: item.tags || [],
                        isPremium: item.is_premium || false,
                      };
                      return renderProductCard(formattedItem, item);
                    })
                )}
              </div>
            </div>
          )}

          {activeTab === 'customers' && (
            <div
              style={{
                textAlign: 'center',
                padding: '64px 24px',
                color: 'var(--text-muted)',
              }}
            >
              <DollarSign size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
                Раздел заказчиков в разработке
              </h3>
              <p>Размещайте свои заказы на разработку ботов и сценариев, находите исполнителей</p>
            </div>
          )}

          {activeTab === 'freelancers' && (
            <div
              style={{
                textAlign: 'center',
                padding: '64px 24px',
                color: 'var(--text-muted)',
              }}
            >
              <Users size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
                Каталог исполнителей готовится
              </h3>
              <p>Предлагайте свои услуги по созданию ботов, сценариев и маркетингу</p>
            </div>
          )}
        </PageShell>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            style={{
              background: 'var(--card)',
              borderRadius: '16px',
              padding: '32px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              position: 'relative',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setShowCreateModal(false)}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: '8px',
              }}
            >
              <X size={24} />
            </button>

            {/* Modal content */}
            <h2
              style={{
                fontSize: '24px',
                fontWeight: 700,
                color: 'var(--text)',
                marginBottom: '24px',
              }}
            >
              {activeTab === 'templates' && 'Разместить шаблон'}
              {activeTab === 'scenarios' && 'Разместить сценарий'}
              {activeTab === 'customers' && 'Создать заказ'}
              {activeTab === 'freelancers' && 'Стать исполнителем'}
            </h2>

            <form
              onSubmit={async e => {
                e.preventDefault();
                setIsSubmitting(true);

                try {
                  const formData = new FormData(e.currentTarget);
                  const formElement = e.currentTarget as HTMLFormElement;

                  if (activeTab === 'templates' || activeTab === 'scenarios') {
                    // Размещение шаблона/сценария
                    if (sourceType === 'existing' && !selectedItemId) {
                      toast.error('Выберите шаблон или сценарий');
                      setIsSubmitting(false);
                      return;
                    }

                    const titleInput =
                      formElement.querySelector<HTMLInputElement>('input[name="title"]');
                    const title = titleInput?.value || '';

                    if (!title) {
                      toast.error('Заполните название');
                      setIsSubmitting(false);
                      return;
                    }

                    const descriptionTextarea = formElement.querySelector<HTMLTextAreaElement>(
                      'textarea[name="description"]'
                    );
                    const description = descriptionTextarea?.value || '';

                    if (!description) {
                      toast.error('Заполните описание');
                      setIsSubmitting(false);
                      return;
                    }

                    const additionalDescription =
                      formElement.querySelector<HTMLTextAreaElement>(
                        'textarea[name="additional_description"]'
                      )?.value || '';

                    const priceInput =
                      formElement.querySelector<HTMLInputElement>('input[name="price"]');
                    const price = priceInput ? parseFloat(priceInput.value) || 0 : 0;

                    const categoryInput =
                      formElement.querySelector<HTMLSelectElement>('select[name="category"]') ||
                      formElement.querySelector<HTMLInputElement>('input[name="category"]');
                    const category = categoryInput?.value || '';

                    const tagsInput =
                      formElement.querySelector<HTMLInputElement>('input[name="tags"]');
                    const tagsStr = tagsInput?.value || '';
                    const tags = tagsStr
                      ? tagsStr
                          .split(',')
                          .map(t => t.trim())
                          .filter(t => t.length > 0)
                      : [];

                    const marketItemData: MarketItemCreate = {
                      item_type: (activeTab === 'templates' ? 'template' : 'scenario') as
                        | 'template'
                        | 'scenario',
                      title,
                      description,
                      additional_description: additionalDescription || undefined,
                      price,
                      category: category || undefined,
                      tags: tags.length > 0 ? tags : undefined,
                      is_published: true,
                      is_premium: false,
                    };

                    if (sourceType === 'existing') {
                      if (activeTab === 'templates') {
                        marketItemData.source_bot_id = selectedItemId!;
                      } else {
                        marketItemData.source_scenario_id = selectedItemId!;
                      }
                    }

                    const createdItem = await createMarketItem(marketItemData);
                    toast.success(
                      `${activeTab === 'templates' ? 'Шаблон' : 'Сценарий'} успешно размещен на маркетплейсе!`
                    );
                    setShowCreateModal(false);

                    // Обновляем список товаров
                    try {
                      const response = await getMarketItems({
                        item_type: activeTab === 'templates' ? 'template' : 'scenario',
                        is_published: true,
                        page: 1,
                        page_size: 50,
                      });
                      setMarketItems(response.items || []);
                    } catch (error) {
                      console.error('Failed to refresh items:', error);
                    }
                  } else if (activeTab === 'customers') {
                    // Создание заказа
                    const title =
                      formElement.querySelector<HTMLInputElement>('input[name="title"]')?.value ||
                      '';
                    const description =
                      formElement.querySelector<HTMLTextAreaElement>('textarea[name="description"]')
                        ?.value || '';
                    const budgetMinInput = formElement.querySelector<HTMLInputElement>(
                      'input[name="budget_min"]'
                    );
                    const budgetMin = budgetMinInput
                      ? parseFloat(budgetMinInput.value) || undefined
                      : undefined;
                    const budgetMaxInput = formElement.querySelector<HTMLInputElement>(
                      'input[name="budget_max"]'
                    );
                    const budgetMax = budgetMaxInput
                      ? parseFloat(budgetMaxInput.value) || undefined
                      : undefined;
                    const categoryInput =
                      formElement.querySelector<HTMLInputElement>('input[name="category"]');
                    const category = categoryInput?.value || undefined;
                    const skillsInput =
                      formElement.querySelector<HTMLInputElement>('input[name="skills"]');
                    const skillsStr = skillsInput?.value || '';
                    const skills = skillsStr
                      ? skillsStr
                          .split(',')
                          .map(s => s.trim())
                          .filter(s => s.length > 0)
                      : undefined;

                    await createMarketOrder({
                      title,
                      description,
                      budget_min: budgetMin,
                      budget_max: budgetMax,
                      category,
                      skills,
                    });
                    toast.success('Заказ успешно создан!');
                    setShowCreateModal(false);
                  } else if (activeTab === 'freelancers') {
                    // Создание профиля исполнителя
                    const title =
                      formElement.querySelector<HTMLInputElement>('input[name="title"]')?.value ||
                      '';
                    const description =
                      formElement.querySelector<HTMLTextAreaElement>('textarea[name="description"]')
                        ?.value || undefined;
                    const hourlyRateInput = formElement.querySelector<HTMLInputElement>(
                      'input[name="hourly_rate"]'
                    );
                    const hourlyRate = hourlyRateInput
                      ? parseFloat(hourlyRateInput.value) || undefined
                      : undefined;
                    const skillsInput =
                      formElement.querySelector<HTMLInputElement>('input[name="skills"]');
                    const skillsStr = skillsInput?.value || '';
                    const skills = skillsStr
                      ? skillsStr
                          .split(',')
                          .map(s => s.trim())
                          .filter(s => s.length > 0)
                      : undefined;

                    await createFreelancerProfile({
                      title,
                      description,
                      hourly_rate: hourlyRate,
                      skills,
                    });
                    toast.success('Профиль исполнителя успешно создан!');
                    setShowCreateModal(false);
                  }
                } catch (error: any) {
                  console.error('Error creating marketplace item:', error);
                  const errorMessage =
                    error?.response?.data?.detail ||
                    error?.message ||
                    'Произошла ошибка при размещении';
                  toast.error(errorMessage);
                } finally {
                  setIsSubmitting(false);
                }
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
            >
              {/* Source selection for templates/scenarios */}
              {(activeTab === 'templates' || activeTab === 'scenarios') && (
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text)',
                      marginBottom: '12px',
                    }}
                  >
                    Источник
                  </label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setSourceType('existing');
                        setSelectedItemId(null);
                      }}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: sourceType === 'existing' ? 'var(--primary)' : 'var(--surface)',
                        color: sourceType === 'existing' ? 'var(--text-on-primary)' : 'var(--text)',
                        border: sourceType === 'existing' ? 'none' : '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      Из моих {activeTab === 'templates' ? 'шаблонов' : 'сценариев'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSourceType('new')}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: sourceType === 'new' ? 'var(--primary)' : 'var(--surface)',
                        color: sourceType === 'new' ? 'var(--text-on-primary)' : 'var(--text)',
                        border: sourceType === 'new' ? 'none' : '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      Создать новый
                    </button>
                  </div>
                </div>
              )}

              {/* Select existing item */}
              {(activeTab === 'templates' || activeTab === 'scenarios') &&
                sourceType === 'existing' && (
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text)',
                        marginBottom: '8px',
                      }}
                    >
                      Выберите {activeTab === 'templates' ? 'шаблон' : 'сценарий'}
                    </label>
                    {isLoading ? (
                      <div
                        style={{ padding: '12px', color: 'var(--text-muted)', textAlign: 'center' }}
                      >
                        Загрузка...
                      </div>
                    ) : (
                      <>
                        <select
                          className="marketplace-select"
                          required
                          value={selectedItemId || ''}
                          onChange={e => setSelectedItemId(Number(e.target.value))}
                          style={{
                            width: '100%',
                            padding: '12px',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                            fontSize: '14px',
                            color: 'var(--text)',
                          }}
                        >
                          <option value="">Выберите из списка...</option>
                          {(activeTab === 'templates' ? myTemplates : myScenarios).map(item => (
                            <option key={item.id} value={item.id}>
                              {item.title || item.name || `ID: ${item.id}`}
                            </option>
                          ))}
                        </select>
                        {(activeTab === 'templates' ? myTemplates : myScenarios).length === 0 && (
                          <p
                            style={{
                              fontSize: '12px',
                              color: 'var(--text-muted)',
                              marginTop: '8px',
                            }}
                          >
                            У вас пока нет {activeTab === 'templates' ? 'шаблонов' : 'сценариев'}.
                            Создайте сначала в разделе "Мои боты" или "Сценарии".
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

              {/* Fields for existing items */}
              {(activeTab === 'templates' || activeTab === 'scenarios') &&
                sourceType === 'existing' &&
                selectedItemId && (
                  <>
                    {/* Title for existing items */}
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--text)',
                          marginBottom: '8px',
                        }}
                      >
                        Название для маркетплейса
                      </label>
                      <input
                        type="text"
                        name="title"
                        required
                        defaultValue={
                          activeTab === 'templates'
                            ? myTemplates.find(t => t.id === selectedItemId)?.title || ''
                            : myScenarios.find(s => s.id === selectedItemId)?.title || ''
                        }
                        placeholder="Название товара"
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '14px',
                          color: 'var(--text)',
                        }}
                      />
                    </div>

                    {/* Description for existing items */}
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--text)',
                          marginBottom: '8px',
                        }}
                      >
                        Описание для маркетплейса
                      </label>
                      <textarea
                        name="description"
                        required
                        rows={5}
                        defaultValue={
                          activeTab === 'templates'
                            ? myTemplates.find(t => t.id === selectedItemId)?.description || ''
                            : myScenarios.find(s => s.id === selectedItemId)?.description || ''
                        }
                        placeholder="Описание товара"
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '14px',
                          color: 'var(--text)',
                          resize: 'vertical',
                        }}
                      />
                    </div>

                    {/* Price for existing items */}
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--text)',
                          marginBottom: '8px',
                        }}
                      >
                        Цена (₽)
                      </label>
                      <input
                        type="number"
                        name="price"
                        min="0"
                        placeholder="0 = бесплатно"
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '14px',
                          color: 'var(--text)',
                        }}
                      />
                    </div>

                    {/* Category for existing items */}
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--text)',
                          marginBottom: '8px',
                        }}
                      >
                        Категория
                      </label>
                      <select
                        name="category"
                        className="marketplace-select"
                        required
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '14px',
                          color: 'var(--text)',
                        }}
                      >
                        <option value="">Выберите категорию</option>
                        <option value="ecommerce">E-commerce</option>
                        <option value="support">Поддержка</option>
                        <option value="automation">Автоматизация</option>
                        <option value="marketing">Маркетинг</option>
                        <option value="other">Другое</option>
                      </select>
                    </div>

                    {/* Tags for existing items */}
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: 'var(--text)',
                          marginBottom: '8px',
                        }}
                      >
                        Теги (через запятую)
                      </label>
                      <input
                        type="text"
                        name="tags"
                        placeholder="магазин, оплата, корзина"
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '14px',
                          color: 'var(--text)',
                        }}
                      />
                    </div>

                    {/* Additional description for existing items */}
                    <div>
                      <p
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          marginBottom: '8px',
                        }}
                      >
                        💡 При необходимости вы можете добавить дополнительное описание для
                        маркетплейса
                      </p>
                      <textarea
                        name="additional_description"
                        rows={3}
                        placeholder="Дополнительное описание для покупателей (необязательно)"
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '14px',
                          color: 'var(--text)',
                          resize: 'vertical',
                        }}
                      />
                    </div>
                  </>
                )}

              {/* Title - only for new items or customers/freelancers */}
              {(((activeTab === 'templates' || activeTab === 'scenarios') &&
                sourceType === 'new') ||
                activeTab === 'customers' ||
                activeTab === 'freelancers') && (
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text)',
                      marginBottom: '8px',
                    }}
                  >
                    {activeTab === 'freelancers' ? 'Специализация' : 'Название'}
                  </label>
                  <input
                    type="text"
                    name="title"
                    required
                    placeholder={
                      activeTab === 'templates'
                        ? 'Например: Готовый бот для магазина'
                        : activeTab === 'scenarios'
                          ? 'Например: Сценарий приема заказов'
                          : activeTab === 'customers'
                            ? 'Например: Нужен бот для автосалона'
                            : 'Например: Разработчик Telegram ботов'
                    }
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: 'var(--text)',
                    }}
                  />
                </div>
              )}

              {/* Description - only for new items or customers/freelancers */}
              {(((activeTab === 'templates' || activeTab === 'scenarios') &&
                sourceType === 'new') ||
                activeTab === 'customers' ||
                activeTab === 'freelancers') && (
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text)',
                      marginBottom: '8px',
                    }}
                  >
                    Описание
                  </label>
                  <textarea
                    name="description"
                    required
                    rows={5}
                    placeholder="Детальное описание..."
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: 'var(--text)',
                      resize: 'vertical',
                    }}
                  />
                </div>
              )}

              {/* Price / Budget - only for new items or customers/freelancers */}
              {(((activeTab === 'templates' || activeTab === 'scenarios') &&
                sourceType === 'new') ||
                activeTab === 'customers' ||
                activeTab === 'freelancers') &&
                (activeTab === 'templates' ||
                  activeTab === 'scenarios' ||
                  activeTab === 'customers') && (
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text)',
                        marginBottom: '8px',
                      }}
                    >
                      {activeTab === 'customers' ? 'Бюджет' : 'Цена (₽)'}
                    </label>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <input
                        type="number"
                        name={activeTab === 'customers' ? 'budget_min' : 'price'}
                        min="0"
                        placeholder={activeTab === 'customers' ? 'От' : '0 = бесплатно'}
                        style={{
                          flex: 1,
                          padding: '12px',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          fontSize: '14px',
                          color: 'var(--text)',
                        }}
                      />
                      {activeTab === 'customers' && (
                        <>
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                          <input
                            type="number"
                            name="budget_max"
                            min="0"
                            placeholder="До"
                            style={{
                              flex: 1,
                              padding: '12px',
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              fontSize: '14px',
                              color: 'var(--text)',
                            }}
                          />
                        </>
                      )}
                    </div>
                  </div>
                )}

              {/* Hourly rate for freelancers */}
              {activeTab === 'freelancers' && (
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: 'var(--text)',
                      marginBottom: '8px',
                    }}
                  >
                    Стоимость (₽/час) - необязательно
                  </label>
                  <input
                    type="number"
                    name="hourly_rate"
                    min="0"
                    placeholder="Например: 2000"
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: 'var(--text)',
                    }}
                  />
                </div>
              )}

              {/* Category and Tags - only for new items or customers/freelancers */}
              {(((activeTab === 'templates' || activeTab === 'scenarios') &&
                sourceType === 'new') ||
                activeTab === 'customers' ||
                activeTab === 'freelancers') && (
                <>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text)',
                        marginBottom: '8px',
                      }}
                    >
                      Категория
                    </label>
                    <select
                      name="category"
                      className="marketplace-select"
                      required
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '14px',
                        color: 'var(--text)',
                      }}
                    >
                      <option value="">Выберите категорию</option>
                      <option value="ecommerce">E-commerce</option>
                      <option value="support">Поддержка</option>
                      <option value="automation">Автоматизация</option>
                      <option value="marketing">Маркетинг</option>
                      <option value="other">Другое</option>
                    </select>
                  </div>

                  {/* Tags */}
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text)',
                        marginBottom: '8px',
                      }}
                    >
                      Теги (через запятую)
                    </label>
                    <input
                      type="text"
                      name={
                        activeTab === 'customers' || activeTab === 'freelancers' ? 'skills' : 'tags'
                      }
                      placeholder={
                        activeTab === 'customers' || activeTab === 'freelancers'
                          ? 'python, telegram, fastapi'
                          : 'магазин, оплата, корзина'
                      }
                      style={{
                        width: '100%',
                        padding: '12px',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        fontSize: '14px',
                        color: 'var(--text)',
                      }}
                    />
                  </div>
                </>
              )}

              {/* Notice */}
              <div
                style={{
                  padding: '16px',
                  background: 'rgba(255, 210, 76, 0.1)',
                  border: '1px solid var(--primary)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: 'var(--text-muted)',
                }}
              >
                ℹ️ <strong>Важно:</strong> Платформа не проводит денежные операции. Все расчеты
                между пользователями происходят напрямую вне платформы.
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{
                    flex: 1,
                    padding: '14px',
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  style={{
                    flex: 1,
                    padding: '14px',
                    background: isSubmitting ? 'var(--surface)' : 'var(--primary)',
                    color: isSubmitting ? 'var(--text-muted)' : 'var(--text-on-primary)',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: 600,
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    opacity: isSubmitting ? 0.6 : 1,
                  }}
                >
                  {isSubmitting ? 'Публикация...' : 'Опубликовать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
