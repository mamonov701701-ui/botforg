# Скрипт запуска Telegram бота для удалённого управления разработкой
# Использование: .\scripts\run_telegram_bot.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Resolve-Path "$root\..")

Write-Host "🤖 Запуск BotForg Telegram Dev Agent..." -ForegroundColor Cyan

# Проверка переменных окружения
$token = $env:TG_BOT_TOKEN
$chatId = $env:TG_CHAT_ID

if (-not $token -or -not $chatId) {
    Write-Host "❌ Ошибка: TG_BOT_TOKEN или TG_CHAT_ID не установлены" -ForegroundColor Red
    Write-Host ""
    Write-Host "Установите переменные окружения:" -ForegroundColor Yellow
    Write-Host "  [Environment]::SetEnvironmentVariable('TG_BOT_TOKEN', 'your_token', 'User')" -ForegroundColor Gray
    Write-Host "  [Environment]::SetEnvironmentVariable('TG_CHAT_ID', 'your_chat_id', 'User')" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Или создайте файл .env в корне проекта" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Нажмите Enter для выхода"
    exit 1
}

# Маскируем токен для безопасности
$maskedToken = $token.Substring(0, [Math]::Min(6, $token.Length)) + "..." + $token.Substring([Math]::Max(0, $token.Length - 4))

Write-Host "✓ TG_BOT_TOKEN: $maskedToken" -ForegroundColor Green
Write-Host "✓ TG_CHAT_ID: $chatId" -ForegroundColor Green
Write-Host ""

# Проверка наличия requests
Write-Host "Проверка зависимостей..." -ForegroundColor Cyan
$hasRequests = python -c "import requests" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠ Устанавливаю requests..." -ForegroundColor Yellow
    pip install requests | Out-Null
}

# Остановить старые экземпляры
Write-Host "Проверка старых процессов..." -ForegroundColor Cyan
$lockFile = "monitoring\prompt_agent.lock"
if (Test-Path $lockFile) {
    Write-Host "⚠ Найден lock файл, удаляю..." -ForegroundColor Yellow
    Remove-Item $lockFile -Force
}

# Запуск бота
Write-Host ""
Write-Host "🚀 Запускаю бота..." -ForegroundColor Cyan
Write-Host "Отправьте /help в Telegram для списка команд" -ForegroundColor Gray
Write-Host "Нажмите Ctrl+C для остановки" -ForegroundColor Gray
Write-Host ""

python -m monitoring.prompt_agent

