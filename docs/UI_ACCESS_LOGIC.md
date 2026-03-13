# Логика доступа в UI BotForg

## Принцип видимости разделов

**Все основные разделы меню видны для всех ролей.** Ограничения применяются только на уровне действий и функционала внутри разделов.

## Разделы, видимые всем

| Раздел | Путь | Описание |
|--------|------|----------|
| Главная | `/dashboard` | Обзор личного кабинета |
| Мои боты (Редактор) | `/dashboard/bots` | Список ботов, переход в редактор |
| Сценарии | `/dashboard/scenarios` | Библиотека сценариев |
| Шаблоны | `/dashboard/templates` | Шаблоны ботов |
| Баланс | `/dashboard/balance` | Финансы (действия ограничены по роли) |
| Аналитика | `/dashboard/analytics` | Статистика |
| Команда | `/dashboard/team` | Участники проекта |
| Сообщения | `/dashboard/messages` | Чаты и сообщения |
| Настройки | `/dashboard/settings` | Профиль и настройки |

## Публичные страницы (Header)

Доступны без авторизации:

- **Маркет** — `/market`
- **Возможности** — `/features`
- **Тарифы** — `/pricing`
- **BF агент** — `/bf-agent`

## Ограничения по ролям

### Видимость vs действия

- **Видимость разделов:** все пользователи видят все пункты меню
- **Действия внутри разделов:** ограничены по `ACTION_ACCESS` (см. `frontend/src/constants/roles.ts`)

Примеры:
- Пользователь с ролью `viewer` видит раздел «Баланс», но не может пополнять счёт
- Пользователь с ролью `viewer` видит «Мои боты», но кнопка «Создать бота» может быть скрыта

### Платформенный режим (только owner)

Раздел «Управление платформой» (BF команда, пользователи платформы, платформенная аналитика) доступен только роли `owner`.

## Ограничения на уровне действий

Для действий, недоступных текущей роли:
- Кнопка отображается в **disabled-состоянии** (приглушённая, cursor: not-allowed)
- При клике показывается **toast-подсказка**: «Функция X доступна для роли: Y, Z»

### Компонент AccessLocked

Универсальный компонент для ограниченных кнопок:

```tsx
import { AccessLocked } from '../components/AccessLocked';

<AccessLocked hasAccess={canCreate} actionKey="bot_create" onClick={() => setShowModal(true)}>
  <button>Создать бота</button>
</AccessLocked>
```

- `hasAccess` — есть ли право на действие
- `actionKey` — ключ из `ACTION_ACCESS` (bot_create, template_publish и т.д.)
- `onClick` — обработчик при наличии доступа

Сообщение формируется через `getAccessDeniedMessage(actionKey)` в `constants/roles.ts`.

## Файлы

- `frontend/src/constants/roles.ts` — `SECTION_ACCESS`, `ACTION_ACCESS`, `hasAccessToSection`, `hasAccessToAction`, `getAccessDeniedMessage`
- `frontend/src/components/AccessLocked.tsx` — обёртка для ограниченных кнопок
- `frontend/src/features/dashboard/components/EmptyState.tsx` — поддержка `disabled` и `disabledMessage` для action
- `frontend/src/features/dashboard/DashboardLayout.tsx` — боковое меню
- `frontend/src/components/Header.jsx` — верхняя навигация (публичные ссылки)

## См. также

- [ROLES_AND_PERMISSIONS.md](./ROLES_AND_PERMISSIONS.md) — матрица прав по ролям
- [docs/roles.md](./roles.md) — роли по умолчанию
