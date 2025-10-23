# install cloudflared if missing
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  winget install --id Cloudflare.cloudflared -e -h
}

# expose backend 8000 and frontend 5173
Start-Process -WindowStyle Hidden cloudflared "tunnel --url http://localhost:8000" | Out-Null
Start-Process -WindowStyle Hidden cloudflared "tunnel --url http://localhost:5173" | Out-Null
Start-Sleep -Seconds 3
Write-Output "Tunnels started. Use 'cloudflared tunnel list' or check agent output for assigned URLs."

