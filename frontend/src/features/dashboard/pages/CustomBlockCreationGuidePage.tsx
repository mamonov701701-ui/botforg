import React from 'react';
import { Link } from 'react-router-dom';
import DashboardPage from '../components/DashboardPage';
import Card from '../components/Card';
import {
  CUSTOM_BLOCK_LIFECYCLE_FACTS,
  CUSTOM_BLOCK_WIZARD_STEPS,
} from '../blockLibrary/customBlockWizardContent';

export default function CustomBlockCreationGuidePage() {
  return (
    <DashboardPage
      title="Как создать свой блок"
      subtitle="Пошаговая инструкция использует те же правила и примеры, что мастер создания."
    >
      <div className="mx-auto max-w-4xl space-y-5">
        <Card>
          <h2 className="text-lg font-semibold">Что такое кастомный блок</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            Это ваша версионируемая заготовка шага сценария. На текущем этапе безопасно
            поддерживается исполняемый тип «Сообщение»: он показывает настроенный текст и передаёт
            выполнение дальше. Системные блоки остаются под управлением кода платформы.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-[var(--text-muted)]">
            {CUSTOM_BLOCK_LIFECYCLE_FACTS.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
        {CUSTOM_BLOCK_WIZARD_STEPS.map((step, index) => (
          <Card key={step.id}>
            <p className="text-xs text-[var(--accent)]">
              Шаг {index + 1} из {CUSTOM_BLOCK_WIZARD_STEPS.length}
            </p>
            <h2 className="mt-1 text-lg font-semibold">{step.title}</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">{step.explanation}</p>
            <p className="mt-3 text-sm">
              <strong>Зачем:</strong> {step.why}
            </p>
            <p className="mt-2 text-sm">
              <strong>Пример:</strong> {step.example}
            </p>
            <p className="mt-2 text-sm text-amber-400">
              <strong>Типичная ошибка:</strong> {step.commonMistake}
            </p>
          </Card>
        ))}
        <Card>
          <h2 className="text-lg font-semibold">Проверка и ошибки</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            При критической ошибке публикация запрещена. Исправьте обязательные поля, ключи
            параметров, соединения, пример и инструкцию. После публикации изменения делаются только
            через новую версию.
          </p>
          <Link
            to="/dashboard/block-library/create"
            className="mt-4 inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 font-semibold text-[#0A1B3D]"
          >
            Перейти к мастеру
          </Link>
        </Card>
      </div>
    </DashboardPage>
  );
}
