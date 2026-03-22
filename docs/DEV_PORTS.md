# Dev-порты BotForg

Этот файл — единый источник правды по dev-портам для локальной разработки.

## Порты по умолчанию

- **Frontend (Vite)**: `http://localhost:5173`
- **Backend (FastAPI / uvicorn)**: `http://localhost:8001`

## Где это настроено

- `scripts/start-dev.ps1` (Windows, одна команда из корня репозитория)  
  - Освобождает порты `8001`, `5173` и запасной `5174` (если Vite ушёл на него).  
  - `python -m alembic upgrade head`, затем фоновый backend с `--reload` и фоновый frontend.  
  - Логи: `scripts/.dev-backend-YYYYMMDD-HHMMSS.log`, `scripts/.dev-frontend-YYYYMMDD-HHMMSS.log` (новые имена на каждый запуск).  
  - После старта проверяет `http://127.0.0.1:8001/healthz` и `http://127.0.0.1:5173/`; при ошибке выводит хвост логов и завершается с кодом `1`.  
- `scripts/stop-dev.ps1` — остановка процессов на портах `8001`, `5173`, `5174`.

- `frontend/vite.config.js`
  - `server.port = 5173`
  - `proxy` для API:
    - `/auth`, `/api`, `/blocks`, `/scenarios`, `/me`, `/bots`, `/analytics`, `/chat`, `/legal`, `/privacy`, `/plans`
    - **target всегда**: `http://localhost:8001`

- `frontend/.env.development`
  - `VITE_API_URL=http://localhost:8001`

- `frontend/src/api/useAuthApi.js`
  - `const API_URL = 'http://localhost:8001'; // НЕ 8000!`

## Правила для разработки

1. **Backend всегда должен слушать 8001.**  
   - Любые локальные команды/скрипты для uvicorn должны использовать `--port 8001`, а не `8000`.

2. **Frontend всегда на 5173.**  
   - Если нужно поменять порт, правьте только `frontend/vite.config.js` и обновляйте этот файл.

3. **Не использовать 8000 для основного API.**  
   - Старые скрипты/доки, ссылающиеся на `http://localhost:8000`, считаются legacy и не должны использоваться для dev.

4. **Проверка работоспособности:**

```bash
# Backend
curl http://localhost:8001/healthz

# Frontend
open http://localhost:5173
```

