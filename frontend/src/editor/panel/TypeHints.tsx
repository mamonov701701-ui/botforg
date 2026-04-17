const BLOCK_TYPE_INFO: Record<
  string,
  { title: string; description: string[]; examples: string[] }
> = {
  start: {
    title: 'Старт',
    description: ['Точка входа сценария', 'Инициализация контекста'],
    examples: ['Первый шаг после нажатия "Начать"'],
  },
  message: {
    title: 'Сообщение',
    description: ['Показывает текст/кнопки пользователю'],
    examples: ['Приветствие', 'Вопрос'],
  },
  action: {
    title: 'Действие',
    description: ['Выполняет операцию без участия пользователя'],
    examples: ['Сохранение', 'Отправка письма на электронную почту'],
  },
  condition: {
    title: 'Выбор',
    description: ['Выбирает ветку по значению'],
    examples: ['По ответу пользователя', 'По значению поля профиля'],
  },
  api: {
    title: 'Запрос к внешней системе',
    description: ['Обмен данными с внешним сервисом по сети'],
    examples: ['Получить статус заказа'],
  },
  end: { title: 'Завершение', description: ['Финиш сценария'], examples: ['Спасибо за обращение'] },
  default: { title: 'Блок', description: ['Стандартный блок'], examples: ['Произвольный шаг'] },
};

export function TypeHints({ type }: { type?: string }) {
  const t = BLOCK_TYPE_INFO[type ?? 'default'];
  return (
    <div style={{ fontSize: 12, opacity: 0.8, lineHeight: 1.35 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{t.title}</div>
      {t.description.map((d, i) => (
        <div key={i}>• {d}</div>
      ))}
      {t.examples.length > 0 && (
        <div style={{ marginTop: 6, opacity: 0.8 }}>Например: {t.examples.join(', ')}</div>
      )}
    </div>
  );
}
