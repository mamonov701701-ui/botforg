import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  FolderOpen,
  FileText,
  Bot as BotIcon,
  Library,
  Layers,
  Edit,
  MoreVertical,
  Trash2,
  X,
} from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import { useAuthStore } from '../../../stores/authStore';
import { hasAccessToAction } from '../../../constants/roles';
import { getBots, type Bot } from '../../../api/bot';
import {
  getMyScenarios,
  updateScenario,
  deleteScenario,
  type Scenario,
  type ScenarioUpdate,
} from '../../../api/scenarios';
import { toast } from '../../../utils/toast';

// Модальное окно редактирования сценария
interface EditScenarioModalProps {
  scenario: Scenario;
  onClose: () => void;
  onSave: (scenarioId: number, data: ScenarioUpdate) => Promise<void>;
}

function EditScenarioModal({ scenario, onClose, onSave }: EditScenarioModalProps) {
  const [name, setName] = React.useState(scenario.name);
  const [description, setDescription] = React.useState(scenario.description || '');
  const [category, setCategory] = React.useState(scenario.category || '');
  const [saving, setSaving] = React.useState(false);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Название сценария обязательно');
      return;
    }
    try {
      setSaving(true);
      await onSave(scenario.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        category: category.trim() || undefined,
      });
      onClose();
    } catch (error: any) {
      toast.error(error.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #1a1a2e 100%)',
          borderRadius: '16px',
          padding: '24px',
          width: '100%',
          maxWidth: '480px',
          border: '2px solid var(--primary)',
          boxShadow: '0 8px 32px rgba(255, 210, 76, 0.15), 0 0 0 1px rgba(255, 210, 76, 0.1)',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <div
            style={{
              padding: '12px',
              background: 'rgba(255, 210, 76, 0.15)',
              borderRadius: '12px',
            }}
          >
            <FileText size={24} style={{ color: 'var(--primary)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--text)' }}>
              Редактировать сценарий
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '36px',
              height: '36px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255, 210, 76, 0.1)';
              e.currentTarget.style.borderColor = 'var(--primary)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <X size={18} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              marginBottom: '8px',
              color: 'var(--text)',
            }}
          >
            Название *
          </label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Название сценария"
            style={{
              width: '100%',
              padding: '12px 14px',
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(255, 210, 76, 0.2)',
              borderRadius: '8px',
              color: 'var(--text)',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255, 210, 76, 0.2)')}
          />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              marginBottom: '8px',
              color: 'var(--text)',
            }}
          >
            Описание
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Описание сценария (необязательно)"
            style={{
              width: '100%',
              padding: '12px 14px',
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(255, 210, 76, 0.2)',
              borderRadius: '8px',
              color: 'var(--text)',
              fontSize: '14px',
              resize: 'vertical',
              minHeight: '100px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255, 210, 76, 0.2)')}
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 500,
              marginBottom: '8px',
              color: 'var(--text)',
            }}
          >
            Категория
          </label>
          <input
            type="text"
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder="Например: продажи, поддержка, маркетинг"
            style={{
              width: '100%',
              padding: '12px 14px',
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(255, 210, 76, 0.2)',
              borderRadius: '8px',
              color: 'var(--text)',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--primary)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255, 210, 76, 0.2)')}
          />
        </div>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '12px 24px',
              background: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid rgba(255, 210, 76, 0.2)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--primary)';
              e.currentTarget.style.color = 'var(--text)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(255, 210, 76, 0.2)';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{
              padding: '12px 24px',
              background: 'var(--primary)',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              opacity: saving || !name.trim() ? 0.6 : 1,
            }}
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ScenariosPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [bots, setBots] = useState<Bot[]>([]);
  const [allScenarios, setAllScenarios] = useState<Scenario[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'bot' | 'library'>('all');
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  // Загружаем все сценарии пользователя
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [scenariosData, botsData] = await Promise.all([getMyScenarios(), getBots()]);
        setAllScenarios(scenariosData);
        setBots(botsData.items);
      } catch (error) {
        console.error('Failed to load scenarios:', error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const canCreate = hasAccessToAction(user?.role, 'bot_create');

  // Фильтрация сценариев
  const filteredScenarios = allScenarios.filter(scenario => {
    // Поиск
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        scenario.name.toLowerCase().includes(query) ||
        (scenario.description && scenario.description.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }

    // Фильтр по типу
    if (filter === 'bot') return scenario.bot_id !== null;
    if (filter === 'library') return scenario.is_library;

    return true;
  });

  // Получить название бота по ID
  const getBotName = (botId: number | null) => {
    if (!botId) return null;
    const bot = bots.find(b => b.id === botId);
    return bot?.title || `Бот #${botId}`;
  };

  const handleSaveScenario = async (scenarioId: number, data: ScenarioUpdate) => {
    const updated = await updateScenario(scenarioId, data);
    setAllScenarios(prev => prev.map(s => (s.id === scenarioId ? { ...s, ...updated } : s)));
    toast.success('Сценарий обновлён');
  };

  const handleDeleteScenario = async (scenarioId: number) => {
    const scenario = allScenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    if (window.confirm(`Удалить сценарий "${scenario.name}"? Это действие необратимо.`)) {
      try {
        await deleteScenario(scenarioId);
        setAllScenarios(prev => prev.filter(s => s.id !== scenarioId));
        toast.success('Сценарий удалён');
      } catch (error: any) {
        toast.error(error.message || 'Не удалось удалить сценарий');
      }
    }
  };

  const canEdit = hasAccessToAction(user?.role, 'bot_edit');

  if (loading) {
    return (
      <DashboardPage title="Сценарии" subtitle="Загрузка...">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              border: '4px solid var(--border)',
              borderTop: '4px solid var(--primary)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
        </div>
      </DashboardPage>
    );
  }

  return (
    <DashboardPage title="Мои сценарии" subtitle={`Всего сценариев: ${allScenarios.length}`}>
      {/* Фильтры и поиск */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          marginBottom: '24px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        {/* Поиск */}
        <div style={{ position: 'relative', flex: '1', minWidth: '200px', maxWidth: '400px' }}>
          <Search
            size={20}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            type="text"
            placeholder="Поиск сценариев..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 12px 12px 44px',
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              color: 'var(--text)',
              fontSize: '14px',
            }}
          />
        </div>

        {/* Фильтр по типу */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { key: 'all', label: 'Все', icon: Layers, count: allScenarios.length },
            {
              key: 'bot',
              label: 'В ботах',
              icon: BotIcon,
              count: allScenarios.filter(s => s.bot_id !== null).length,
            },
            {
              key: 'library',
              label: 'Библиотека',
              icon: Library,
              count: allScenarios.filter(s => s.is_library).length,
            },
          ].map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              onClick={() => setFilter(key as 'all' | 'bot' | 'library')}
              style={{
                padding: '8px 16px',
                background: filter === key ? 'rgba(255, 210, 76, 0.2)' : 'var(--card)',
                color: filter === key ? 'var(--primary)' : 'var(--text-muted)',
                border: filter === key ? '1px solid var(--primary)' : '1px solid var(--border)',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s',
              }}
            >
              <Icon size={16} />
              {label}
              <span
                style={{
                  background: filter === key ? 'var(--primary)' : 'var(--border)',
                  color: filter === key ? '#000' : 'var(--text-muted)',
                  padding: '2px 6px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Список сценариев */}
      {filteredScenarios.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={filter === 'library' ? 'Библиотека пуста' : 'Сценариев не найдено'}
          description={
            filter === 'library'
              ? "Сохраните сценарий в библиотеку из редактора через меню 'Сохранить' → 'В библиотеку'"
              : searchQuery
                ? 'Попробуйте изменить поисковый запрос'
                : 'Создайте бота и добавьте в него сценарий'
          }
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '20px',
          }}
        >
          {filteredScenarios.map(scenario => (
            <Card
              key={scenario.id}
              hoverable
              style={{ position: 'relative', zIndex: menuOpenId === scenario.id ? 100 : 1 }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div
                    onClick={() =>
                      scenario.bot_id ? navigate(`/editor/${scenario.bot_id}`) : null
                    }
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '8px',
                      background: scenario.is_library
                        ? 'rgba(59, 130, 246, 0.1)'
                        : 'rgba(255, 210, 76, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      cursor: scenario.bot_id ? 'pointer' : 'default',
                    }}
                  >
                    {scenario.is_library ? (
                      <Library size={24} style={{ color: '#3b82f6' }} />
                    ) : (
                      <FileText size={24} style={{ color: 'var(--primary)' }} />
                    )}
                  </div>
                  <div
                    onClick={() =>
                      scenario.bot_id ? navigate(`/editor/${scenario.bot_id}`) : null
                    }
                    style={{
                      flex: 1,
                      minWidth: 0,
                      cursor: scenario.bot_id ? 'pointer' : 'default',
                    }}
                  >
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
                      {scenario.name}
                    </h3>
                    {scenario.bot_id && (
                      <p
                        style={{
                          fontSize: '12px',
                          color: 'var(--text-muted)',
                          margin: '0 0 4px 0',
                        }}
                      >
                        <BotIcon
                          size={12}
                          style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }}
                        />
                        {getBotName(scenario.bot_id)}
                      </p>
                    )}
                    {scenario.description && (
                      <p
                        style={{
                          fontSize: '13px',
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          margin: 0,
                        }}
                      >
                        {scenario.description}
                      </p>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {scenario.is_main && (
                    <span
                      style={{
                        padding: '4px 8px',
                        background: 'rgba(34, 197, 94, 0.2)',
                        color: '#22c55e',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      Главный
                    </span>
                  )}
                  {scenario.is_library && (
                    <span
                      style={{
                        padding: '4px 8px',
                        background: 'rgba(59, 130, 246, 0.2)',
                        color: '#3b82f6',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      Библиотека
                    </span>
                  )}
                  {scenario.is_standard && (
                    <span
                      style={{
                        padding: '4px 8px',
                        background: 'rgba(168, 85, 247, 0.2)',
                        color: '#a855f7',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      Стандартный
                    </span>
                  )}
                  {scenario.category && (
                    <span
                      style={{
                        padding: '4px 8px',
                        background: 'var(--card)',
                        color: 'var(--text-muted)',
                        borderRadius: '4px',
                        fontSize: '11px',
                      }}
                    >
                      {scenario.category}
                    </span>
                  )}
                </div>
              </div>

              {/* Кнопка меню действий */}
              {canEdit && (
                <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setMenuOpenId(menuOpenId === scenario.id ? null : scenario.id);
                    }}
                    style={{
                      width: '32px',
                      height: '32px',
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <MoreVertical size={16} style={{ color: 'var(--text-muted)' }} />
                  </button>

                  {menuOpenId === scenario.id && (
                    <>
                      <div
                        style={{ position: 'fixed', inset: 0, zIndex: 10 }}
                        onClick={() => setMenuOpenId(null)}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: '36px',
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          padding: '8px',
                          minWidth: '160px',
                          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                          zIndex: 20,
                        }}
                      >
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setEditingScenario(scenario);
                            setMenuOpenId(null);
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
                            color: 'var(--text)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Edit size={16} /> Редактировать
                        </button>
                        {scenario.bot_id && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              navigate(`/editor/${scenario.bot_id}`);
                              setMenuOpenId(null);
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
                              color: 'var(--text)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--card)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          >
                            <FileText size={16} /> Открыть в редакторе
                          </button>
                        )}
                        <div
                          style={{ height: '1px', background: 'var(--border)', margin: '8px 0' }}
                        />
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleDeleteScenario(scenario.id);
                            setMenuOpenId(null);
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
                            color: '#ef4444',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#ef444410')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Trash2 size={16} /> Удалить
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Модальное окно редактирования сценария */}
      {editingScenario && (
        <EditScenarioModal
          scenario={editingScenario}
          onClose={() => setEditingScenario(null)}
          onSave={handleSaveScenario}
        />
      )}
    </DashboardPage>
  );
}
