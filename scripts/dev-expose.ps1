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

# Проверяем, не запущен ли уже ngrok
$ngrokRunning = Get-Process ngrok -ErrorAction SilentlyContinue

if (-not $ngrokRunning) {
  # Запускаем один ngrok с двумя туннелями
  Start-Process -WindowStyle Hidden -FilePath "ngrok" -ArgumentList "start", "--all", "--config", "scripts\.ngrok.yml"
  Start-Sleep -Seconds 5
}

# Получаем URLs через ngrok API
$beUrl = "PENDING"
$feUrl = "PENDING"

try {
  $tunnels = (Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -TimeoutSec 5).tunnels
  foreach ($t in $tunnels) {
    if ($t.config.addr -like "*:$BackendPort") {
      $beUrl = $t.public_url
    }
    if ($t.config.addr -like "*:$FrontendPort") {
      $feUrl = $t.public_url
    }
  }
} catch {
  # Если API недоступен, попробуем запустить ngrok без конфига
  if (-not $ngrokRunning) {
    Start-Process -WindowStyle Hidden -FilePath "ngrok" -ArgumentList "http", $BackendPort
    Start-Sleep -Seconds 3
  }
}

if (-not $beUrl) { $beUrl = "PENDING" }
if (-not $feUrl) { $feUrl = "PENDING" }
Write-Output ("BACKEND_URL={0}" -f $beUrl)
Write-Output ("FRONTEND_URL={0}" -f $feUrl)
