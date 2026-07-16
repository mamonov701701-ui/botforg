# Этап 6.1 — Public tariff and addon API

**Дата:** 2026-07-16
**Ветка:** `chore/fresh-clean`
**Опора:** модели Plan / AddonPackage, `GET /me/tariff/summary` (5.4)

---

## 1. Endpoints

| Метод | Путь | Auth | Ответ |
|-------|------|------|--------|
| `GET` | `/tariffs` | нет | `PublicTariffOut[]` |
| `GET` | `/addons` | нет | `PublicAddonOut[]` |

Фильтр: `is_active=true` и `is_public=true`.
Сортировка: `sort_order ASC`, затем `code ASC`.
Пустой каталог: `200` и `[]`.
Seed в запросах не создаётся.

`GET /me/tariff/summary` не дублируется и не менялся по контракту.

---

## 2. Изменённые файлы

| Файл | Изменение |
|------|-----------|
| `backend/schemas/tariff.py` | `PublicTariffOut`, `PublicAddonOut` |
| `backend/routers/tariff.py` | `list_public_tariffs`, `list_public_addons` |
| `backend/tests/test_tariff_catalog_api.py` | API-тесты каталога + регрессия summary |
| `docs/TARIFFS_STAGE_6_1_PUBLIC_API.md` | этот документ |

---

## 3. Что не менялось

- payments / purchase / смена тарифа
- marketplace, frontend, миграции, admin CRUD
- summary / enforcement business logic
- legacy webhook, `POST /messages/`
- схема БД

---

## 4. Результаты тестов

```text
pytest -k "tariff or addon" -q  → 94 passed
pytest backend/tests/ -q        → 322 passed, 4 xfailed
```
