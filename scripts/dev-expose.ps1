# Простой скрипт вывода информации о ngrok туннелях
param(
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 5173
)

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Resolve-Path "$root\..")

# Обновляем PATH
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")

# Проверяем, что ngrok установлен
if (-not (Get-Command ngrok -ErrorAction SilentlyContinue)) {
  Write-Output "BACKEND_URL=ERROR_ngrok_not_found"
  Write-Output "FRONTEND_URL=ERROR_ngrok_not_found"
  exit 1
}

# Получаем URLs через ngrok API (если ngrok уже запущен)
$beUrl = "PENDING"
$feUrl = "PENDING"

try {
  $response = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -TimeoutSec 3
  foreach ($t in $response.tunnels) {
    $addr = $t.config.addr
    if ($addr -like "*:$BackendPort" -or $addr -like "*localhost:$BackendPort*") {
      $beUrl = $t.public_url
    }
    if ($addr -like "*:$FrontendPort" -or $addr -like "*localhost:$FrontendPort*") {
      $feUrl = $t.public_url
    }
  }
} catch {
  # ngrok не запущен - запускаем вручную
  Write-Output "BACKEND_URL=PENDING_start_ngrok_manually"
  Write-Output "FRONTEND_URL=PENDING_start_ngrok_manually"
  exit 0
}

Write-Output ("BACKEND_URL={0}" -f $beUrl)
Write-Output ("FRONTEND_URL={0}" -f $feUrl)
