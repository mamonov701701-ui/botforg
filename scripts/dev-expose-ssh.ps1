# SSH Tunnel через localhost.run - РАБОТАЕТ ВЕЗДЕ!
param(
  [int]$BackendPort = 8001,
  [int]$FrontendPort = 5173
)

$ErrorActionPreference = 'Continue'

# Проверяем что сервера запущены
$beRunning = $false
$feRunning = $false

try {
  $null = Test-NetConnection -ComputerName localhost -Port $BackendPort -InformationLevel Quiet -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
  $beRunning = $?
} catch { $beRunning = $false }

try {
  $null = Test-NetConnection -ComputerName localhost -Port $FrontendPort -InformationLevel Quiet -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
  $feRunning = $?
} catch { $feRunning = $false }

if (-not $beRunning -and -not $feRunning) {
  Write-Output "BACKEND_URL=NOT_RUNNING"
  Write-Output "FRONTEND_URL=NOT_RUNNING"
  exit 0
}

# Останавливаем старые SSH туннели
Get-Process ssh -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*localhost.run*" } | Stop-Process -Force
Start-Sleep 2

# Создаем временные файлы для логов
$beLog = [System.IO.Path]::GetTempFileName()
$feLog = [System.IO.Path]::GetTempFileName()

# Запускаем SSH туннели через cmd (процесс уходит в фон СРАЗУ)
if ($beRunning) {
  $cmd = "start /B ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R 80:localhost:$BackendPort nokey@localhost.run > `"$beLog`" 2>&1"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmd -WindowStyle Hidden
}

if ($feRunning) {
  $cmd = "start /B ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R 80:localhost:$FrontendPort nokey@localhost.run > `"$feLog`" 2>&1"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmd -WindowStyle Hidden
}

# Ждем URLs (8 секунд достаточно)
Start-Sleep -Seconds 8

$beUrl = if ($beRunning) { "PENDING" } else { "NOT_RUNNING" }
$feUrl = if ($feRunning) { "PENDING" } else { "NOT_RUNNING" }

if ($beRunning -and (Test-Path $beLog)) {
  $content = Get-Content $beLog -Raw -ErrorAction SilentlyContinue
  if ($content -match "(https?://[a-z0-9]+\.lhr\.life)") {
    $beUrl = $matches[1]
  }
}

if ($feRunning -and (Test-Path $feLog)) {
  $content = Get-Content $feLog -Raw -ErrorAction SilentlyContinue
  if ($content -match "(https?://[a-z0-9]+\.lhr\.life)") {
    $feUrl = $matches[1]
  }
}

# Очистка (НЕ удаляем логи - процессы SSH продолжают в них писать)

Write-Output ("BACKEND_URL={0}" -f $beUrl)
Write-Output ("FRONTEND_URL={0}" -f $feUrl)

