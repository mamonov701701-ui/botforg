# ngrok tunnel - работает даже при блокировке TLS
param(
  [int]$Port = 8001
)

# Останавливаем старые ngrok процессы
Stop-Process -Name ngrok -Force -ErrorAction SilentlyContinue
Start-Sleep 2

# Запускаем ngrok
$outputFile = "$env:TEMP\ngrok_output.txt"
Start-Process -FilePath "ngrok" -ArgumentList "http", $Port, "--log=stdout" -RedirectStandardOutput $outputFile -WindowStyle Hidden

# Ждем запуска
Start-Sleep 5

# Получаем URL из API
try {
  $response = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -ErrorAction Stop
  $url = $response.tunnels[0].public_url
  
  if ($url) {
    Write-Output "BACKEND_URL=$url"
    Write-Output "SERVICE=ngrok"
  } else {
    Write-Output "BACKEND_URL=ERROR"
    Write-Output "ERROR_MSG=Не удалось получить URL"
  }
} catch {
  Write-Output "BACKEND_URL=ERROR"  
  Write-Output "ERROR_MSG=ngrok не запущен или требует auth token"
  Write-Output "INSTALL_CMD=ngrok config add-authtoken YOUR_TOKEN"
}

