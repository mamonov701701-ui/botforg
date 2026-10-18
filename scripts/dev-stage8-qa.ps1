#requires -Version 5.1
# Local Stage 8 QA: loopback mailbox plus the canonical backend launcher.
# Start Vite separately from frontend with: npm.cmd run dev

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$python = Join-Path $root 'backend\venv\Scripts\python.exe'
$mailboxScript = Join-Path $PSScriptRoot 'dev-local-mailbox.py'
if (-not (Test-Path -LiteralPath $python) -or -not (Test-Path -LiteralPath $mailboxScript)) {
    throw 'Project Python or local mailbox script is missing.'
}

# The mailbox is intentionally unavailable outside local Development.
& $python -c "from pathlib import Path; from backend.settings import settings; assert settings.ENVIRONMENT == 'development'; assert Path(settings.DATABASE_URL.removeprefix('sqlite:///')).resolve() == Path('botforg.db').resolve()"
if ($LASTEXITCODE -ne 0) { throw 'Expected the workspace Development SQLite configuration.' }

function Test-LocalPort {
    param([int]$Port)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $result = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $result.AsyncWaitHandle.WaitOne(400)) { return $false }
        $client.EndConnect($result)
        return $true
    } catch { return $false } finally { $client.Close() }
}

function Test-LocalSmtpGreeting {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $client.Connect('127.0.0.1', 1025)
        $client.ReceiveTimeout = 2000
        $reader = New-Object System.IO.StreamReader($client.GetStream())
        return ($reader.ReadLine() -eq '220 BotForg local development mailbox')
    } catch { return $false } finally { $client.Close() }
}

$mailboxReady = $false
try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8025/healthz' -TimeoutSec 2
    $mailboxReady = ($health.service -eq 'botforg-dev-local-mailbox' -and $health.status -eq 'ok')
} catch { }
if (-not $mailboxReady) {
    if ((Test-LocalPort 8025) -or (Test-LocalPort 1025)) {
        throw 'Local mailbox port 8025 or 1025 is occupied by an unknown service.'
    }
    $mailbox = Start-Process -FilePath $python -ArgumentList @('"' + $mailboxScript + '"') `
        -WorkingDirectory $root -WindowStyle Hidden -PassThru
    if (-not $mailbox) { throw 'Could not start the local mailbox.' }
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 300
        try {
            $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8025/healthz' -TimeoutSec 2
            if ($health.service -eq 'botforg-dev-local-mailbox' -and $health.status -eq 'ok') {
                $mailboxReady = $true
                break
            }
        } catch { }
        $mailbox.Refresh()
        if ($mailbox.HasExited) { break }
    }
    if (-not $mailboxReady) { throw 'Local mailbox failed to start.' }
}
if (-not (Test-LocalSmtpGreeting)) { throw 'Local SMTP listener on 1025 is not the BotForg mailbox.' }

$env:SMTP_HOST = '127.0.0.1'
$env:SMTP_PORT = '1025'
$env:SMTP_USE_TLS = 'false'
$env:SMTP_USER = ''
$env:SMTP_PASS = ''
& $python -c "from backend.settings import settings; from backend.services.email_transport import SmtpEmailTransport, get_email_transport; assert not settings.TESTING; assert settings.ENVIRONMENT == 'development'; assert settings.SMTP_HOST == '127.0.0.1' and settings.SMTP_PORT == 1025 and not settings.SMTP_USE_TLS; assert not settings.SMTP_USER and not settings.SMTP_PASS; assert isinstance(get_email_transport(), SmtpEmailTransport)"
if ($LASTEXITCODE -ne 0) { throw 'Local QA SMTP configuration did not select the existing SMTP transport.' }
& (Join-Path $PSScriptRoot 'dev-backend.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Canonical Backend launch failed.' }

# Security notices use the existing outbox and need its separate worker.
$workerModule = 'backend.scripts.run_notification_outbox_worker'
$workerProcesses = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop | Where-Object {
    $_.ExecutablePath -and
    ([System.IO.Path]::GetFullPath($_.ExecutablePath) -ieq [System.IO.Path]::GetFullPath($python)) -and
    $_.CommandLine -like "*${workerModule}*" -and
    $_.CommandLine -like '*--loop*'
})
if ($workerProcesses.Count -eq 0) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $workerOutput = Join-Path $PSScriptRoot ".dev-stage8-outbox-$stamp.log"
    $workerError = Join-Path $PSScriptRoot ".dev-stage8-outbox-$stamp.error.log"
    $worker = Start-Process -FilePath $python -ArgumentList @('-m', $workerModule, '--loop', '--interval', '5') `
        -WorkingDirectory $root -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $workerOutput -RedirectStandardError $workerError
    if (-not $worker) { throw 'Could not start notification outbox worker.' }
    Start-Sleep -Seconds 2
    $worker.Refresh()
    if ($worker.HasExited) { throw 'Notification outbox worker exited during startup.' }
    Write-Host 'Local notification outbox worker started.'
} else {
    Write-Host 'Existing local notification outbox worker reused.'
}
Write-Host 'Local QA mailbox: http://127.0.0.1:8025/'
