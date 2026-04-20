import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Публичный продуктовый материал: Возможности → CRM (уровень 1).
 */
export default function CrmPublicTab() {
  return (
    <div className="space-y-8 text-[var(--text-muted)] max-w-3xl">
      <section>
        <h2 className="text-xl font-semibold text-[var(--text)] mb-3">Что такое CRM в BotForg</h2>
        <p className="leading-relaxed mb-3">
          CRM в BotForg — это раздел в рабочем пространстве бота, где собраны данные об аудитории:
          кто с вами общался, насколько недавно, какие поля профиля заполнены, какие теги и статусы
          применены. Это практичный слой для работы с базой именно этого бота, а не отдельная
          «большая CRM» в абстракции.
        </p>
        <p className="leading-relaxed">
          Задача CRM — дать опору в цифрах и списках: видеть сегменты, активность и согласованность
          сценария с реальными данными, чтобы не настраивать бота вслепую.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-[var(--text)] mb-3">Где находится</h2>
        <ol className="list-decimal pl-5 space-y-2 leading-relaxed">
          <li>Личный кабинет BotForg</li>
          <li>Раздел «Мои боты»</li>
          <li>Карточка нужного бота</li>
          <li>Кнопка «Открыть» (workspace бота)</li>
          <li>В меню workspace — пункт «CRM»</li>
        </ol>
        <p className="mt-3 text-sm opacity-90">
          После входа в CRM доступны подразделы: Обзор, Контакты, Поля, Теги, Статусы.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-[var(--text)] mb-3">Что входит в CRM</h2>
        <ul className="list-disc pl-5 space-y-2 leading-relaxed">
          <li>
            <strong className="text-[var(--text)]">Обзор</strong> — сводные показатели по базе
            контактов бота и активности.
          </li>
          <li>
            <strong className="text-[var(--text)]">Контакты</strong> — список людей и карточки для
            операционной работы и поиска.
          </li>
          <li>
            <strong className="text-[var(--text)]">Поля</strong> — справочник полей профиля: что
            можно хранить о контакте.
          </li>
          <li>
            <strong className="text-[var(--text)]">Теги</strong> — справочник меток для сегментации.
          </li>
          <li>
            <strong className="text-[var(--text)]">Статусы</strong> — распределение по этапам
            воронки и состояниям обработки.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-[var(--text)] mb-3">Какие задачи решает</h2>
        <ul className="list-disc pl-5 space-y-2 leading-relaxed">
          <li>Видеть базу контактов и динамику активности</li>
          <li>Сегментировать аудиторию по тегам, статусам, полям</li>
          <li>Наводить порядок в справочниках данных</li>
          <li>Проверять, что сценарий реально записывает то, что задумано</li>
          <li>Работать с ботом опираясь на факты, а не на предположения</li>
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-[var(--text)] mb-3">Режимы данных</h2>
        <p className="leading-relaxed mb-3">
          В CRM можно показывать <strong className="text-[var(--text)]">реальные</strong> диалоги из
          мессенджеров, <strong className="text-[var(--text)]">тестовые</strong> прогоны из
          предпросмотра редактора или <strong className="text-[var(--text)]">все</strong> данные
          вместе. Разделение нужно, чтобы отладка не смешивалась с отчётами по настоящим клиентам.
        </p>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-[var(--text)] mb-3">Кому полезна</h2>
        <ul className="list-disc pl-5 space-y-2 leading-relaxed">
          <li>Новичкам — чтобы понять, кто пишет боту и что происходит с базой</li>
          <li>Тем, кто запускает первого бота — быстрый контроль первых контактов и метрик</li>
          <li>
            Опытным пользователям — сегментация, контроль полей/тегов/статусов и сводный обзор
          </li>
        </ul>
      </section>

      <section
        className="rounded-xl border p-6"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--card)' }}
      >
        <h2 className="text-lg font-semibold text-[var(--text)] mb-2">
          Полная инструкция в личном кабинете
        </h2>
        <p className="text-sm leading-relaxed mb-4">
          После входа откройте подробное руководство с пошаговыми разделами, режимами данных, FAQ и
          советами для начинающих и опытных пользователей.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold text-black transition hover:opacity-90"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Войти в кабинет
          </Link>
          <Link
            to="/dashboard/help/crm"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-medium border transition hover:opacity-90"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          >
            Справка по CRM (для авторизованных)
          </Link>
        </div>
        <p className="text-xs mt-3 opacity-80">
          Ссылка «Справка по CRM» ведёт в ЛК; без авторизации используйте эту страницу и
          документацию репозитория.
        </p>
      </section>
    </div>
  );
}
