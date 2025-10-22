$ErrorActionPreference = "Stop"
$root = "$env:USERPROFILE\botforg"
$venv = Join-Path $root "venv\Scripts\Activate.ps1"
$log  = Join-Path $root "monitoring\startup.log"

Set-Location $root
& $venv

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] starting prompt_agent" | Out-File -FilePath $log -Append -Encoding utf8
python -m monitoring.prompt_agent *>> $log
