$root = Join-Path $env:USERPROFILE "botforg"
Set-Location $root
& .\venv\Scripts\Activate.ps1
python -m monitoring.scheduler
