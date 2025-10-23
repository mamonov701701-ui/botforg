# Telegram Bot Setup для BotForg Dev Agent

## 📱 Настройка Telegram бота

### 1. Создание бота

1. Найдите [@BotFather](https://t.me/BotFather) в Telegram
2. Отправьте `/newbot`
3. Следуйте инструкциям:
   - Введите название бота (например: "BotForg Dev Agent")
   - Введите username бота (например: `botforg_dev_bot`)
4. Сохраните токен, который выдаст BotFather (формат: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Получение Chat ID

**Вариант A - Через специальный бот:**

1. Найдите [@userinfobot](https://t.me/userinfobot) в Telegram
2. Отправьте `/start`
3. Скопируйте ваш ID из ответа

**Вариант B - Через ваш бот:**

1. Напишите любое сообщение вашему боту
2. Откройте в браузере: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
3. Найдите `"chat":{"id":123456789}` - это ваш Chat ID

### 3. Настройка переменных окружения

**Windows (PowerShell):**

```powershell
# Установить переменные окружения
[Environment]::SetEnvironmentVariable("TG_BOT_TOKEN", "1234567890:ABCdefGHI...", "User")
[Environment]::SetEnvironmentVariable("TG_CHAT_ID", "123456789", "User")

# Проверить
$env:TG_BOT_TOKEN
$env:TG_CHAT_ID
```

**Или через .env файл в корне проекта:**

```bash
TG_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TG_CHAT_ID=123456789
```

### 4. Запуск бота

**Вариант 1 - Напрямую:**

```powershell
cd C:\Users\mamon\botforg
python -m monitoring.prompt_agent
```

**Вариант 2 - Через скрипт:**

```powershell
.\scripts\run_prompt_agent.ps1
```

**Вариант 3 - Фоновый режим:**

```powershell
Start-Process -WindowStyle Hidden powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-Command','cd C:\Users\mamon\botforg; python -m monitoring.prompt_agent'
```

### 5. Проверка работы

Отправьте в Telegram вашему боту:

```
/help
```

Если бот ответил списком команд - всё работает! ✅

## 📋 Доступные команды

### Базовые действия

- `/status` - Git branch + статус
- `/typecheck` - TypeScript проверка (0 errors ✅)
- `/build` - Production build frontend
- `/tests` - Backend pytest

### Запуск сервисов

- `/backend_start` - Запустить FastAPI (порт 8000)
- `/frontend_start` - Запустить Vite (порт 5173)
- `/expose` - Создать cloudflared туннели
- `/preview_urls` - Показать локальные URLs

### Управление

- `/pipeline` - ⭐ Запустить всё сразу (backend+frontend+expose)
- `/stop_all` - Остановить все процессы

### Утилиты

- `/quiet` - Тихий режим
- `/verbose` - Полный лог
- `/logs` - Скачать логи агента
- `/restart_me` - Перезапустить агента

### Продвинутое использование

**JSON задачи:**

```
/task {"action":"status"}
/task {"action":"typecheck"}
/task {"action":"pipeline"}
```

## 🔒 Безопасность

- ✅ Single instance guard - только один экземпляр бота
- ✅ Chat ID проверка - бот отвечает только вам
- ✅ Timeout для всех команд
- ✅ Error handling с анти-спам логикой

## 🐛 Troubleshooting

### Бот не отвечает

1. Проверьте переменные окружения:

   ```powershell
   echo $env:TG_BOT_TOKEN
   echo $env:TG_CHAT_ID
   ```

2. Проверьте логи:

   ```powershell
   cat monitoring/logs/agent.log
   ```

3. Проверьте, запущен ли агент:
   ```powershell
   Get-Process python | Where-Object {$_.CommandLine -like "*prompt_agent*"}
   ```

### Conflict 409 error

Это означает, что бот уже запущен в другом месте. Остановите все экземпляры:

```powershell
Get-Process python | Where-Object {$_.CommandLine -like "*prompt_agent*"} | Stop-Process -Force
Remove-Item monitoring\prompt_agent.lock -Force
```

### Lock файл застрял

```powershell
Remove-Item monitoring\prompt_agent.lock -Force
```

## 📝 Примеры использования

### Проверить статус проекта

```
/status
```

### Запустить весь стек разработки

```
/pipeline
```

### Получить публичные URLs для тестирования с телефона

```
/expose
```

Вывод будет примерно таким:

```
Backend → https://abc123.trycloudflare.com
Frontend → https://xyz789.trycloudflare.com
```

### Проверить TypeScript

```
/typecheck
```

Ответ: `✅ typecheck (rc=0)` - 0 ошибок!

### Собрать production build

```
/build
```

### Остановить всё

```
/stop_all
```

## 🚀 Автозапуск

Для автоматического запуска при входе в Windows можете использовать планировщик задач или добавить в автозагрузку:

```powershell
# Создать ярлык в автозагрузке
$WshShell = New-Object -comObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\BotForg Agent.lnk")
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"cd C:\Users\mamon\botforg; python -m monitoring.prompt_agent`""
$Shortcut.Save()
```
