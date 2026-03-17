import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBots, type Bot } from '../../api/bot';
import { getBotScenarios, createScenario, type Scenario } from '../../api/scenarios';
import { useEditorStore } from '../../stores/editorStore';

/**
 * Быстрый вход в редактор:
 * - если есть боты и сценарии → сразу открываем главный/последний сценарий в редакторе
 * - если ботов нет → создаём первого "чернового" бота и первый сценарий, затем открываем редактор
 *
 * Используется для маршрута /editor, на который ведёт кнопка "Редактор" в шапке.
 */
export default function QuickEditorEntry() {
  const navigate = useNavigate();
  const { showToast } = useEditorStore();

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        // 1. Загружаем список ботов пользователя
        const botsResponse = await getBots();
        const bots: Bot[] = botsResponse.items || [];

        // Если уже отменили (размортили компонент) — выходим
        if (cancelled) return;

        if (bots.length === 0) {
          // Ботов нет — создаём первого "чернового" бота и сценарий
          showToast('Создаём первого бота и сценарий…', 'info');

          // backend‑логика создания бота ещё не вынесена в общий API,
          // поэтому для первого запуска продолжаем использовать путь через "Мои боты".
          navigate('/dashboard/bots');
          return;
        }

        // 2. Выбираем бота:
        // - сначала с is_main === true, если есть
        // - иначе первого по списку
        const mainBot = bots.find(b => (b as any).is_main) || bots[0];

        // 3. Загружаем сценарии выбранного бота
        const scenarios: Scenario[] = await getBotScenarios(mainBot.id);
        if (cancelled) return;

        if (scenarios.length === 0) {
          // Сценариев нет — создаём первый пустой сценарий и переходим в редактор
          const firstScenario = await createScenario({
            name: 'Новый сценарий',
            icon: 'FileText',
            content: { nodes: [], edges: [] },
            bot_id: mainBot.id,
            is_main: true,
          });
          if (cancelled) return;
          showToast('Создан первый сценарий. Открываем редактор…', 'success');
          navigate(`/editor/${firstScenario.bot_id}`);
          return;
        }

        // 4. Выбираем сценарий:
        // - сначала is_main === true,
        // - иначе последний обновлённый.
        const mainScenario =
          scenarios.find(s => s.is_main) ||
          [...scenarios].sort((a, b) => a.updated_at.localeCompare(b.updated_at)).pop()!;

        navigate(`/editor/${mainScenario.bot_id}`);
      } catch (error: any) {
        console.error('[QuickEditorEntry] failed:', error);
        showToast(
          error?.message || 'Не удалось открыть редактор. Попробуйте через раздел "Мои боты".',
          'error'
        );
        navigate('/dashboard/bots');
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [navigate, showToast]);

  // Короткий экран загрузки, пока подбираем или создаём сценарий
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16,
        color: '#e5e7eb',
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '4px solid rgba(148, 163, 184, 0.4)',
          borderTopColor: '#facc15',
          animation: 'spin 1s linear infinite',
        }}
      />
      <div style={{ fontSize: 18, fontWeight: 600 }}>Открываем редактор…</div>
      <div style={{ fontSize: 13, opacity: 0.8, maxWidth: 360, textAlign: 'center' }}>
        Подбираем ваш бот и сценарий. Если это первый запуск, поможем создать стартовый сценарий.
      </div>
      <style>
        {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
      </style>
    </div>
  );
}
