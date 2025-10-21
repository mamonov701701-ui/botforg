# scripts/install-test-deps.ps1
# Устанавливает зависимости для тестирования BotForg

$Root = Split-Path -Parent $PSScriptRoot

Write-Host "🧪 Установка зависимостей для тестирования BotForg..." -ForegroundColor Green

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

Write-Host "✅ Зависимости для тестирования установлены!" -ForegroundColor Green
Write-Host ""
Write-Host "Теперь можно запускать тесты:" -ForegroundColor Cyan
Write-Host "  python -m pytest -v tests" -ForegroundColor White
Write-Host ""
Write-Host "Или через VS Code:" -ForegroundColor Cyan
Write-Host "  Terminal → Run Task… → Tests: Pytest (venv)" -ForegroundColor White










































