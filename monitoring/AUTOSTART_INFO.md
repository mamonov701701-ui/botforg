# 🤖 Автозапуск BotForg Agent

## ✅ Что настроено:

**Бот автоматически запускается** при входе в Windows через Task Scheduler.

---

## 📋 Управление автозапуском:

### Проверить статус задачи:
```powershell
Get-ScheduledTask -TaskName "BotForg PromptAgent"
```

### Запустить вручную:
```powershell
Start-ScheduledTask -TaskName "BotForg PromptAgent"
```

### Остановить:
```powershell
Stop-ScheduledTask -TaskName "BotForg PromptAgent"
```

### Отключить автозапуск:
```powershell
Disable-ScheduledTask -TaskName "BotForg PromptAgent"
```

### Включить автозапуск обратно:
```powershell
Enable-ScheduledTask -TaskName "BotForg PromptAgent"
```

### Удалить задачу автозапуска:
```powershell
Unregister-ScheduledTask -TaskName "BotForg PromptAgent" -Confirm:$false
```

---

## 📊 Логи:

- **Логи автозапуска:** `monitoring/startup.log`
- **Логи бота:** `monitoring/logs/agent.log`

Посмотреть последние записи:
```powershell
Get-Content monitoring/startup.log -Tail 20
```

---

## 🔧 Переустановка автозапуска:

Если что-то пошло не так, просто запустите снова:
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File monitoring\setup_autorun.ps1
```

---

## ℹ️ Как это работает:

1. **Task Scheduler** запускает `monitoring/startup.bat` при входе в Windows
2. `startup.bat` проверяет переменные окружения (`TG_BOT_TOKEN`, `TG_CHAT_ID`)
3. Запускается `python -m monitoring.prompt_agent`
4. Бот отправляет сообщение "🤖 Агент команд запущен ✅" в Telegram

---

## 🚨 Устранение проблем:

### Бот не запустился?

1. Проверьте переменные окружения:
```powershell
[System.Environment]::GetEnvironmentVariable("TG_BOT_TOKEN", "User")
[System.Environment]::GetEnvironmentVariable("TG_CHAT_ID", "User")
```

2. Проверьте логи:
```powershell
Get-Content monitoring/startup.log -Tail 20
```

3. Попробуйте запустить вручную:
```powershell
cd C:\Users\mamon\botforg
python -m monitoring.prompt_agent
```

### Бот запустился дважды?

Это нормально - система защиты `single_instance` блокирует второй запуск. Проверьте логи:
```powershell
Get-Content monitoring/startup.log -Tail 5
```

Должно быть: `[single_instance] already running: PID=XXXXX`

---

## 📞 Проверка работы:

В Telegram отправьте: `/help`

Должен прийти список команд.

