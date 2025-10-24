$ErrorActionPreference = 'SilentlyContinue'
# Убиваем cloudflared, vite (node), uvicorn (НЕ весь python!)
Stop-Process -Name cloudflared -Force
Stop-Process -Name node -Force
Stop-Process -Name uvicorn -Force

# Останавливаем uvicorn через порт, не весь python
$uvicornProcs = Get-Process python | Where-Object { 
    $_.CommandLine -like "*uvicorn*" -and $_.CommandLine -notlike "*prompt_agent*"
}
$uvicornProcs | Stop-Process -Force

Write-Output "Stopped cloudflared, node/vite, uvicorn (bot still running)."

