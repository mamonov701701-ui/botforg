$ErrorActionPreference = 'SilentlyContinue'
# Убиваем cloudflared, vite (node), uvicorn/py
Stop-Process -Name cloudflared -Force
Stop-Process -Name node -Force
Stop-Process -Name python -Force
Stop-Process -Name uvicorn -Force
Write-Output "Stopped cloudflared, node/vite, uvicorn/python."

