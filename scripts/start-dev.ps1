#requires -Version 5.1
# Local dev startup. Ports and proxy: docs/DEV_PORTS.md

$ErrorActionPreference = 'Continue'

$root = if ($PSScriptRoot) {
    Split-Path -Parent $PSScriptRoot
} else {
    (Get-Location).Path
}
Set-Location -LiteralPath $root

$BackendPort = 8011
$LegacyBackendPort = 8002
$FrontendPort = 5173
$FrontendAltPort = 5174

$logStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logBackend = Join-Path $PSScriptRoot ".dev-backend-$logStamp.log"
$logFrontend = Join-Path $PSScriptRoot ".dev-frontend-$logStamp.log"

function Stop-ProcessOnPort {
    param([int]$Port)
    try {
        $connPids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($owningPid in $connPids) {
            if (-not $owningPid) { continue }
            $proc = Get-Process -Id $owningPid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "Port ${Port}: stopping PID $owningPid ($($proc.ProcessName))" -ForegroundColor Yellow
                Stop-Process -Id $owningPid -Force -ErrorAction SilentlyContinue
                # дерево процессов (cmd → python): иначе на 8001 остаются «зомби»-слушатели
                & taskkill.exe /T /F /PID $owningPid 2>$null | Out-Null
            }
        }
    } catch {
        Write-Host "Port ${Port}: could not inspect ($($_.Exception.Message))" -ForegroundColor Gray
    }
}

function Get-ListenerPids {
    param([int]$Port)
    try {
        return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique)
    } catch {
        return @()
    }
}

function Get-ProcessCommandLine {
    param([int]$ProcessId)
    try {
        $wmi = Get-WmiObject Win32_Process -Filter ("ProcessId=" + $ProcessId) -ErrorAction SilentlyContinue
        if ($wmi) { return $wmi.CommandLine }
    } catch {}
    return $null
}

function Test-HttpGetOk {
    param(
        [Parameter(Mandatory = $true)][string]$Uri,
        [string]$ExpectSubstring = ''
    )
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
        try {
            $tmp = [System.IO.Path]::GetTempFileName()
            & curl.exe -fsS --connect-timeout 3 --max-time 8 -o $tmp $Uri 2>$null
            if ($LASTEXITCODE -ne 0) { return $false }
            if ($ExpectSubstring) {
                $body = [System.IO.File]::ReadAllText($tmp)
                Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
                return ($body -like ('*' + $ExpectSubstring + '*'))
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
            return ($body -like ('*' + $ExpectSubstring + '*'))
        }
        return $true
    } catch {
        return $false
    }
}

function Test-BackendUp {
    return (Test-HttpGetOk -Uri ("http://127.0.0.1:$BackendPort/healthz") -ExpectSubstring 'ok')
}

function Test-AuthEmailLoginProbe {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if (-not $curl) { return $true }
    $respFile = [System.IO.Path]::GetTempFileName()
    $payloadFile = [System.IO.Path]::GetTempFileName()
    Set-Content -LiteralPath $payloadFile -Value '{"email":"dev-probe-not-exists@example.com","password":"x"}' -Encoding ascii -NoNewline
    try {
        $lastCode = ''
        for ($attempt = 0; $attempt -lt 10; $attempt++) {
            $raw = & curl.exe -s -S --connect-timeout 3 --max-time 12 -o $respFile -w '%{http_code}' `
                -X POST ("http://127.0.0.1:$BackendPort/auth/email/login") `
                -H 'Content-Type: application/json' `
                --data-binary "@$payloadFile" 2>$null
            if ($LASTEXITCODE -eq 0) {
                $lastCode = ($raw | Out-String).Trim()
                if ($lastCode -eq '401' -or $lastCode -eq '422') {
                    return $true
                }
            }
            Start-Sleep -Seconds 2
        }
        Write-Host ("Auth probe: expected 401 or 422, last http_code={0} (retries exhausted)." -f $lastCode) -ForegroundColor Yellow
        return $false
    } finally {
        Remove-Item -LiteralPath $respFile -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $payloadFile -Force -ErrorAction SilentlyContinue
    }
}

function Test-FrontendUp {
    return (Test-HttpGetOk -Uri ("http://127.0.0.1:$FrontendPort/"))
}

Write-Host '=== BotForg: starting dev ===' -ForegroundColor Cyan
Write-Host ''

foreach ($p in $LegacyBackendPort, $BackendPort, $FrontendPort, $FrontendAltPort) {
    Stop-ProcessOnPort -Port $p
}
Start-Sleep -Seconds 2
for ($drain = 0; $drain -lt 10; $drain++) {
    $stillBusy = @()
    foreach ($p in $LegacyBackendPort, $BackendPort, $FrontendPort, $FrontendAltPort) {
        $stillBusy += @(Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue)
    }
    if (-not $stillBusy) { break }
    foreach ($row in $stillBusy) {
        if ($row.OwningProcess) {
            Stop-Process -Id $row.OwningProcess -Force -ErrorAction SilentlyContinue
            & taskkill.exe /T /F /PID $row.OwningProcess 2>$null | Out-Null
        }
    }
    Start-Sleep -Milliseconds 400
}

$venvPython = Join-Path $root 'backend\venv\Scripts\python.exe'
if (Test-Path -LiteralPath $venvPython) {
    $pyExe = $venvPython
    Write-Host "Python (venv): $pyExe" -ForegroundColor Gray
} else {
    $pyCmd = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pyCmd) {
        Write-Host 'ERROR: backend\venv\Scripts\python.exe not found and python is not in PATH.' -ForegroundColor Red
        exit 1
    }
    $pyExe = $pyCmd.Source
    Write-Host "WARNING: venv not found, using $pyExe" -ForegroundColor Yellow
}

Write-Host 'Running DB migrations (alembic upgrade head)...' -ForegroundColor Cyan
& $pyExe -m alembic upgrade head
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARNING: alembic exited with code $LASTEXITCODE. Continuing startup." -ForegroundColor Yellow
}
Write-Host ''

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
    $npm = Get-Command npm -ErrorAction SilentlyContinue
}
if (-not $npm) {
    Write-Host 'ERROR: npm not found in PATH.' -ForegroundColor Red
    exit 1
}
$npmExe = $npm.Source

# По умолчанию без --reload: под StatReload uvicorn может принимать запросы до завершения lifespan в worker → 500 на /auth/email/login во время SQLite/Alembic.
# Горячая перезагрузка: `$env:BOTFORG_UVICORN_RELOAD='1'` перед запуском (с узкой директорией `backend/`).
$reloadExtra = ''
if ($env:BOTFORG_UVICORN_RELOAD -eq '1') {
    $reloadBackendDir = Join-Path $root 'backend'
    $reloadExtra = ' --reload --reload-dir "' + $reloadBackendDir + '"'
}
$beCmd = 'cd /d "' + $root + '" && "' + $pyExe + '" -u -m uvicorn backend.main:app --host 0.0.0.0 --port ' + $BackendPort + $reloadExtra
Write-Host ("Starting backend ($BackendPort)...") -ForegroundColor Cyan
$beWrapper = $beCmd + ' > "' + $logBackend + '" 2>&1'
$beProc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', $beWrapper) `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -PassThru

if (-not $beProc) {
    Write-Host 'ERROR: failed to start backend process.' -ForegroundColor Red
    exit 1
}

$feDir = Join-Path $root 'frontend'
$feCmd = 'cd /d "' + $feDir + '" && set BOTFORG_BACKEND_PORT=' + $BackendPort + ' && "' + $npmExe + '" run dev'
Write-Host ("Starting frontend ($FrontendPort)...") -ForegroundColor Cyan
$feWrapper = $feCmd + ' > "' + $logFrontend + '" 2>&1'
$feProc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', $feWrapper) `
    -WorkingDirectory $feDir `
    -WindowStyle Hidden `
    -PassThru

if (-not $feProc) {
    Write-Host 'ERROR: failed to start frontend process.' -ForegroundColor Red
    try { Stop-Process -Id $beProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    foreach ($p in $LegacyBackendPort, $BackendPort, $FrontendPort, $FrontendAltPort) { Stop-ProcessOnPort -Port $p }
    exit 1
}

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
if (-not $okBe) { $failed += ("backend (http://127.0.0.1:$BackendPort/healthz)") }
if (-not $okFe) { $failed += ("frontend (http://127.0.0.1:$FrontendPort/)") }

if ($failed.Count -gt 0) {
    Write-Host ''
    Write-Host 'ERROR: services did not start:' -ForegroundColor Red
    $failed | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host ''
    Write-Host "Backend log tail:  $logBackend" -ForegroundColor Yellow
    Write-Host "Frontend log tail: $logFrontend" -ForegroundColor Yellow
    Get-Content -Path $logBackend -Tail 30 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[BE] $_" }
    Get-Content -Path $logFrontend -Tail 30 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[FE] $_" }

    try { Stop-Process -Id $beProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    try { Stop-Process -Id $feProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    foreach ($p in $LegacyBackendPort, $BackendPort, $FrontendPort, $FrontendAltPort) { Stop-ProcessOnPort -Port $p }

    exit 1
}

# После первого ответа Vite приложение часто шлёт пачку запросов на API; при SQLite одиночный writer и POST login-probe может получить 500.
Start-Sleep -Seconds 6

# NOTE: backend/frontend readiness is already validated in the wait loop above.
# Avoid single-shot rechecks here to prevent flaky startup failures.
if (-not (Test-AuthEmailLoginProbe)) {
    Write-Host 'ERROR: POST /auth/email/login must return 401 or 422 (middleware/auth regression). See backend log.' -ForegroundColor Red
    Get-Content -Path $logBackend -Tail 40 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[BE] $_" }
    try { Stop-Process -Id $beProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    try { Stop-Process -Id $feProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    foreach ($p in $LegacyBackendPort, $BackendPort, $FrontendPort, $FrontendAltPort) { Stop-ProcessOnPort -Port $p }
    exit 1
}

$listenerPids = Get-ListenerPids -Port $BackendPort
if ($listenerPids.Count -ne 1) {
    Write-Host ("ERROR: expected exactly one backend listener on port $BackendPort, found $($listenerPids.Count).") -ForegroundColor Red
    foreach ($listenerProcId in $listenerPids) {
        $cmd = Get-ProcessCommandLine -ProcessId $listenerProcId
        Write-Host ("  PID=$listenerProcId CMD=$cmd") -ForegroundColor Yellow
    }
    exit 1
}
$listenerPid = [int]$listenerPids[0]
$listenerCmd = Get-ProcessCommandLine -ProcessId $listenerPid
Write-Host ("Backend listener: port=$BackendPort pid=$listenerPid") -ForegroundColor White
if ($listenerCmd) {
    Write-Host ("Backend command: $listenerCmd") -ForegroundColor Gray
} else {
    $listenerProc = Get-Process -Id $listenerPid -ErrorAction SilentlyContinue
    if ($listenerProc) {
        Write-Host ("Backend process: name=$($listenerProc.ProcessName)") -ForegroundColor Gray
    }
}

Write-Host ''
Write-Host '=== Startup OK ===' -ForegroundColor Green
Write-Host ("Backend:   http://localhost:$BackendPort  (healthz: /healthz)") -ForegroundColor White
Write-Host ("Frontend:  http://localhost:$FrontendPort") -ForegroundColor White
Write-Host "Backend log:  $logBackend" -ForegroundColor Gray
Write-Host "Frontend log: $logFrontend" -ForegroundColor Gray
Write-Host 'Stop:    .\scripts\stop-dev.ps1' -ForegroundColor Gray
Write-Host ''

exit 0
