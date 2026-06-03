# Этап 5.5 — Frontend «Финансы и лимиты» (read-only)

**Дата:** 2026-06-03  
**Опора:** [TARIFFS_STAGE_5_4_LIMITS_SUMMARY_API.md](./TARIFFS_STAGE_5_4_LIMITS_SUMMARY_API.md)

---

## 1. Цель

Показать владельцу аккаунта сводку по тарифу и лимитам через `GET /me/tariff/summary` без оплаты, покупок и админки.

---

## 2. Backend API

| Метод | Путь | Auth |
|-------|------|------|
| `GET` | `/me/tariff/summary` | Bearer / cookie |

Клиент: `frontend/src/api/tariff.ts` → `getTariffSummary()`.

Типы: `TariffSummary`, `CurrentPlan`, `BillingPeriod`, `UsageBlock`, `TariffWarning`, `TariffFlags`, `TariffAddonItem`, `TariffGiftItem`.

---

## 3. Frontend route / навигация

| Элемент | Значение |
|---------|----------|
| URL | `/dashboard/tariff` |
| Пункт меню | «Финансы и лимиты» (режим «Мои проекты») |
| Страница | `TariffLimitsPage.tsx` |

Раздел «Баланс» (`/dashboard/balance`) не изменён — там mock-транзакции и пополнение.

---

## 4. Отображаемые данные (read-only)

1. **Текущий тариф** — название, код, источник (subscription / gift_plan / legacy / fallback), период, статус подписки.
2. **Лимиты** — сообщения, активные боты, участники команды (used / limit / remaining, progress bar).
3. **Предупреждения** — список или «Лимиты в норме».
4. **Активные пакеты / подарки** — списки или пустые состояния; unsupported PLAN gift без падения UI.
5. **Возможности тарифа** — flags (маркетплейс, публикации, экспорт, поддержка).

Тексты на русском. Ошибки без raw JSON и stack trace.

---

## 5. UX-состояния

- loading — «Загрузка данных о тарифе…»
- error — понятное сообщение (+ 401/403 варианты)
- empty arrays — «Активных пакетов/подарков нет»
- кнопка «Обновить»

---

## 6. Что НЕ делалось

- Оплата, смена тарифа, покупка пакетов
- Админка подарков / тарифов
- Marketplace UI
- Webhook runtime, legacy webhook, `POST /messages/`
- Изменения backend tariff logic

---

## 7. Файлы

| Файл | Назначение |
|------|------------|
| `frontend/src/api/tariff.ts` | API + типы |
| `frontend/src/features/dashboard/tariff/tariffDisplay.ts` | Форматирование для UI |
| `frontend/src/features/dashboard/pages/TariffLimitsPage.tsx` | Страница |
| `frontend/src/features/dashboard/DashboardLayout.tsx` | Пункт меню |
| `frontend/src/main.jsx` | Route |
| `frontend/src/constants/roles.ts` | `tariff` в SECTION_ACCESS |
| `frontend/tests/unit/tariffDisplay.test.ts` | Unit-тесты форматирования |
| `frontend/tests/unit/TariffLimitsPage.test.tsx` | Тесты страницы |

---

## 8. Проверки

```powershell
cd frontend
npm run typecheck
npm run lint
npm run test -- --run tests/unit/tariffDisplay.test.ts tests/unit/TariffLimitsPage.test.tsx
npm run build
```

`npm install` не запускался — зависимости не менялись.

---

## 9. Ограничения

- E2e с живым backend не выполнялся (uvicorn не запускался по правилам этапа).
- Раздел не скрывает пункт меню по роли — как остальные разделы ЛК (ограничения на действия, не на просмотр).
- Покупка и смена тарифа — следующие этапы.
