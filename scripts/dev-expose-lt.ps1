# Localtunnel - работает БЕЗ регистрации
param(
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 5173
)

# Установка localtunnel (если нужно)
npm install -g localtunnel | Out-Null

# Запуск туннелей
$beJob = Start-Job -ScriptBlock { lt --port 8000 }
$feJob = Start-Job -ScriptBlock { lt --port 5173 }

Start-Sleep -Seconds 5

# Получаем URLs из вывода
$beUrl = (Receive-Job $beJob | Select-String "https://.*\.loca\.lt" | Select-Object -First 1).Matches.Value
$feUrl = (Receive-Job $feJob | Select-String "https://.*\.loca\.lt" | Select-Object -First 1).Matches.Value

if (-not $beUrl) { $beUrl = "PENDING" }
if (-not $feUrl) { $feUrl = "PENDING" }

Write-Output ("BACKEND_URL={0}" -f $beUrl)
Write-Output ("FRONTEND_URL={0}" -f $feUrl)

