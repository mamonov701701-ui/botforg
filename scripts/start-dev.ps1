#requires -Version 5.1
# Local dev startup. Ports and proxy: docs/DEV_PORTS.md

$ErrorActionPreference = 'Continue'

$root = if ($PSScriptRoot) {
    Split-Path -Parent $PSScriptRoot
} else {
    (Get-Location).Path
}
Set-Location -LiteralPath $root

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
            }
        }
    } catch {
        Write-Host "Port ${Port}: could not inspect ($($_.Exception.Message))" -ForegroundColor Gray
    }
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
    return (Test-HttpGetOk -Uri 'http://127.0.0.1:8001/healthz' -ExpectSubstring 'ok')
}

function Test-AuthEmailLoginProbe {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if (-not $curl) { return $true }
    $respFile = [System.IO.Path]::GetTempFileName()
    $payloadFile = [System.IO.Path]::GetTempFileName()
    try {
        Set-Content -LiteralPath $payloadFile -Value '{"email":"dev-probe-not-exists@example.com","password":"x"}' -Encoding ascii -NoNewline
        $raw = & curl.exe -s -S --connect-timeout 3 --max-time 10 -o $respFile -w '%{http_code}' `
            -X POST 'http://127.0.0.1:8001/auth/email/login' `
            -H 'Content-Type: application/json' `
            --data-binary "@$payloadFile" 2>$null
        if ($LASTEXITCODE -ne 0) { return $false }
        $code = ($raw | Out-String).Trim()
        return ($code -eq '401' -or $code -eq '422')
    } finally {
        Remove-Item -LiteralPath $respFile -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $payloadFile -Force -ErrorAction SilentlyContinue
    }
}

function Test-FrontendUp {
    return (Test-HttpGetOk -Uri 'http://127.0.0.1:5173/')
}

Write-Host '=== BotForg: starting dev ===' -ForegroundColor Cyan
Write-Host ''

foreach ($p in 8001, 5173, 5174) {
    Stop-ProcessOnPort -Port $p
}
Start-Sleep -Seconds 2

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

$beCmd = 'cd /d "' + $root + '" && "' + $pyExe + '" -m uvicorn backend.main:app --host 0.0.0.0 --port 8001 --reload'
Write-Host 'Starting backend (8001)...' -ForegroundColor Cyan
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
$feCmd = 'cd /d "' + $feDir + '" && "' + $npmExe + '" run dev'
Write-Host 'Starting frontend (5173)...' -ForegroundColor Cyan
$feWrapper = $feCmd + ' > "' + $logFrontend + '" 2>&1'
$feProc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList @('/c', $feWrapper) `
    -WorkingDirectory $feDir `
    -WindowStyle Hidden `
    -PassThru

if (-not $feProc) {
    Write-Host 'ERROR: failed to start frontend process.' -ForegroundColor Red
    try { Stop-Process -Id $beProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    foreach ($p in 8001, 5173, 5174) { Stop-ProcessOnPort -Port $p }
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
if (-not $okBe) { $failed += 'backend (http://127.0.0.1:8001/healthz)' }
if (-not $okFe) { $failed += 'frontend (http://127.0.0.1:5173/)' }

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
    foreach ($p in 8001, 5173, 5174) { Stop-ProcessOnPort -Port $p }

    exit 1
}

# NOTE: backend/frontend readiness is already validated in the wait loop above.
# Avoid single-shot rechecks here to prevent flaky startup failures.
if (-not (Test-AuthEmailLoginProbe)) {
    Write-Host 'ERROR: POST /auth/email/login must return 401 or 422 (middleware/auth regression). See backend log.' -ForegroundColor Red
    Get-Content -Path $logBackend -Tail 40 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "[BE] $_" }
    try { Stop-Process -Id $beProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    try { Stop-Process -Id $feProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    foreach ($p in 8001, 5173, 5174) { Stop-ProcessOnPort -Port $p }
    exit 1
}

Write-Host ''
Write-Host '=== Startup OK ===' -ForegroundColor Green
Write-Host 'Backend:   http://localhost:8001  (healthz: /healthz)' -ForegroundColor White
Write-Host 'Frontend:  http://localhost:5173' -ForegroundColor White
Write-Host "Backend log:  $logBackend" -ForegroundColor Gray
Write-Host "Frontend log: $logFrontend" -ForegroundColor Gray
Write-Host 'Stop:    .\scripts\stop-dev.ps1' -ForegroundColor Gray
Write-Host ''

exit 0
