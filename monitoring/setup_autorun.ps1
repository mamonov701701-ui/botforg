$taskName = "BotForg PromptAgent"
$scriptPath = "$env:USERPROFILE\botforg\monitoring\startup.bat"
$workDir = "$env:USERPROFILE\botforg"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Настройка автозапуска BotForg агента" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Проверяем переменные окружения
$token = [System.Environment]::GetEnvironmentVariable("TG_BOT_TOKEN", "User")
$chatId = [System.Environment]::GetEnvironmentVariable("TG_CHAT_ID", "User")

if (-not $token -or -not $chatId) {
    Write-Host "❌ ОШИБКА: Переменные окружения не установлены!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Сначала установите:" -ForegroundColor Yellow
    Write-Host '  [System.Environment]::SetEnvironmentVariable("TG_BOT_TOKEN", "your_token", "User")' -ForegroundColor Gray
    Write-Host '  [System.Environment]::SetEnvironmentVariable("TG_CHAT_ID", "your_chat_id", "User")' -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host "✓ Переменные окружения найдены" -ForegroundColor Green
Write-Host "  TG_BOT_TOKEN: $($token.Substring(0, 10))..." -ForegroundColor Gray
Write-Host "  TG_CHAT_ID: $chatId" -ForegroundColor Gray
Write-Host ""

# Удаляем старую задачу, если есть
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Write-Host "⚠ Удаляем старую задачу..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Создаем новую задачу
Write-Host "📝 Создаём задачу планировщика..." -ForegroundColor Cyan

$action = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c start /min `"$scriptPath`"" `
    -WorkingDirectory $workDir

$trigger = New-ScheduledTaskTrigger -AtStartup

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 2) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Days 0)

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Highest

Register-ScheduledTask `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -TaskName $taskName `
    -Description "Автозапуск Telegram бота BotForg при старте системы" `
    -Force | Out-Null

Write-Host ""
Write-Host "✅ Автозапуск успешно настроен!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Что дальше:" -ForegroundColor Cyan
Write-Host "  1. Перезагрузите компьютер - бот запустится автоматически" -ForegroundColor Gray
Write-Host "  2. Или запустите вручную: python -m monitoring.prompt_agent" -ForegroundColor Gray
Write-Host "  3. В Telegram отправьте /help для проверки" -ForegroundColor Gray
Write-Host ""
Write-Host "📊 Логи автозапуска: monitoring\startup.log" -ForegroundColor Gray
Write-Host ""



