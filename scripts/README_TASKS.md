# Планировщик задач BotForg

Этот набор скриптов позволяет автоматически запускать компоненты мониторинга BotForg через планировщик задач Windows.

## Установка задач

### Как запустить регистрацию задач:

1. **Правый клик** на файле `register_tasks.ps1`
2. Выберите **"Run with PowerShell"**
3. Введите **"Y"** для подтверждения выполнения скрипта

Альтернативно, запустите из PowerShell от имени администратора:

```powershell
cd C:\Users\mamon\botforg\scripts
.\register_tasks.ps1
```

## Зарегистрированные задачи

После выполнения `register_tasks.ps1` будут созданы следующие задачи:

### 1. BotForg_PromptAgent

- **Триггер**: При входе в систему (ONLOGON)
- **Описание**: Запускает Telegram-бота для управления мониторингом
- **Скрипт**: `run_prompt_agent.ps1`

### 2. BotForg_SnapshotScheduler

- **Триггер**: При входе в систему (ONLOGON)
- **Описание**: Запускает планировщик скриншотов
- **Скрипт**: `run_scheduler.ps1`

### 3. BotForg_FrontendHealth_10min

- **Триггер**: Каждые 10 минут (MINUTE /MO 10)
- **Описание**: Проверяет здоровье фронтенда и отправляет уведомления
- **Скрипт**: `run_frontend_health.ps1`

## Удаление задач

### Как удалить все задачи:

1. **Правый клик** на файле `unregister_tasks.ps1`
2. Выберите **"Run with PowerShell"**
3. Введите **"Y"** для подтверждения

Или из PowerShell:

```powershell
cd C:\Users\mamon\botforg\scripts
.\unregister_tasks.ps1
```

## Проверка статуса задач

Для проверки статуса зарегистрированных задач:

```powershell
schtasks /Query /TN "BotForg_PromptAgent"
schtasks /Query /TN "BotForg_SnapshotScheduler"
schtasks /Query /TN "BotForg_FrontendHealth_10min"
```

## Требования

- Windows 10/11
- PowerShell
- Установленный Python с виртуальным окружением в `C:\Users\mamon\botforg\venv`
- Настроенные переменные окружения `TG_BOT_TOKEN` и `TG_CHAT_ID` для Telegram

## Устранение неполадок

Если задачи не запускаются:

1. Проверьте права администратора
2. Убедитесь, что виртуальное окружение существует
3. Проверьте политику выполнения PowerShell:
   ```powershell
   Get-ExecutionPolicy
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
