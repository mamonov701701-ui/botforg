# Этап 6.4 — Admin gift grants and audit log

**Дата:** 2026-07-16
**Ветка:** `chore/fresh-clean`
**HEAD до изменений:** `81821b1`

---

## Endpoints

Prefix: `/api/admin/tariffs`

| Method | Path | Описание |
|--------|------|----------|
| GET | `/users/lookup?user_id=` / `?email=` | Поиск пользователя |
| GET | `/users/{user_id}/gifts` | Список GiftGrant пользователя |
| POST | `/gifts` | Выдача GiftGrant |
| POST | `/gifts/{gift_id}/revoke` | Отзыв GiftGrant (идемпотентно) |

Поддерживаемые `gift_type`: `plan`, `messages`, `active_bot`, `team_member`.

---

## Permissions

`require_tariff_admin` (`backend/dependencies/tariff_admin.py`):

- `User.role` in `{owner, admin}`; или
- активная BF-роль `BF Администратор`.

Обычный пользователь → `403`.

---

## Entitlement + audit

- Выдача/отзыв только через `grant_gift` / `revoke_gift` (`tariff_entitlements.py`).
- Каждая выдача и первый отзыв пишут `AdminAuditLog` (`action`: `gift_grant` / `gift_revoke`, `entity_type`: `gift_grant`).
- Повторный revoke: `200`, `already_cancelled=true`, без второго audit-события.

---

## Changed files

- `backend/dependencies/tariff_admin.py` — новый
- `backend/schemas/tariff_admin.py` — новый
- `backend/services/tariff_admin_audit.py` — новый
- `backend/routers/tariff_admin.py` — новый
- `backend/main.py` — регистрация router
- `backend/services/tariff_entitlements.py` — идемпотентный revoke
- `backend/tests/test_tariff_admin_gifts.py` — новый
- `docs/TARIFFS_STAGE_6_4_ADMIN_GIFTS.md` — этот документ

---

## Не менялось

frontend, payments, marketplace, миграции, legacy webhook, `POST /messages/`.

---

## Tests

```text
pytest backend/tests/ -k "gift or audit or tariff" -q
→ 124 passed, 232 deselected

pytest backend/tests/ -q
→ 352 passed, 4 xfailed

git diff --check → clean
```

Рекомендуемый commit:

```text
admin: add tariff gift grants and audit log
```
