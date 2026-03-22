#requires -Version 5.1
# Stop dev servers: free ports 8001, 5173, 5174 (BotForg)

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

Write-Host 'Stopping ports 8001, 5173, 5174...'
foreach ($p in 8001, 5173, 5174) {
    Stop-ProcessOnPort -Port $p
}
Write-Host 'Done.'
