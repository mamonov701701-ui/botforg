import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, FolderOpen, FileText, Bot as BotIcon } from 'lucide-react';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import { useAuthStore } from '../../../stores/authStore';
import { hasAccessToAction } from '../../../constants/roles';
import { getBots, groupBotsByProject, getProjectName, type Bot } from '../../../api/bot';
import { getBotScenarios, getLibraryScenarios, type Scenario } from '../../../api/scenarios';
import { ROLE_NAMES } from '../../../constants/roles';

export default function ScenariosPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [bots, setBots] = useState<Bot[]>([]);
  const [projects, setProjects] = useState<ReturnType<typeof groupBotsByProject>>([]);
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryScenarios, setLibraryScenarios] = useState<Scenario[]>([]);

  // Загружаем боты и группируем по проектам
  useEffect(() => {
    async function loadBots() {
      try {
        setLoading(true);
        const botsData = await getBots();
        setBots(botsData.items);

        if (user) {
          const grouped = groupBotsByProject(botsData.items, user.id);
          setProjects(grouped);

          // Автоматически выбираем первый проект
          if (grouped.length > 0 && !selectedProject) {
            setSelectedProject(grouped[0].owner_id);
          }
        }
      } catch (error) {
        console.error('Failed to load bots:', error);
      } finally {
        setLoading(false);
      }
    }

    loadBots();
  }, [user, selectedProject]);

  // Загружаем сценарии выбранного проекта
  useEffect(() => {
    async function loadScenarios() {
      if (!selectedProject) return;

      try {
        const projectBots = projects.find(p => p.owner_id === selectedProject);
        if (!projectBots) return;

        // Загружаем сценарии для всех ботов проекта
        const allScenarios: Scenario[] = [];
        for (const bot of projectBots.bots) {
          try {
            const botScenarios = await getBotScenarios(bot.id);
            allScenarios.push(...botScenarios);
          } catch (error) {
            console.error(`Failed to load scenarios for bot ${bot.id}:`, error);
          }
        }

        setScenarios(allScenarios);
      } catch (error) {
        console.error('Failed to load scenarios:', error);
      }
    }

    loadScenarios();
  }, [selectedProject, projects]);

  // Загружаем сценарии из библиотеки
  useEffect(() => {
    async function loadLibraryScenarios() {
      if (!showLibrary) return;

      try {
        const library = await getLibraryScenarios();
        setLibraryScenarios(library);
      } catch (error) {
        console.error('Failed to load library scenarios:', error);
      }
    }

    loadLibraryScenarios();
  }, [showLibrary]);

  const canCreate = hasAccessToAction(user?.role, 'bot_create');
  const currentProject = projects.find(p => p.owner_id === selectedProject);
  const displayedScenarios = showLibrary ? libraryScenarios : scenarios;

  const filteredScenarios = displayedScenarios.filter(scenario => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      scenario.name.toLowerCase().includes(query) ||
      (scenario.description && scenario.description.toLowerCase().includes(query))
    );
  });

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
    <DashboardPage
      title="Сценарии"
      subtitle={
        showLibrary
          ? `Библиотека сценариев (${filteredScenarios.length})`
          : currentProject
            ? `${getProjectName(currentProject)} - ${filteredScenarios.length} сценариев`
            : 'Выберите проект'
      }
      actions={
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={() => setShowLibrary(!showLibrary)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              background: showLibrary ? 'var(--primary)' : 'var(--card)',
              color: showLibrary ? '#000' : 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <FolderOpen size={16} />
            {showLibrary ? 'Сценарии проектов' : 'Библиотека'}
          </button>
        </div>
      }
    >
      {/* Выбор проекта */}
      {!showLibrary && projects.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {projects.map(project => (
              <button
                key={project.owner_id}
                onClick={() => setSelectedProject(project.owner_id)}
                style={{
                  padding: '12px 20px',
                  background:
                    selectedProject === project.owner_id ? 'var(--primary)' : 'var(--card)',
                  color: selectedProject === project.owner_id ? '#000' : 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <BotIcon size={16} />
                {getProjectName(project)}
                {!project.is_own && project.team_role && (
                  <span style={{ fontSize: '12px', opacity: 0.7 }}>
                    ({ROLE_NAMES[project.team_role as keyof typeof ROLE_NAMES] || project.team_role}
                    )
                  </span>
                )}
                <span style={{ fontSize: '12px', opacity: 0.7 }}>
                  ({project.bots.length} ботов)
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Поиск */}
      <div style={{ marginBottom: '24px' }}>
        <div
          style={{
            position: 'relative',
            maxWidth: '400px',
          }}
        >
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
      </div>

      {/* Список сценариев */}
      {filteredScenarios.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={showLibrary ? 'Библиотека пуста' : 'Нет сценариев'}
          description={
            showLibrary
              ? 'В библиотеке пока нет доступных сценариев'
              : selectedProject
                ? 'В этом проекте пока нет сценариев'
                : 'Выберите проект для просмотра сценариев'
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
          {filteredScenarios.map(scenario => (
            <Card
              key={scenario.id}
              hoverable
              onClick={() => navigate(`/editor/${scenario.bot_id || scenario.id}`)}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '8px',
                      background: 'rgba(255, 210, 76, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <FileText size={24} style={{ color: 'var(--primary)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
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
                        background: 'rgba(255, 210, 76, 0.2)',
                        color: 'var(--primary)',
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
            </Card>
          ))}
        </div>
      )}
    </DashboardPage>
  );
}
