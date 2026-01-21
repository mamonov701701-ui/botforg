/**
 * Marketplace Page - Маркетплейс для шаблонов, сценариев, заказов и услуг
 */
import React, { useState, useEffect } from 'react';
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

type MarketTab = 'templates' | 'scenarios' | 'customers' | 'freelancers';

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
  const [activeTab, setActiveTab] = useState<MarketTab>('templates');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [sourceType, setSourceType] = useState<'new' | 'existing'>('existing');
  const [myTemplates, setMyTemplates] = useState<any[]>([]);
  const [myScenarios, setMyScenarios] = useState<any[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
  `;

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

  const renderProductCard = (item: MarketItem) => (
    <div
      key={item.id}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.2s',
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
            style={{
              padding: '10px 20px',
              background: 'var(--primary)',
              color: 'var(--text-on-primary)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Подробнее
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', paddingTop: '100px' }}>
      {/* CSS для темных select/option */}
      <style>{selectStyles}</style>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1
            style={{
              fontSize: '36px',
              fontWeight: 700,
              color: 'var(--text)',
              marginBottom: '8px',
            }}
          >
            Маркет
          </h1>
          <p style={{ fontSize: '16px', color: 'var(--text-muted)' }}>
            Покупайте и продавайте шаблоны, сценарии, размещайте заказы и находите исполнителей
          </p>
        </div>

        {/* Tabs and Content Container */}
        <div
          style={{
            background: 'rgba(22, 28, 36, 0.5)', // Темно-синий полупрозрачный
            borderRadius: '16px',
            padding: '24px',
            backdropFilter: 'blur(10px)',
          }}
        >
          {/* Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              borderBottom: '2px solid var(--border)',
              marginBottom: '32px',
            }}
          >
            <button
              onClick={() => setActiveTab('templates')}
              style={{
                padding: '12px 24px',
                background: activeTab === 'templates' ? 'rgba(255, 210, 76, 0.1)' : 'transparent',
                border: 'none',
                borderBottom:
                  activeTab === 'templates' ? '3px solid var(--primary)' : '3px solid transparent',
                color: activeTab === 'templates' ? 'var(--primary)' : 'var(--text-muted)',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <ShoppingCart size={18} style={{ display: 'inline', marginRight: '8px' }} />
              Шаблоны
            </button>
            <button
              onClick={() => setActiveTab('scenarios')}
              style={{
                padding: '12px 24px',
                background: activeTab === 'scenarios' ? 'rgba(255, 210, 76, 0.1)' : 'transparent',
                border: 'none',
                borderBottom:
                  activeTab === 'scenarios' ? '3px solid var(--primary)' : '3px solid transparent',
                color: activeTab === 'scenarios' ? 'var(--primary)' : 'var(--text-muted)',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <Briefcase size={18} style={{ display: 'inline', marginRight: '8px' }} />
              Сценарии
            </button>
            <button
              onClick={() => setActiveTab('customers')}
              style={{
                padding: '12px 24px',
                background: activeTab === 'customers' ? 'rgba(255, 210, 76, 0.1)' : 'transparent',
                border: 'none',
                borderBottom:
                  activeTab === 'customers' ? '3px solid var(--primary)' : '3px solid transparent',
                color: activeTab === 'customers' ? 'var(--primary)' : 'var(--text-muted)',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <DollarSign size={18} style={{ display: 'inline', marginRight: '8px' }} />
              Заказчики
            </button>
            <button
              onClick={() => setActiveTab('freelancers')}
              style={{
                padding: '12px 24px',
                background: activeTab === 'freelancers' ? 'rgba(255, 210, 76, 0.1)' : 'transparent',
                border: 'none',
                borderBottom:
                  activeTab === 'freelancers'
                    ? '3px solid var(--primary)'
                    : '3px solid transparent',
                color: activeTab === 'freelancers' ? 'var(--primary)' : 'var(--text-muted)',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <Users size={18} style={{ display: 'inline', marginRight: '8px' }} />
              Исполнители
            </button>
          </div>

          {/* Search and Filters */}
          <div style={{ marginBottom: '32px', display: 'flex', gap: '16px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '600px' }}>
              <Search
                size={20}
                style={{
                  position: 'absolute',
                  left: '16px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                placeholder="Поиск..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 16px 14px 48px',
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  fontSize: '15px',
                  color: 'var(--text)',
                }}
              />
            </div>

            {/* Create button */}
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                padding: '14px 24px',
                background: 'var(--primary)',
                color: 'var(--text-on-primary)',
                border: 'none',
                borderRadius: '12px',
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
              {activeTab === 'templates' && 'Разместить шаблон'}
              {activeTab === 'scenarios' && 'Разместить сценарий'}
              {activeTab === 'customers' && 'Создать заказ'}
              {activeTab === 'freelancers' && 'Стать исполнителем'}
            </button>
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
                {mockTemplates.map(renderProductCard)}
                {/* Empty state for demonstration */}
                <div
                  style={{
                    gridColumn: '1 / -1',
                    textAlign: 'center',
                    padding: '48px 24px',
                    color: 'var(--text-muted)',
                  }}
                >
                  <ShoppingCart size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                  <p>Скоро здесь появятся шаблоны от пользователей платформы</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'scenarios' && (
            <div
              style={{
                textAlign: 'center',
                padding: '64px 24px',
                color: 'var(--text-muted)',
              }}
            >
              <Briefcase size={64} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '8px' }}>
                Сценарии скоро появятся
              </h3>
              <p>Пользователи смогут продавать и покупать готовые сценарии для ботов</p>
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
        </div>
        {/* End of Tabs and Content Container */}
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
              onSubmit={e => {
                e.preventDefault();
                // TODO: Отправка формы
                alert('Функционал размещения будет реализован после создания backend API');
                setShowCreateModal(false);
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

              {/* Price for existing items */}
              {(activeTab === 'templates' || activeTab === 'scenarios') &&
                sourceType === 'existing' &&
                selectedItemId && (
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
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
                      💡 При необходимости вы можете добавить дополнительное описание для
                      маркетплейса
                    </p>
                    <textarea
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
                        marginTop: '8px',
                      }}
                    />
                  </div>
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
                  style={{
                    flex: 1,
                    padding: '14px',
                    background: 'var(--primary)',
                    color: 'var(--text-on-primary)',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Опубликовать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
