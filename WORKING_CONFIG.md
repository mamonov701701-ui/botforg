# ✅ РАБОЧАЯ КОНФИГУРАЦИЯ BOTFORG

**ВАЖНО: Эти настройки проверены и работают. НЕ МЕНЯТЬ без крайней необходимости!**

---

## 🎯 Основные команды (Telegram бот)

### Быстрый старт:
```
/pipeline     - Запустить всё (backend + frontend + туннели)
/expose       - Создать публичные туннели
/preview_urls - Показать локальные ссылки
```

### Управление:
```
/backend_start  - Запустить FastAPI (порт 8001)
/frontend_start - Запустить Vite (порт 5173)
/stop_all       - Остановить всё
```

### Меню:
```
/menu_main - Главное меню (основные команды)
/menu_sys  - Системное меню (тесты, билды, настройки)
```

---

## 🔧 Критические настройки (НЕ МЕНЯТЬ!)

### 1. frontend/vite.config.js
```javascript
{
  plugins: [
    react(),
    {
      name: 'disable-host-check',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          delete req.headers['host']
          req.headers['host'] = 'localhost:5173'
          next()
        })
      },
    },
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    cors: true,
  },
}
```

**Зачем:** Middleware обходит проверку DNS rebinding, позволяя работать через туннели.

---

### 2. Порты

| Сервис   | Порт | Адрес           |
|----------|------|-----------------|
| Backend  | 8001 | 0.0.0.0:8001    |
| Frontend | 5173 | 0.0.0.0:5173    |

**НЕ МЕНЯТЬ порты!** Они прописаны в множестве мест.

---

### 3. Туннели

Используется **localhost.run** (SSH туннели), НЕ cloudflared.

Скрипт: `scripts/dev-expose-ssh.ps1`

**Почему SSH:** Работает в любых сетях, обходит блокировки UDP портов.

---

### 4. Backend CORS

```python
# backend/main.py
allow_origins=["*"]  # для development режима
```

**Зачем:** Позволяет frontend'у обращаться к API через туннельные домены.

---

### 5. Команды запуска

**Backend:**
```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

**Frontend:**
```powershell
cd frontend
npm run dev
```
(НЕ добавлять `--host 0.0.0.0` - настроено в vite.config.js)

---

## 🤖 Автозапуск бота

Настроен через **Task Scheduler**:
- Задача: `BotForg PromptAgent`
- Триггер: При входе в систему
- Скрипт: `monitoring/startup.bat`

**Управление:**
```powershell
# Проверить статус
Get-ScheduledTask -TaskName "BotForg PromptAgent"

# Запустить вручную
Start-ScheduledTask -TaskName "BotForg PromptAgent"

# Переустановить
powershell -NoProfile -ExecutionPolicy Bypass -File monitoring\setup_autorun.ps1
```

---

## 📱 Структура меню бота

### Главное меню:
```
┌───────────┬─────────────────┬──────────────────┐
│ /status   │ /backend_start  │ /frontend_start  │
├───────────┼─────────────────┼──────────────────┤
│ /expose   │ /pipeline       │ /stop_all        │
├───────────┼─────────────────┼──────────────────┤
│ /menu_sys │ /logs           │ /restart_me      │
└───────────┴─────────────────┴──────────────────┘
```

### Системное меню:
```
┌──────────────────┬──────────────┬──────────┐
│ /tests           │ /typecheck   │ /build   │
├──────────────────┼──────────────┼──────────┤
│ /quiet           │ /verbose     │ /logs    │
├──────────────────┼──────────────┼──────────┤
│ /install_cloud...│ /menu_main   │          │
└──────────────────┴──────────────┴──────────┘
```

---

## 🚨 Типичные проблемы

### "Blocked request. This host is not allowed"
✅ **Решено:** Middleware в vite.config.js подменяет host header.

### Backend порт 8000 занят
✅ **Решено:** Используется порт 8001.

### Cloudflared TLS handshake error
✅ **Решено:** Используется localhost.run (SSH).

### Frontend 404 при запуске через туннель
✅ **Решено:** Middleware + CORS настроены правильно.

---

## 📝 Логи

| Компонент | Путь к логам                     |
|-----------|----------------------------------|
| Bot       | `monitoring/logs/agent.log`      |
| Autostart | `monitoring/startup.log`         |
| Frontend  | Terminal (где запущен `npm`)     |
| Backend   | Terminal (где запущен `uvicorn`) |

---

## ✅ Проверка работоспособности

1. В Telegram: `/pipeline`
2. Подождать 30 секунд
3. В Telegram: `/expose`
4. Открыть Frontend URL из сообщения
5. Должен загрузиться сайт BotForg

**Если что-то не работает:** Отправьте `/logs` в Telegram боту.

---

**Дата последнего обновления:** 27.10.2025  
**Статус:** ✅ Полностью рабочая конфигурация

