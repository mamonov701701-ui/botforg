import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Star,
  Plus,
  Upload,
  Copy,
  Download,
  Heart,
  Trash2,
  ShoppingCart,
} from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import { useAuthStore } from '../../../stores/authStore';
import { hasAccessToAction, getAccessDeniedMessage } from '../../../constants/roles';
import { AccessLocked } from '../../../components/AccessLocked';
import DemoModeBanner from '../../../components/DemoModeBanner';

type TabType = 'my' | 'purchased' | 'favorites';

interface Template {
  id: string;
  name: string;
  category: string;
  rating: number;
  reviewsCount: number;
  updatedAt: Date;
  preview?: string;
  isPurchased?: boolean;
  isFavorite?: boolean;
}

interface TemplateCardProps {
  template: Template;
  onAction: (action: string, templateId: string) => void;
}

function TemplateCard({ template, onAction }: TemplateCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { user } = useAuthStore();

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const canEdit = hasAccessToAction(user?.role, 'template_edit');
  const canDelete = hasAccessToAction(user?.role, 'template_delete');

  return (
    <Card hoverable onClick={() => onAction('open', template.id)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Preview */}
        <div
          style={{
            width: '100%',
            height: '160px',
            borderRadius: '8px',
            background: 'rgba(255, 210, 76, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <FileText size={48} style={{ color: 'var(--primary)' }} />
          {template.isFavorite && (
            <div
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'rgba(255, 210, 76, 0.2)',
                borderRadius: '4px',
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Star size={14} style={{ color: 'var(--primary)', fill: 'var(--primary)' }} />
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 600,
              marginBottom: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {template.name}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            {template.category}
          </p>

          {/* Rating & Date */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Star size={14} style={{ color: 'var(--primary)', fill: 'var(--primary)' }} />
              <span>{template.rating.toFixed(1)}</span>
              <span style={{ color: 'var(--text-muted)' }}>({template.reviewsCount})</span>
            </div>
            <span style={{ color: 'var(--text-muted)' }}>{formatDate(template.updatedAt)}</span>
          </div>
        </div>

        {/* Actions */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            paddingTop: '8px',
            borderTop: '1px solid var(--border)',
          }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => onAction('open', template.id)}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: 'var(--primary)',
              color: '#000',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--primary-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary)')}
          >
            Открыть
          </button>
          {canEdit && (
            <button
              onClick={() => onAction('createBot', template.id)}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                color: 'var(--text)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Создать бота
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              style={{
                width: '36px',
                height: '36px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              ⋮
            </button>

            {menuOpen && (
              <>
                <div
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 10,
                  }}
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    bottom: '40px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '8px',
                    minWidth: '160px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    zIndex: 20,
                  }}
                >
                  {canEdit && (
                    <>
                      <button
                        onClick={() => {
                          onAction('duplicate', template.id);
                          setMenuOpen(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          background: 'transparent',
                          border: 'none',
                          borderRadius: '4px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: '14px',
                          transition: 'background 0.2s',
                          color: 'var(--text)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <Copy size={16} /> Дублировать
                      </button>
                      <button
                        onClick={() => {
                          onAction('export', template.id);
                          setMenuOpen(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          background: 'transparent',
                          border: 'none',
                          borderRadius: '4px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: '14px',
                          transition: 'background 0.2s',
                          color: 'var(--text)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <Download size={16} /> Экспорт
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      onAction('favorite', template.id);
                      setMenuOpen(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '14px',
                      transition: 'background 0.2s',
                      color: 'var(--text)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Heart
                      size={16}
                      style={{
                        fill: template.isFavorite ? 'var(--primary)' : 'none',
                        color: template.isFavorite ? 'var(--primary)' : 'currentColor',
                      }}
                    />
                    {template.isFavorite ? 'Убрать из избранного' : 'В избранное'}
                  </button>
                  {canDelete && (
                    <>
                      <div
                        style={{
                          height: '1px',
                          background: 'var(--border)',
                          margin: '8px 0',
                        }}
                      />
                      <button
                        onClick={() => {
                          onAction('delete', template.id);
                          setMenuOpen(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          background: 'transparent',
                          border: 'none',
                          borderRadius: '4px',
                          textAlign: 'left',
                          cursor: 'pointer',
                          fontSize: '14px',
                          transition: 'background 0.2s',
                          color: 'var(--error)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#ef444410')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <Trash2 size={16} /> Удалить
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function TemplatesPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Моковые данные
  const mockTemplates: Template[] = [
    {
      id: '1',
      name: 'Бот-консультант',
      category: 'Поддержка',
      rating: 4.8,
      reviewsCount: 24,
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
      isFavorite: true,
    },
    {
      id: '2',
      name: 'Бронирование',
      category: 'Бизнес',
      rating: 4.5,
      reviewsCount: 12,
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5),
      isPurchased: true,
    },
    {
      id: '3',
      name: 'Квиз для лидов',
      category: 'Маркетинг',
      rating: 4.9,
      reviewsCount: 45,
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    },
  ];

  // Фильтрация по вкладкам
  let displayTemplates = mockTemplates;
  if (activeTab === 'purchased') {
    displayTemplates = mockTemplates.filter(t => t.isPurchased);
  } else if (activeTab === 'favorites') {
    displayTemplates = mockTemplates.filter(t => t.isFavorite);
  }

  // Дополнительные фильтры
  displayTemplates = displayTemplates.filter(template => {
    if (categoryFilter !== 'all' && template.category !== categoryFilter) return false;
    if (searchQuery && !template.name.toLowerCase().includes(searchQuery.toLowerCase()))
      return false;
    return true;
  });

  const handleTemplateAction = (action: string, templateId: string) => {
    console.log(`Action: ${action}, Template ID: ${templateId}`);
    // TODO: Реализовать действия
  };

  const handleImport = () => {
    // TODO: Реализовать импорт
    console.log('Import template');
  };

  const canCreate = hasAccessToAction(user?.role, 'template_create');

  const tabs = [
    { id: 'my' as TabType, label: 'Мои', count: mockTemplates.length },
    {
      id: 'purchased' as TabType,
      label: 'Купленные',
      count: mockTemplates.filter(t => t.isPurchased).length,
    },
    {
      id: 'favorites' as TabType,
      label: 'Избранные',
      count: mockTemplates.filter(t => t.isFavorite).length,
    },
  ];

  return (
    <DashboardPage
      title="Шаблоны"
      subtitle="Управление шаблонами ботов"
      actions={
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={handleImport}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              color: 'var(--text)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <Upload size={18} />
            Импорт
          </button>
          <AccessLocked
            hasAccess={canCreate}
            actionKey="template_create"
            onClick={() => navigate('/dashboard/templates/new')}
          >
            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                background: 'var(--primary)',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--primary-hover)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--primary)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <Plus size={18} />
              Создать шаблон
            </button>
          </AccessLocked>
        </div>
      }
    >
      {!canCreate && (
        <div style={{ marginBottom: '20px' }}>
          <DemoModeBanner
            message="Просмотр без возможности создания шаблонов"
            upgradeUrl="/pricing"
          />
        </div>
      )}
      {/* Вкладки */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom:
                activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === tab.id ? 'var(--primary)' : 'var(--text)',
              fontSize: '15px',
              fontWeight: activeTab === tab.id ? 600 : 400,
              cursor: 'pointer',
              transition: 'all 0.2s',
              marginBottom: '-1px',
            }}
          >
            {tab.label} {tab.count > 0 && `(${tab.count})`}
          </button>
        ))}
      </div>

      {/* Фильтры */}
      <Card style={{ marginBottom: '24px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
          }}
        >
          <input
            type="text"
            placeholder="Поиск шаблонов..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              padding: '10px 14px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '14px',
              color: 'var(--text)',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{
              padding: '10px 14px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '14px',
              color: 'var(--text)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="all">Все категории</option>
            <option value="Поддержка">Поддержка</option>
            <option value="Бизнес">Бизнес</option>
            <option value="Маркетинг">Маркетинг</option>
          </select>
        </div>
      </Card>

      {/* Список шаблонов */}
      {displayTemplates.length === 0 ? (
        <EmptyState
          icon="📋"
          title={
            activeTab === 'my'
              ? 'Шаблонов пока нет'
              : activeTab === 'purchased'
                ? 'Нет купленных шаблонов'
                : 'Нет избранных шаблонов'
          }
          description={
            activeTab === 'my'
              ? 'Создайте свой первый шаблон или перейдите в маркетплейс'
              : activeTab === 'purchased'
                ? 'Приобретите шаблоны в маркетплейсе'
                : 'Добавьте шаблоны в избранное'
          }
          action={
            activeTab === 'my'
              ? {
                  label: 'Создать шаблон',
                  onClick: canCreate ? () => navigate('/dashboard/templates/new') : undefined,
                  disabled: !canCreate,
                  disabledMessage: getAccessDeniedMessage('template_create'),
                }
              : undefined
          }
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px',
          }}
        >
          {displayTemplates.map(template => (
            <TemplateCard key={template.id} template={template} onAction={handleTemplateAction} />
          ))}
        </div>
      )}

      {/* Ссылка на маркетплейс */}
      <div style={{ marginTop: '32px', textAlign: 'center' }}>
        <button
          onClick={() => navigate('/market')}
          style={{
            padding: '12px 32px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            justifyContent: 'center',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--surface)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'var(--card)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <ShoppingCart size={18} /> Перейти в маркетплейс
        </button>
      </div>
    </DashboardPage>
  );
}
