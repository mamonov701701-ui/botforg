# 🔧 Решение проблем со входом

## Быстрая диагностика

Запустите в PowerShell:
```powershell
cd C:\Users\mamon\botforg
python test_all_login.py
```

## Типичные проблемы и решения

### Проблема: "Unexpected token '<', "<!DOCTYPE "... is not valid JSON"

**Причина:** Frontend обращается к неправильному URL или backend не работает.

**Решение:**
1. Проверьте, что backend запущен:
   ```powershell
   Get-NetTCPConnection -LocalPort 8001 -State Listen
   ```

2. Если нет — из **корня репозитория**: `npm run dev` или `.\scripts\start-dev.ps1` (поднимает и backend, и frontend; см. [DEV_PORTS.md](./DEV_PORTS.md)).

3. Вход в ЛК идёт через **`POST /auth/email/login`** (JSON), см. `frontend/src/api/auth.ts`. Убедитесь, что открываете приложение как **`http://localhost:5173`**, а не HTML-файл с диска (иначе нет прокси на `/auth`).

---

### Проблема: "Internal Server Error" (500)

**Причина 1 (самая частая в dev):** Vite проксирует `/auth` не на тот порт, где реально запущен uvicorn (несовпадение порта фронта и бэкенда).

**Решение:**
1. Откройте [DEV_PORTS.md](./DEV_PORTS.md): backend по умолчанию **`8001`**, прокси Vite без `BOTFORG_BACKEND_PORT` тоже **`8001`**.
2. Убедитесь: `Get-NetTCPConnection -LocalPort 8001 -State Listen` показывает ваш uvicorn.
3. Либо запускайте всё через **`.\scripts\start-dev.ps1`** из корня — один порт для backend и для прокси.

**Причина 2:** Реальная ошибка в коде backend при обработке запроса.

**Решение:**
1. Смотрите traceback в терминале uvicorn.
2. Проверьте миграции: из корня `python -m alembic upgrade head`.

### Проблема: `no such column: users.token_version` (SQLite)

**Причина:** Файл БД старше текущих моделей; не применены миграции Alembic.

**Решение:**
1. Из **корня репозитория**: `python -m alembic upgrade head`
2. Перезапустите uvicorn. В режиме **development + SQLite** при старте backend сам выполняет `alembic upgrade head` (см. `backend/services/ensure_migrations.py`).

---

### Проблема: Страница не обновляется после изменений

**Причина:** Браузер кэширует старую версию JavaScript.

**Решение:**
1. **Жёсткое обновление:** Ctrl + Shift + R
2. **Очистка кэша:** F12 → Network → Disable cache → F5
3. **Полная очистка:** F12 → ПКМ на кнопке обновления → "Empty Cache and Hard Reload"

---

### Проблема: Серверы не запускаются

**Решение:**

Используйте автоматический скрипт:
```powershell
powershell -ExecutionPolicy Bypass -File start_servers.ps1
```

Или запустите вручную в двух разных терминалах:

**Терминал 1 (Backend):**
```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8001
```

**Терминал 2 (Frontend):**
```powershell
cd frontend
npm run dev
```

---

### Проблема: Пользователь не найден

**Решение:**

Создайте пользователя:
```powershell
cd backend
.\venv\Scripts\python.exe create_admin_simple.py
```

---

## Проверка конфигурации

### .env файл
Файл `frontend/.env.development` с `VITE_API_URL=http://localhost:8001` нужен для **production build / preview**. В **Vite dev** запросы из `client.ts` идут относительно `http://localhost:5173` и проксируются на 8001 — прямой `:8001` из браузера не обязателен и для медиа отключён намеренно (`devApiOrigin.ts`).

### vite.config.js
Должен содержать прокси:
```javascript
proxy: {
  '/auth': {
    target: 'http://localhost:8001',
    changeOrigin: true,
  },
}
```

### Клиент API (актуально)
- `frontend/src/api/client.ts` — относительные URL в dev (через прокси Vite).
- `frontend/src/api/devApiOrigin.ts` — в dev не подставляет `http://localhost:8001` для медиа/каталогов.

---

## Полная диагностика

Скрипт `test_all_login.py` проверяет:

1. ✅ Backend API напрямую
2. ✅ Пользователя в БД
3. ✅ Frontend прокси
4. ✅ Конфигурационные файлы

Запустите и смотрите что именно не работает.

---

## Контакты для дебага

Все исправления задокументированы в:
- `SUCCESS_REPORT.md`
- `WAKE_UP_INSTRUCTIONS.md`
- `docs/DASHBOARD_IMPLEMENTATION.md`

