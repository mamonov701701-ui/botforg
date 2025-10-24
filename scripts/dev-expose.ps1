# Cloudflare Quick Tunnels - БЕЗ регистрации и БЕЗ пароля!
param(
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 5173
)

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Resolve-Path "$root\..")

# Обновляем PATH
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")

# Проверяем cloudflared (быстро)
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Output "BACKEND_URL=NOT_INSTALLED"
  Write-Output "FRONTEND_URL=NOT_INSTALLED"
  Write-Output "INSTALL_CMD=winget install Cloudflare.cloudflared"
  exit 0
}

# Создаём временные файлы для логов
$beLog = New-TemporaryFile
$feLog = New-TemporaryFile

# Запускаем cloudflared туннели
$beProc = Start-Process -FilePath "cloudflared" -ArgumentList "tunnel", "--url", "http://localhost:$BackendPort" -RedirectStandardOutput $beLog.FullName -PassThru -WindowStyle Hidden
$feProc = Start-Process -FilePath "cloudflared" -ArgumentList "tunnel", "--url", "http://localhost:$FrontendPort" -RedirectStandardOutput $feLog.FullName -PassThru -WindowStyle Hidden

# Ждём URLs
Start-Sleep -Seconds 8

# Парсим URLs из логов
$beUrl = "PENDING"
$feUrl = "PENDING"

$beContent = Get-Content $beLog.FullName -Raw -ErrorAction SilentlyContinue
if ($beContent -match "https://[a-z0-9\-]+\.trycloudflare\.com") {
  $beUrl = $matches[0]
}

$feContent = Get-Content $feLog.FullName -Raw -ErrorAction SilentlyContinue
if ($feContent -match "https://[a-z0-9\-]+\.trycloudflare\.com") {
  $feUrl = $matches[0]
}

# Очистка
Remove-Item $beLog -Force -ErrorAction SilentlyContinue
Remove-Item $feLog -Force -ErrorAction SilentlyContinue

Write-Output ("BACKEND_URL={0}" -f $beUrl)
Write-Output ("FRONTEND_URL={0}" -f $feUrl)

