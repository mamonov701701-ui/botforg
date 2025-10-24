# Автоматический запуск localtunnel туннелей
param(
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 5173
)

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Resolve-Path "$root\..")

# Обновляем PATH
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")

# Проверяем, что localtunnel установлен
if (-not (Get-Command lt -ErrorAction SilentlyContinue)) {
  Write-Output "BACKEND_URL=ERROR_lt_not_found"
  Write-Output "FRONTEND_URL=ERROR_lt_not_found"
  Write-Output "PASSWORD=ERROR_install_localtunnel"
  exit 1
}

# Получаем публичный IP для пароля
try {
  $publicIP = Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 5
} catch {
  $publicIP = "UNKNOWN"
}

# Запускаем localtunnel в фоне
$beJob = Start-Job -ScriptBlock { 
  lt --port 8000 --subdomain backend-$(Get-Random) 2>&1
}
$feJob = Start-Job -ScriptBlock { 
  lt --port 5173 --subdomain frontend-$(Get-Random) 2>&1
}

# Ждём запуска
Start-Sleep -Seconds 8

# Получаем результаты
$beOutput = Receive-Job $beJob -ErrorAction SilentlyContinue
$feOutput = Receive-Job $feJob -ErrorAction SilentlyContinue

# Очищаем jobs
Remove-Job $beJob -Force -ErrorAction SilentlyContinue
Remove-Job $feJob -Force -ErrorAction SilentlyContinue

# Парсим URLs
$beUrl = "PENDING"
$feUrl = "PENDING"

if ($beOutput) {
  $beMatch = $beOutput | Select-String "https://.*\.loca\.lt"
  if ($beMatch) { $beUrl = $beMatch.Matches[0].Value }
}

if ($feOutput) {
  $feMatch = $feOutput | Select-String "https://.*\.loca\.lt"
  if ($feMatch) { $feUrl = $feMatch.Matches[0].Value }
}

Write-Output ("BACKEND_URL={0}" -f $beUrl)
Write-Output ("FRONTEND_URL={0}" -f $feUrl)
Write-Output ("PASSWORD={0}" -f $publicIP)
