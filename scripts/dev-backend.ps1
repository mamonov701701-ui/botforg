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

function Get-ListenerOwnerPids {
    param([int]$Port)
    try {
        return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            Where-Object { $_ })
    } catch {
        return @()
    }
}

function Get-ProcessCommandLine {
    param([int]$ProcessId)
    try {
        $processInfo = Get-CimInstance -ClassName Win32_Process -Filter ("ProcessId=" + $ProcessId) -ErrorAction SilentlyContinue
        if ($processInfo) { return $processInfo.CommandLine }
    } catch {}
    return $null
}

function Test-IsBotForgUvicorn {
    param([string]$CommandLine)
    if (-not $CommandLine) { return $false }
    $cl = $CommandLine.ToLowerInvariant()
    $expectedReloadDir = (Join-Path $root 'backend').ToLowerInvariant()
    # Restrict replacement to the canonical BotForg checkout and port.
    return (($cl -match 'uvicorn') -and ($cl -match 'backend\.main:app') -and
        $cl.Contains($expectedReloadDir) -and ($cl -match '--port\s+8001'))
}

function Get-OrphanUvicornWorkers {
    param([int]$FormerParentId)
    if (-not $FormerParentId) { return @() }
    try {
        return @(Get-CimInstance -ClassName Win32_Process -Filter ("ParentProcessId=" + $FormerParentId) -ErrorAction SilentlyContinue |
            Where-Object {
                ($_.Name -eq 'python.exe') -and
                ($_.CommandLine -match 'multiprocessing\.spawn') -and
                ($_.CommandLine -match ("spawn_main\(parent_pid=" + $FormerParentId + ","))
            })
    } catch { return @() }
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

$cleanupComplete = $false
for ($cleanupPass = 1; $cleanupPass -le 16; $cleanupPass++) {
    $listeners = @(Get-ListenerOwnerPids -Port $BackendPort)
    if ($listeners.Count -eq 0) {
        $cleanupComplete = $true
        break
    }
    $foreign = @()
    $knownRoots = @()
    $missingOwners = @()
    foreach ($pidListen in $listeners) {
        $cmd = Get-ProcessCommandLine -ProcessId $pidListen
        if (Test-IsBotForgUvicorn -CommandLine $cmd) {
            $knownRoots += $pidListen
        } elseif (-not (Get-Process -Id $pidListen -ErrorAction SilentlyContinue)) {
            # A previous launcher killed the Uvicorn reloader before taskkill could
            # discover its children.  The orphan worker can retain the inherited
            # listening socket under the former parent PID on Windows.
            $missingOwners += $pidListen
        } else {
            $foreign += [pscustomobject]@{ Pid = $pidListen; CommandLine = $cmd }
        }
    }

    if ($foreign.Count -gt 0) {
        Write-Host "ERROR: port $BackendPort is occupied by an unknown process. Fail closed." -ForegroundColor Red
        foreach ($row in $foreign) {
            Write-Host ("  PID={0} CMD={1}" -f $row.Pid, $row.CommandLine) -ForegroundColor Red
        }
        exit 1
    }

    # Kill the verified reloader tree first.  Killing the root before taskkill /T
    # orphans multiprocessing workers and leaves stale inherited sockets behind.
    foreach ($rootPid in ($knownRoots | Select-Object -Unique)) {
        Write-Host ("Replacing BotForg backend tree PID {0}" -f $rootPid) -ForegroundColor Yellow
        & taskkill.exe /T /F /PID $rootPid 2>$null | Out-Null
    }

    foreach ($missingOwner in $missingOwners) {
        $orphanWorkers = @(Get-OrphanUvicornWorkers -FormerParentId $missingOwner)
        if ($orphanWorkers.Count -eq 0) {
            Write-Host ("ERROR: port {0} has stale owner PID {1}, but no verified BotForg worker was found. Fail closed." -f $BackendPort, $missingOwner) -ForegroundColor Red
            exit 1
        }
        foreach ($worker in $orphanWorkers) {
            Write-Host ("Stopping orphan BotForg Uvicorn worker PID {0} (former parent {1})" -f $worker.ProcessId, $worker.ParentProcessId) -ForegroundColor Yellow
            Stop-Process -Id $worker.ProcessId -Force -ErrorAction SilentlyContinue
        }
    }

    Start-Sleep -Milliseconds 500
}
if (-not $cleanupComplete) {
    Write-Host "ERROR: port $BackendPort still busy after verified BotForg cleanup passes." -ForegroundColor Red
    foreach ($pidListen in @(Get-ListenerOwnerPids -Port $BackendPort)) {
        Write-Host ("  PID={0} CMD={1}" -f $pidListen, (Get-ProcessCommandLine -ProcessId $pidListen)) -ForegroundColor Red
    }
    exit 1
}

$reloadDir = Join-Path $root 'backend'
$runtimeEnvWrapper = Join-Path $PSScriptRoot 'dev-backend-runtime-env.cmd'
if (-not (Test-Path -LiteralPath $runtimeEnvWrapper)) {
    Write-Host "ERROR: missing runtime environment wrapper: $runtimeEnvWrapper" -ForegroundColor Red
    exit 1
}

Write-Host ("Starting backend {0}:{1} with --reload ..." -f $BackendHost, $BackendPort) -ForegroundColor Cyan
Write-Host ("Log: {0}" -f $logBackend) -ForegroundColor Gray

# cmd redirect (same pattern as start-dev.ps1) — avoids Start-Process same-file stdout/stderr limit on Windows
$beCmd = 'cd /d "' + $root + '" && call "' + $runtimeEnvWrapper + '" "' + $pyExe + '" -u -m uvicorn backend.main:app --host ' + $BackendHost + ' --port ' + $BackendPort + ' --reload --reload-dir "' + $reloadDir + '"'
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

$finalListeners = @(Get-ListenerOwnerPids -Port $BackendPort)
Write-Host 'Backend ready.' -ForegroundColor Green
Write-Host ("  healthz: http://{0}:{1}/healthz" -f $BackendHost, $BackendPort)
Write-Host ("  reload: yes (--reload-dir backend)")
Write-Host ("  starter_pid: {0}" -f $beProc.Id)
foreach ($pidListen in $finalListeners) {
    Write-Host ("  listen_pid={0} cmd={1}" -f $pidListen, (Get-ProcessCommandLine -ProcessId $pidListen))
}
exit 0
