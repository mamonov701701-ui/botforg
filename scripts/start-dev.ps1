# Полный запуск проекта: освобождение портов, миграции, backend + frontend.
# Запускать из корня проекта: .\scripts\start-dev.ps1

$ErrorActionPreference = 'Stop'
$root = if ($PSScriptRoot) { (Split-Path -Parent $PSScriptRoot) } else { (Get-Location).Path }
Set-Location $root

Write-Host "=== BotForg: запуск проекта ===" -ForegroundColor Cyan
Write-Host ""

# 1. Освобождаем порты 8001 и 5173 (если заняты)
function Stop-ProcessOnPort {
    param([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($conn) {
            $conn | ForEach-Object {
                $pid = $_.OwningProcess
                $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Host "Останавливаем процесс на порту $Port (PID $pid): $($proc.ProcessName)" -ForegroundColor Yellow
                    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                    Start-Sleep -Milliseconds 500
                }
            }
        }
    } catch { Write-Host "Порт $Port не проверен (можно игнорировать)." -ForegroundColor Gray }
}
Stop-ProcessOnPort -Port 8001
Stop-ProcessOnPort -Port 5173
Start-Sleep -Seconds 1

# 2. Применяем миграции БД (таблица user_settings и др.)
Write-Host "Применение миграций БД..." -ForegroundColor Cyan
try {
    & python -m alembic upgrade head
    Write-Host "Миграции применены." -ForegroundColor Green
} catch {
    Write-Host "Предупреждение: не удалось применить миграции. Запуск продолжается." -ForegroundColor Yellow
}
Write-Host ""

# 3. Запуск backend в новом окне CMD
$backendArg = 'cd /d "' + $root + '" && python -m uvicorn backend.main:app --host 0.0.0.0 --port 8001'
Write-Host 'Запуск Backend (порт 8001)...' -ForegroundColor Cyan
Start-Process cmd -ArgumentList '/k', $backendArg
Start-Sleep -Seconds 4

# 4. Запуск frontend в новом окне CMD
$frontendArg = 'cd /d "' + $root + '\frontend" && npm run dev'
Write-Host 'Запуск Frontend (порт 5173)...' -ForegroundColor Cyan
Start-Process cmd -ArgumentList '/k', $frontendArg
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "=== Готово ===" -ForegroundColor Green
Write-Host ('Backend:  http://localhost:8001') -ForegroundColor White
Write-Host ('Frontend: http://localhost:5173') -ForegroundColor White
Write-Host "Закройте два открывшихся окна PowerShell, чтобы остановить серверы." -ForegroundColor Gray
