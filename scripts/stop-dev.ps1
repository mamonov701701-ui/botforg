#requires -Version 5.1
# Stop dev servers: free backend + frontend ports (BotForg)

$ErrorActionPreference = 'Continue'

function Stop-ProcessOnPort {
    param([int]$Port)
    try {
        $pids = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($owningPid in $pids) {
            if (-not $owningPid) { continue }
            $proc = Get-Process -Id $owningPid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "Port ${Port}: stopping PID $owningPid ($($proc.ProcessName))"
                Stop-Process -Id $owningPid -Force -ErrorAction SilentlyContinue
            }
        }
    } catch {
        Write-Host "Port ${Port}: $($_.Exception.Message)"
    }
}

# Legacy cleanup only (old dev defaults); not the current backend port
$LegacyBackendPort = 8002
$BackendPort = 8001
$FrontendPort = 5173
$FrontendAltPort = 5174

Write-Host ("Stopping ports $LegacyBackendPort, $BackendPort, $FrontendPort, $FrontendAltPort...")
foreach ($p in $LegacyBackendPort, $BackendPort, $FrontendPort, $FrontendAltPort) {
    Stop-ProcessOnPort -Port $p
}
Write-Host 'Done.'
