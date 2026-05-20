# Dev-порты BotForg

Этот файл — единый источник правды по dev-портам для локальной разработки.

## Порты по умолчанию

- **Frontend (Vite)**: `http://localhost:5173`
- **Backend (FastAPI / uvicorn)**: `http://localhost:8001`

При ручном запуске **`npm run dev`** без переменных окружения прокси Vite направляет API на **8001** — туда же должен слушать uvicorn.

## Где это настроено

- **`npm run dev`** в **корне репозитория** (обёртка над `scripts/start-dev.ps1`, Windows).
- `scripts/start-dev.ps1` (Windows, одна команда из корня репозитория)  
  - Текст в консоли — **на английском** (совместимость **Windows PowerShell 5.1** и UTF-8 без BOM: кириллица в том же файле ломала разбор скрипта).  
  - Освобождает порты **`8001` (основной backend)**, **`8002` (legacy cleanup — старый дефолт)**, **`5173`**, **`5174`**.  
  - **Python:** предпочтительно `backend\venv\Scripts\python.exe` (тот же интерпретатор, что для uvicorn); иначе `python` из PATH.  
  - `$pyExe -m alembic upgrade head`, затем фоновый backend и фоновый `npm run dev` во frontend.  
  - Передаёт `BOTFORG_BACKEND_PORT` во frontend, чтобы proxy и backend были синхронизированы из одного значения (по умолчанию **8001**).  
  - После старта проверяет, что на backend-порту слушает ровно один PID, и печатает `port/pid/commandline`.  
  - Логи: `scripts/.dev-backend-YYYYMMDD-HHMMSS.log`, `scripts/.dev-frontend-YYYYMMDD-HHMMSS.log`.  
  - После старта: `GET /healthz`, `GET` фронта, **`POST /auth/email/login`** (ожидается **401** или **422**, не **500**).  
- `scripts/stop-dev.ps1` — остановка процессов на портах **`8001`**, **`8002` (legacy cleanup)**, **`5173`**, **`5174`**.

- `frontend/vite.config.js`
  - `server.port = 5173`, **`strictPort: true`** (если порт занят — ошибка, а не тихий переход на 5174)
  - `resolve.alias`: `@` → `src`
  - `proxy` для API (всё на `http://localhost:${BOTFORG_BACKEND_PORT|8001}`):
    - `/auth`, `/api`, `/blocks`, `/scenarios`, `/me`, `/bots`, `/analytics`, `/chat`, `/legal`, `/privacy`, `/plans`, **`/media`**, **`/uploads`**

- `frontend/.env.development`
  - `VITE_API_URL` используется **в production-сборке**; **в dev** запросы API идут **относительными путями** через прокси (`src/api/devApiOrigin.ts`), чтобы не было прямых обращений к `:8001` из браузера и типичного `ERR_CONNECTION_REFUSED`, если открыт только фронт.

- **Вход в ЛК:** только `POST /auth/email/login` (JSON) — см. `frontend/src/api/auth.ts`, модалка `features/auth/AuthModal.tsx`. Устаревший `/auth/login` (form) в dev не используется.

## Частая ошибка: 500 на `/auth/email/login`

Чаще всего фронт запущен **`npm run dev`**, а бэкенд — **`uvicorn ... --port 8001`**, но переменная **`BOTFORG_BACKEND_PORT`** указывала на другой порт (раньше дефолты были **8000** / **8002**). Запросы шли не на ваш uvicorn → обрыв прокси или чужой процесс → **500**.

**Правило:** порт в uvicorn и порт в Vite-proxy должны совпадать. Либо запускайте **`scripts/start-dev.ps1`** из корня (он выставляет оба), либо вручную: `uvicorn` на **8001** и `npm run dev` без `BOTFORG_BACKEND_PORT`.

## Правила для разработки

1. **Backend по умолчанию слушает `8001`.**
2. **Frontend всегда на `5173`.**
3. Если нужен другой порт API — задайте **`BOTFORG_BACKEND_PORT`** и запустите uvicorn на том же порту.

## Проверка работоспособности

```bash
# Backend
curl http://localhost:8001/healthz

# Frontend
open http://localhost:5173
```
