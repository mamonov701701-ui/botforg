# Создаёт 2 ngrok туннеля для backend и frontend

param(
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 5173
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Resolve-Path "$root\..")

# Проверяем, что ngrok установлен
if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
  Write-Output "BACKEND_URL=ERROR: ngrok not found"
  Write-Output "FRONTEND_URL=ERROR: ngrok not found"
  exit 1
}

# Запускаем ngrok туннели в фоне
$beProcess = Start-Process -FilePath "ngrok" -ArgumentList "http", $BackendPort, "--log=stdout" -PassThru -WindowStyle Hidden
$feProcess = Start-Process -FilePath "ngrok" -ArgumentList "http", $FrontendPort, "--log=stdout" -PassThru -WindowStyle Hidden

# Ждём немного для запуска
Start-Sleep -Seconds 3

# Получаем URLs через ngrok API
try {
  $beUrl = (Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -TimeoutSec 5 | Where-Object { $_.config.addr -eq "http://localhost:$BackendPort" }).public_url
  $feUrl = (Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -TimeoutSec 5 | Where-Object { $_.config.addr -eq "http://localhost:$FrontendPort" }).public_url
} catch {
  $beUrl = "PENDING"
  $feUrl = "PENDING"
}

# Останавливаем процессы
$beProcess | Stop-Process -Force -ErrorAction SilentlyContinue
$feProcess | Stop-Process -Force -ErrorAction SilentlyContinue

if (-not $beUrl) { $beUrl = "PENDING" }
if (-not $feUrl) { $feUrl = "PENDING" }
Write-Output ("BACKEND_URL={0}" -f $beUrl)
Write-Output ("FRONTEND_URL={0}" -f $feUrl)
