# Подготовка окружения: миграции БД. Запускать из корня: .\scripts\prepare-dev.ps1
$ErrorActionPreference = 'Stop'
$root = if ($PSScriptRoot) { (Split-Path -Parent $PSScriptRoot) } else { (Get-Location).Path }
Set-Location $root
Write-Host "Применение миграций Alembic..." -ForegroundColor Cyan
python -m alembic upgrade head
if ($LASTEXITCODE -eq 0) { Write-Host "Миграции применены успешно." -ForegroundColor Green } else { exit 1 }
