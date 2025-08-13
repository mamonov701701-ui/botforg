Write-Host "🚀 Запуск фронтенда BotForg..." -ForegroundColor Cyan

# Переход в папку frontend
Set-Location -Path "$PSScriptRoot/frontend"

# Установка зависимостей, если не установлены
if (!(Test-Path "node_modules")) {
    Write-Host "📦 Устанавливаем зависимости..." -ForegroundColor Yellow
    npm install
}

# Автоматический запуск браузера
Write-Host "🌐 Открытие http://localhost:5173 ..." -ForegroundColor Green
Start-Process "http://localhost:5173"

# Запуск Vite dev-сервера
npm run dev 