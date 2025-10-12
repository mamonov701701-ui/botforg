# scripts/install-deps.ps1
# Устанавливает все зависимости для BotForg

$Root = Split-Path -Parent $PSScriptRoot

Write-Host "🚀 Установка зависимостей BotForg..." -ForegroundColor Green

# Активируем виртуальное окружение
Write-Host "📦 Активация виртуального окружения..." -ForegroundColor Yellow
& "$Root\venv\Scripts\Activate.ps1"

# Обновляем pip
Write-Host "⬆️ Обновление pip..." -ForegroundColor Yellow
python -m pip install --upgrade pip

# Устанавливаем runtime зависимости
Write-Host "🔧 Установка runtime зависимостей..." -ForegroundColor Yellow
pip install -r "$Root\backend\requirements.txt"

# Устанавливаем зависимости для разработки и тестов
Write-Host "🧪 Установка зависимостей для разработки и тестов..." -ForegroundColor Yellow
pip install -r "$Root\backend\requirements-dev.txt"

# Устанавливаем frontend зависимости
Write-Host "🎨 Установка frontend зависимостей..." -ForegroundColor Yellow
Set-Location "$Root\frontend"
if (Test-Path "package-lock.json") {
    npm ci
} else {
    npm install
}

# Возвращаемся в корень
Set-Location $Root

Write-Host "✅ Все зависимости установлены!" -ForegroundColor Green
Write-Host ""
Write-Host "Теперь можно запускать тесты:" -ForegroundColor Cyan
Write-Host "  pytest -v tests" -ForegroundColor White
Write-Host ""
Write-Host "Или запускать проект:" -ForegroundColor Cyan
Write-Host "  .\scripts\start-dev.ps1" -ForegroundColor White


































