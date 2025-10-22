# scripts/start-dev.ps1
# Запускает backend и frontend в ОТДЕЛЬНЫХ окнах PowerShell, с авто-перезагрузкой

$Root = Split-Path -Parent $PSScriptRoot

# Backend в новом окне
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "& {
    cd `"$Root\backend`";
    & `"$Root\venv\Scripts\Activate.ps1`";
    python -m pip install --quiet -r `"$Root\backend\requirements.txt`" 2>$null;
    if (-not (Get-Command uvicorn -ErrorAction SilentlyContinue)) { pip install uvicorn fastapi };
    uvicorn main:app --reload
  }"
)

# Frontend в новом окне
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "& {
    cd `"$Root\frontend`";
    if (Test-Path package-lock.json) { npm ci } else { npm install };
    npm run dev -- --host
  }"
)

Write-Host "Запущено: backend (http://127.0.0.1:8000) и frontend (http://localhost:5173)"










































