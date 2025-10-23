# Создаёт 2 quick-туннеля и сохраняет их логи, чтобы можно было вытащить публичные URL

param(
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 5173
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Resolve-Path "$root\..")

# 1) Установка cloudflared при необходимости
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "Installing cloudflared via winget..."
  winget install --id Cloudflare.cloudflared -e -h | Out-Null
}

# 2) Папка для логов
$logDir = "scripts\.tunnels"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$beLog = Join-Path $logDir "backend.log"
$feLog = Join-Path $logDir "frontend.log"

# 3) Запуск двух quick-туннелей в фоне с логами
# Важно: -logfile доступен; затем мы читаем ссылку из лога
$beArgs = "tunnel --no-autoupdate --loglevel info --logfile `"$beLog`" --url http://localhost:$BackendPort"
$feArgs = "tunnel --no-autoupdate --loglevel info --logfile `"$feLog`" --url http://localhost:$FrontendPort"

# Если уже запущены — не плодим процессы
Get-Process cloudflared -ErrorAction SilentlyContinue | Out-Null
if ($?) {
  # ок, процессы есть — не трогаем, просто парсим логи ниже
} else {
  Start-Process -WindowStyle Hidden cloudflared $beArgs | Out-Null
  Start-Process -WindowStyle Hidden cloudflared $feArgs | Out-Null
}

Start-Sleep -Seconds 3

# 4) Парсим URL из логов (строки с trycloudflare.com)
function Get-TunnelUrl([string]$logPath) {
  if (Test-Path $logPath) {
    $line = Get-Content $logPath -Tail 200 | Select-String -Pattern "https://[a-z0-9\-]+\.trycloudflare\.com" | Select-Object -First 1
    if ($line) {
      if ($line.Matches.Count -gt 0) { return $line.Matches[0].Value }
      else {
        $m = [regex]::Match($line.ToString(), "https://[a-z0-9\-]+\.trycloudflare\.com")
        if ($m.Success) { return $m.Value }
      }
    }
  }
  return $null
}

$beUrl = Get-TunnelUrl $beLog
$feUrl = Get-TunnelUrl $feLog

# Если ещё не успели появиться — подождём чуть дольше
if (-not $beUrl -or -not $feUrl) {
  Start-Sleep -Seconds 5
  if (-not $beUrl) { $beUrl = Get-TunnelUrl $beLog }
  if (-not $feUrl) { $feUrl = Get-TunnelUrl $feLog }
}

Write-Output ("BACKEND_URL={0}" -f ($beUrl ?? "PENDING"))
Write-Output ("FRONTEND_URL={0}" -f ($feUrl ?? "PENDING"))
