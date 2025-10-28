# Cloudflare Quick Tunnels - БЕЗ регистрации и БЕЗ пароля!
param(
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 5173
)

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Resolve-Path "$root\..")

# Обновляем PATH
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")

# Проверяем cloudflared
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Output "BACKEND_URL=NOT_INSTALLED"
  Write-Output "FRONTEND_URL=NOT_INSTALLED"
  Write-Output "INSTALL_CMD=winget install Cloudflare.cloudflared"
  exit 0
}

# Проверяем, что сервера запущены
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
  Write-Output "ERROR_MSG=Сервера не запущены. Запустите /backend_start и /frontend_start"
  exit 0
}

# Сначала останавливаем все старые cloudflared процессы (чистим)
Stop-Process -Name cloudflared -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Создаём временные файлы для логов
$beLog = [System.IO.Path]::GetTempFileName()
$feLog = [System.IO.Path]::GetTempFileName()

# Запускаем cloudflared туннели только для работающих сервисов
$beProc = $null
$feProc = $null

if ($beRunning) {
  # Запускаем cloudflared с HTTP/2 протоколом (обход блокировки UDP/QUIC)
  $cmdArgs = "/c start /B cloudflared tunnel --url http://localhost:$BackendPort --protocol http2 2>`"$beLog`""
  Start-Process -FilePath "cmd.exe" -ArgumentList $cmdArgs -WindowStyle Hidden -WorkingDirectory $PWD
}

if ($feRunning) {
  # Запускаем cloudflared с HTTP/2 протоколом (обход блокировки UDP/QUIC)
  $cmdArgs = "/c start /B cloudflared tunnel --url http://localhost:$FrontendPort --protocol http2 2>`"$feLog`""
  Start-Process -FilePath "cmd.exe" -ArgumentList $cmdArgs -WindowStyle Hidden -WorkingDirectory $PWD
}

# Ждём URLs с увеличенным временем (макс 45 секунд)
$beUrl = if ($beRunning) { "PENDING" } else { "NOT_RUNNING" }
$feUrl = if ($feRunning) { "PENDING" } else { "NOT_RUNNING" }
$maxAttempts = 15
$attempt = 0

while ($attempt -lt $maxAttempts) {
  $attempt++
  Start-Sleep -Seconds 3
  
  $allDone = $true
  
  if ($beUrl -eq "PENDING") {
    $allDone = $false
    if (Test-Path $beLog) {
      try {
        $beContent = Get-Content $beLog -Raw -ErrorAction SilentlyContinue
        if ($beContent -match "https://[a-z0-9\-]+\.trycloudflare\.com") {
          $beUrl = $matches[0]
        }
      } catch {
        # Файл может быть заблокирован, пропускаем
      }
    }
  }
  
  if ($feUrl -eq "PENDING") {
    $allDone = $false
    if (Test-Path $feLog) {
      try {
        $feContent = Get-Content $feLog -Raw -ErrorAction SilentlyContinue
        if ($feContent -match "https://[a-z0-9\-]+\.trycloudflare\.com") {
          $feUrl = $matches[0]
        }
      } catch {
        # Файл может быть заблокирован, пропускаем
      }
    }
  }
  
  # Если все URL получены, выходим досрочно
  if ($allDone) {
    break
  }
}

# Ждём чуть-чуть перед удалением, чтобы освободить блокировки
Start-Sleep -Milliseconds 500

# Очистка логов (процессы cloudflared продолжают работать)
Remove-Item $beLog -Force -ErrorAction SilentlyContinue
Remove-Item $feLog -Force -ErrorAction SilentlyContinue

# Выводим результаты
Write-Output ("BACKEND_URL={0}" -f $beUrl)
Write-Output ("FRONTEND_URL={0}" -f $feUrl)

