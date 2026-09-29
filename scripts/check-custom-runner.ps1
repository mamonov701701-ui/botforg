#requires -Version 5.1
# Development-only Backend -> Runner authenticated execution self-check.

$ErrorActionPreference = 'Stop'
$runnerHealthUrl = 'http://127.0.0.1:8090/healthz'
$backendHealthUrl = 'http://127.0.0.1:8001/healthz'
$runtimeStatusUrl = 'http://127.0.0.1:8001/dev/custom-block-runtime/status'
$runtimeProbeUrl = 'http://127.0.0.1:8001/dev/custom-block-runtime/probe'

function Stop-WithCode {
    param([string]$Code, [string]$Message)
    Write-Host ("FAIL {0}: {1}" -f $Code, $Message) -ForegroundColor Red
    exit 1
}

try {
    $runner = Invoke-RestMethod -Uri $runnerHealthUrl -Method Get -TimeoutSec 5
    if ($runner.status -ne 'ok') { Stop-WithCode 'runner_not_running' 'Runner health returned a non-ready status.' }
    Write-Host ("PASS runner_health profile={0}" -f $runner.runner_profile) -ForegroundColor Green
} catch {
    Stop-WithCode 'runner_not_running' 'Start scripts/dev-custom-runner.ps1.'
}

try {
    $backend = Invoke-RestMethod -Uri $backendHealthUrl -Method Get -TimeoutSec 5
    if ($backend.status -ne 'ok') { Stop-WithCode 'backend_not_running' 'Backend health returned a non-ready status.' }
    Write-Host 'PASS backend_health' -ForegroundColor Green
} catch {
    Stop-WithCode 'backend_not_running' 'Start scripts/dev-backend.ps1.'
}

$runtimeResponses = @()
for ($attempt = 1; $attempt -le 8; $attempt++) {
    try {
        $runtimeResponses += Invoke-RestMethod -Uri $runtimeStatusUrl -Method Get -TimeoutSec 5
    } catch {
        Stop-WithCode 'backend_process_conflict' 'A stale Backend worker answered without canonical runtime diagnostics.'
    }
}
$workerIds = @($runtimeResponses | Select-Object -ExpandProperty process_id -Unique)
if ($workerIds.Count -ne 1) {
    Stop-WithCode 'backend_process_conflict' ("More than one Backend worker answered: {0}" -f ($workerIds -join ','))
}
$runtime = $runtimeResponses[0]

if (-not $runtime.feature_enabled) { Stop-WithCode 'feature_disabled' 'Backend worker has execution disabled.' }
if (-not $runtime.runner_url_configured) { Stop-WithCode 'runner_url_missing' 'Backend worker has no Runner URL.' }
if (-not $runtime.token_configured) { Stop-WithCode 'auth_mismatch' 'Backend worker has no Runner service token.' }
Write-Host ("PASS backend_runtime_config pid={0} runner={1}:{2} token_fingerprint={3}" -f $runtime.process_id, $runtime.runner_host, $runtime.runner_port, $runtime.token_fingerprint) -ForegroundColor Green

try {
    $probe = Invoke-RestMethod -Uri $runtimeProbeUrl -Method Post -TimeoutSec 10
} catch {
    $code = 'backend_runner_handshake_failed'
    try {
        $payload = $_.ErrorDetails.Message | ConvertFrom-Json
        if ($payload.detail.code) { $code = [string]$payload.detail.code }
    } catch {}
    Stop-WithCode $code 'Authenticated Backend to Runner JavaScript probe failed.'
}

if ($probe.status -ne 'ok' -or $probe.route -ne 'success') {
    Stop-WithCode 'invalid_runner_response' 'Probe did not return route=success.'
}
Write-Host ("PASS backend_runner_handshake route={0} profile={1} duration_ms={2}" -f $probe.route, $probe.runner_profile, $probe.duration_ms) -ForegroundColor Green
Write-Host 'PASS custom_block_runtime_self_check' -ForegroundColor Green
