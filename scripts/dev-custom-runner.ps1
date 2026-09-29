#requires -Version 5.1
# Canonical BotForg Custom Block Development Runner launcher.
# Usage (from repo root): .\scripts\dev-custom-runner.ps1

$ErrorActionPreference = 'Continue'

$root = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
$runnerDir = Join-Path $root 'custom-runner'
$runnerEntry = Join-Path $runnerDir 'server.mjs'
$RunnerHost = '127.0.0.1'
$RunnerPort = 8090
$logStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logRunner = Join-Path $PSScriptRoot ".dev-custom-runner-$logStamp.log"
$tokenFile = Join-Path $PSScriptRoot '.dev-custom-runner-token'

function Get-ListenerPids {
    param([int]$Port)
    try {
        return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique |
            Where-Object { $_ -and ($null -ne (Get-Process -Id $_ -ErrorAction SilentlyContinue)) })
    } catch { return @() }
}

function Get-ProcessCommandLine {
    param([int]$ProcessId)
    try {
        $row = Get-CimInstance -ClassName Win32_Process -Filter ("ProcessId=" + $ProcessId) -ErrorAction SilentlyContinue
        if ($row) { return $row.CommandLine }
    } catch {}
    return $null
}

function Test-IsThisRunner {
    param([string]$CommandLine)
    if (-not $CommandLine) { return $false }
    $normalized = $CommandLine.Replace('/', '\').ToLowerInvariant()
    return (($normalized -match 'node') -and ($normalized.Contains($runnerEntry.ToLowerInvariant())))
}

if (-not (Test-Path -LiteralPath $runnerEntry)) {
    Write-Host "ERROR: missing runner entry: $runnerEntry" -ForegroundColor Red
    exit 1
}
if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    Write-Host 'ERROR: node.exe is not available.' -ForegroundColor Red
    exit 1
}

$listeners = @(Get-ListenerPids -Port $RunnerPort)
foreach ($listenerPid in $listeners) {
    $commandLine = Get-ProcessCommandLine -ProcessId $listenerPid
    if (-not (Test-IsThisRunner -CommandLine $commandLine)) {
        Write-Host "ERROR: port $RunnerPort is occupied by an unknown process. Fail closed." -ForegroundColor Red
        exit 1
    }
    Write-Host ("Replacing BotForg Development Runner PID {0}" -f $listenerPid) -ForegroundColor Yellow
    Stop-Process -Id $listenerPid -Force -ErrorAction SilentlyContinue
}

$names = @('CUSTOM_BLOCK_RUNNER_HOST', 'CUSTOM_BLOCK_RUNNER_PORT', 'CUSTOM_BLOCK_RUNNER_SHARED_TOKEN')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$env:CUSTOM_BLOCK_RUNNER_HOST = $RunnerHost
$env:CUSTOM_BLOCK_RUNNER_PORT = [string]$RunnerPort
$tokenBytes = New-Object byte[] 32
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $random.GetBytes($tokenBytes) } finally { $random.Dispose() }
$env:CUSTOM_BLOCK_RUNNER_SHARED_TOKEN = -join ($tokenBytes | ForEach-Object { $_.ToString('x2') })
[System.IO.File]::WriteAllText($tokenFile, $env:CUSTOM_BLOCK_RUNNER_SHARED_TOKEN)

$wrapper = 'cd /d "' + $runnerDir + '" && node "' + $runnerEntry + '" > "' + $logRunner + '" 2>&1'
$process = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $wrapper) `
    -WorkingDirectory $runnerDir -WindowStyle Hidden -PassThru

foreach ($name in $names) {
    [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process')
}

if (-not $process) {
    Write-Host 'ERROR: failed to start Development Runner.' -ForegroundColor Red
    exit 1
}

$health = "http://${RunnerHost}:${RunnerPort}/healthz"
$deadline = (Get-Date).AddSeconds(30)
$ready = $false
while ((Get-Date) -lt $deadline) {
    try {
        $response = Invoke-RestMethod -Uri $health -Method Get -TimeoutSec 2
        if ($response.status -eq 'ok') { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
}

if (-not $ready) {
    Write-Host "ERROR: Development Runner health check failed. See log: $logRunner" -ForegroundColor Red
    exit 1
}

Write-Host 'Development Runner ready.' -ForegroundColor Green
Write-Host ("  healthz: {0}" -f $health)
Write-Host ("  profile: quickjs-wasm-v1")
Write-Host ("  starter_pid: {0}" -f $process.Id)
Write-Host ("  log: {0}" -f $logRunner)
exit 0
