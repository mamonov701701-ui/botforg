#requires -Version 5.1
# Canonical BotForg backend-only launcher for local development.
# Usage (from repo root):  .\scripts\dev-backend.ps1
# Stops only a known BotForg uvicorn on :8001; fails closed for unknown listeners.

$ErrorActionPreference = 'Continue'

$root = if ($PSScriptRoot) {
    Split-Path -Parent $PSScriptRoot
} else {
    (Get-Location).Path
}
Set-Location -LiteralPath $root

$BackendPort = 8001
$BackendHost = '127.0.0.1'
$logStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logBackend = Join-Path $PSScriptRoot ".dev-backend-only-$logStamp.log"

function Get-ListenerPids {
    param([int]$Port)
    try {
        return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            Where-Object { $_ -and ($null -ne (Get-Process -Id $_ -ErrorAction SilentlyContinue)) })
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

function Test-IsBotForgUvicorn {
    param([string]$CommandLine)
    if (-not $CommandLine) { return $false }
    $cl = $CommandLine.ToLowerInvariant()
    # Known BotForg API process (venv or worker child).
    return (($cl -match 'uvicorn') -and ($cl -match 'backend\.main:app'))
}

function Test-BackendUp {
    $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
    if ($curl) {
        $tmp = [System.IO.Path]::GetTempFileName()
        try {
            & curl.exe -fsS --connect-timeout 3 --max-time 8 -o $tmp ("http://{0}:{1}/healthz" -f $BackendHost, $BackendPort) 2>$null
            if ($LASTEXITCODE -ne 0) { return $false }
            $body = [System.IO.File]::ReadAllText($tmp)
            return ($body -like '*ok*')
        } finally {
            Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
        }
    }
    try {
        $r = Invoke-WebRequest -Uri ("http://{0}:{1}/healthz" -f $BackendHost, $BackendPort) -UseBasicParsing -TimeoutSec 8
        return ($r.Content -like '*ok*')
    } catch {
        return $false
    }
}

Write-Host '=== BotForg: backend-only (canonical) ===' -ForegroundColor Cyan

$venvPython = Join-Path $root 'backend\venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $venvPython)) {
    Write-Host "ERROR: missing project venv: $venvPython" -ForegroundColor Red
    exit 1
}
$pyExe = $venvPython
Write-Host "Python (venv): $pyExe" -ForegroundColor Gray

$listeners = @(Get-ListenerPids -Port $BackendPort)
if ($listeners.Count -gt 0) {
    $foreign = @()
    foreach ($pidListen in $listeners) {
        $cmd = Get-ProcessCommandLine -ProcessId $pidListen
        if (Test-IsBotForgUvicorn -CommandLine $cmd) {
            Write-Host ("Replacing BotForg backend PID {0}" -f $pidListen) -ForegroundColor Yellow
            Stop-Process -Id $pidListen -Force -ErrorAction SilentlyContinue
            & taskkill.exe /T /F /PID $pidListen 2>$null | Out-Null
        } else {
            $foreign += [pscustomobject]@{ Pid = $pidListen; CommandLine = $cmd }
        }
    }
    # Also stop parent/reloader BotForg uvicorn processes (not always the Listen PID).
    Get-WmiObject Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object { Test-IsBotForgUvicorn -CommandLine $_.CommandLine } |
        ForEach-Object {
            Write-Host ("Stopping BotForg uvicorn tree PID {0}" -f $_.ProcessId) -ForegroundColor Yellow
            & taskkill.exe /T /F /PID $_.ProcessId 2>$null | Out-Null
        }
    Start-Sleep -Seconds 2
    if ($foreign.Count -gt 0) {
        Write-Host "ERROR: port $BackendPort is occupied by an unknown process. Fail closed." -ForegroundColor Red
        foreach ($row in $foreign) {
            Write-Host ("  PID={0} CMD={1}" -f $row.Pid, $row.CommandLine) -ForegroundColor Red
        }
        exit 1
    }
    $still = @(Get-ListenerPids -Port $BackendPort)
    if ($still.Count -gt 0) {
        Write-Host "ERROR: port $BackendPort still busy after stopping BotForg listeners." -ForegroundColor Red
        foreach ($pidListen in $still) {
            Write-Host ("  PID={0} CMD={1}" -f $pidListen, (Get-ProcessCommandLine -ProcessId $pidListen)) -ForegroundColor Red
        }
        exit 1
    }
}

$reloadDir = Join-Path $root 'backend'

Write-Host ("Starting backend {0}:{1} with --reload ..." -f $BackendHost, $BackendPort) -ForegroundColor Cyan
Write-Host ("Log: {0}" -f $logBackend) -ForegroundColor Gray

# cmd redirect (same pattern as start-dev.ps1) — avoids Start-Process same-file stdout/stderr limit on Windows
$beCmd = 'cd /d "' + $root + '" && "' + $pyExe + '" -u -m uvicorn backend.main:app --host ' + $BackendHost + ' --port ' + $BackendPort + ' --reload --reload-dir "' + $reloadDir + '"'
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

$deadline = (Get-Date).AddSeconds(60)
$ok = $false
while ((Get-Date) -lt $deadline) {
    if (Test-BackendUp) { $ok = $true; break }
    Start-Sleep -Seconds 1
}

if (-not $ok) {
    Write-Host 'ERROR: /healthz did not become ready.' -ForegroundColor Red
    Write-Host ("See log: {0}" -f $logBackend) -ForegroundColor Yellow
    exit 1
}

$finalListeners = @(Get-ListenerPids -Port $BackendPort)
Write-Host 'Backend ready.' -ForegroundColor Green
Write-Host ("  healthz: http://{0}:{1}/healthz" -f $BackendHost, $BackendPort)
Write-Host ("  reload: yes (--reload-dir backend)")
Write-Host ("  starter_pid: {0}" -f $beProc.Id)
foreach ($pidListen in $finalListeners) {
    Write-Host ("  listen_pid={0} cmd={1}" -f $pidListen, (Get-ProcessCommandLine -ProcessId $pidListen))
}
exit 0
