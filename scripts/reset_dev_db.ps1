# Stop any running uvicorn before executing these commands.
Write-Host ">>> Resetting dev DB and Alembic migrations..." -ForegroundColor Yellow

Set-Location "$PSScriptRoot/.."
Set-Location "backend"

# Delete common SQLite files (no error if missing)
Remove-Item -Force *.db -ErrorAction SilentlyContinue

# Remove Alembic migrations folder (no error if missing)
Remove-Item -Recurse -Force migrations -ErrorAction SilentlyContinue

# Init Alembic and recreate migrations
alembic init migrations
alembic revision --autogenerate -m "init"
alembic upgrade head

Write-Host ">>> Done. Start backend from repo root with:" -ForegroundColor Green
Write-Host "uvicorn backend.main:app --reload --port 8000" -ForegroundColor Green

