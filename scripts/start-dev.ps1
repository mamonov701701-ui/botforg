#requires -Version 5.1
<#
.SYNOPSIS
  Локальный запуск BotForg: освобождение портов, миграции, backend (8001), frontend (5173).
  Без отдельных окон CMD - процессы в фоне, логи в scripts/.dev-*.log
  Запуск из корня:  .\scripts\start-dev.ps1
#>

$ErrorActionPreference = 'Continue'

$root = if ($PSScriptRoot) {
    Split-Path -Parent $PSScriptRoot
} else {
    (Get-Location).Path
}
Set-Location -LiteralPath $root

# Уникальные логи на каждый запуск — не трогаем старые файлы (их часто держит uvicorn --reload / cmd)
$logStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logBackend = Join-Path $PSScriptRoot ".dev-backend-$logStamp.log"
$logFrontend = Join-Path $PSScriptRoot ".dev-frontend-$logStamp.log"

function Stop-ProcessOnPort {
    param([int]$Port)
    try {
        $pids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($owningPid in $pids) {
            if (-not $owningPid) { continue }
            $proc = Get-Process -Id $owningPid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "Порт ${Port}: останавливаем PID $owningPid ($($proc.ProcessName))" -ForegroundColor Yellow
                Stop-Process -Id $owningPid -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {
        Write-Host "Порт ${Port}: не удалось проверить ($($_.Exception.Message))" -ForegroundColor Gray
    }
}

function Test-HttpGetOk {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [string]$ExpectSubstring = ''
    )
    # curl.exe (Windows 10+): без парсинга IE, стабильно для Vite/FastAPI
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
        try {
            $tmp = [System.IO.Path]::GetTempFileName()
            & curl.exe -fsS --connect-timeout 3 --max-time 8 -o $tmp $Uri 2>$null
            if ($LASTEXITCODE -ne 0) { return $false }
            if ($ExpectSubstring) {
                $body = [System.IO.File]::ReadAllText($tmp)
                Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
                return ($body -like "*$ExpectSubstring*")
            }
            Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
            return $true
        } catch {
            return $false
        }
    }
    try {
        $wc = New-Object System.Net.WebClient
        $wc.Proxy = New-Object System.Net.WebProxy($null)
        $wc.Headers.Add('User-Agent', 'BotForg-start-dev')
        $body = $wc.DownloadString($Uri)
        if ($ExpectSubstring) {
            return ($body -like "*$ExpectSubstring*")
        }
        return $true
    } catch {
        return $false
    }
}

function Test-BackendUp {
    return (Test-HttpGetOk -Uri 'http://127.0.0.1:8001/healthz' -ExpectSubstring 'ok')
}

function Test-FrontendUp {
    return (Test-HttpGetOk -Uri 'http://127.0.0.1:5173/')
}

Write-Host '=== BotForg: запуск проекта ===' -ForegroundColor Cyan
Write-Host ''

# 1. Порты (в т.ч. 5174 - запасной Vite)
foreach ($p in 8001, 5173, 5174) {
    Stop-ProcessOnPort -Port $p
}
# Дать ОС закрыть дескрипторы логов после остановки cmd/node/python
Start-Sleep -Seconds 2

# 2. Миграции (внешняя команда: try/catch не ловит ошибку exe - смотрим LASTEXITCODE)
Write-Host 'Применение миграций БД (alembic upgrade head)...' -ForegroundColor Cyan
& python -m alembic upgrade head
if ($LASTEXITCODE -ne 0) {
    Write-Host "Предупреждение: alembic завершился с кодом $LASTEXITCODE. Запуск серверов продолжается." -ForegroundColor Yellow
}
Write-Host ''

# 3. Проверка наличия python / npm в PATH
$py = Get-Command python -ErrorAction SilentlyContinue
if (-not $py) {
    Write-Host 'ОШИБКА: в PATH не найден python.' -ForegroundColor Red
    exit 1
}
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
    $npm = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $npm) {
    Write-Host 'ОШИБКА: в PATH не найден npm.' -ForegroundColor Red
    exit 1
}
$npmExe = $npm.Source

# Do not use $pid as a variable name - it aliases $PID (current process id) and breaks the script.

# Backend: cmd скрыто, вывод в лог
$beCmd = "cd /d `"$root`" && python -m uvicorn backend.main:app --host 0.0.0.0 --port 8001 --reload"
Write-Host 'Запуск backend (8001)...' -ForegroundColor Cyan
$beProc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', "$beCmd > `"$logBackend`" 2>&1") `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -PassThru

if (-not $beProc) {
    Write-Host 'ОШИБКА: не удалось запустить процесс backend.' -ForegroundColor Red
    exit 1
}

# Frontend
$feDir = Join-Path $root 'frontend'
$feCmd = "cd /d `"$feDir`" && `"$npmExe`" run dev"
Write-Host 'Запуск frontend (5173)...' -ForegroundColor Cyan
$feProc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', "$feCmd > `"$logFrontend`" 2>&1") `
    -WorkingDirectory $feDir `
    -WindowStyle Hidden `
    -PassThru

if (-not $feProc) {
    Write-Host 'ОШИБКА: не удалось запустить процесс frontend.' -ForegroundColor Red
    try { Stop-Process -Id $beProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    foreach ($p in 8001, 5173, 5174) { Stop-ProcessOnPort -Port $p }
    exit 1
}

# 5. Ожидание готовности
$deadline = (Get-Date).AddSeconds(90)
$okBe = $false
$okFe = $false

while ((Get-Date) -lt $deadline) {
    if (-not $okBe) { $okBe = Test-BackendUp }
    if (-not $okFe) { $okFe = Test-FrontendUp }
    if ($okBe -and $okFe) { break }
    Start-Sleep -Seconds 1
}

$failed = @()
if (-not $okBe) { $failed += 'backend (http://127.0.0.1:8001/healthz)' }
if (-not $okFe) { $failed += 'frontend (http://127.0.0.1:5173/)' }

if ($failed.Count -gt 0) {
    Write-Host ''
    Write-Host 'ОШИБКА: не поднялись сервисы:' -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host ''
    Write-Host "Хвост лога backend:  $logBackend" -ForegroundColor Yellow
    Write-Host "Хвост лога frontend: $logFrontend" -ForegroundColor Yellow
    Get-Content -Path $logBackend -Tail 30 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[BE] $_" }
    Get-Content -Path $logFrontend -Tail 30 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[FE] $_" }

    try { Stop-Process -Id $beProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    try { Stop-Process -Id $feProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    foreach ($p in 8001, 5173, 5174) { Stop-ProcessOnPort -Port $p }

    exit 1
}

# Повторная явная проверка (как требование ТЗ)
if (-not (Test-BackendUp)) {
    Write-Host 'ОШИБКА: повторная проверка /healthz не прошла.' -ForegroundColor Red
    exit 1
}
if (-not (Test-FrontendUp)) {
    Write-Host 'ОШИБКА: повторная проверка frontend не прошла.' -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host '=== Запуск успешен ===' -ForegroundColor Green
Write-Host 'Backend:   http://localhost:8001  (healthz: /healthz)' -ForegroundColor White
Write-Host 'Frontend:  http://localhost:5173' -ForegroundColor White
Write-Host "Лог backend:  $logBackend" -ForegroundColor Gray
Write-Host "Лог frontend: $logFrontend" -ForegroundColor Gray
Write-Host 'Остановка:    .\scripts\stop-dev.ps1' -ForegroundColor Gray
Write-Host ''

exit 0
