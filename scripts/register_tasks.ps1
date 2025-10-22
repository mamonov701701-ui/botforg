$root = Join-Path $env:USERPROFILE "botforg"
$pa = Join-Path $root "scripts\run_prompt_agent.ps1"
$sch= Join-Path $root "scripts\run_scheduler.ps1"
$fh = Join-Path $root "scripts\run_frontend_health.ps1"

schtasks /Create /TN "BotForg_PromptAgent" /SC ONLOGON /RL HIGHEST /TR "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$pa`"" /F
schtasks /Create /TN "BotForg_SnapshotScheduler" /SC ONLOGON /RL HIGHEST /TR "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$sch`"" /F
schtasks /Create /TN "BotForg_FrontendHealth_10min" /SC MINUTE /MO 10 /RL HIGHEST /TR "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$fh`"" /F
