$ErrorActionPreference = "Continue"
$root = "$env:USERPROFILE\botforg"
$log  = Join-Path $root "monitoring\startup.log"

# Проверяем переменные окружения
$token = [System.Environment]::GetEnvironmentVariable("TG_BOT_TOKEN", "User")
$chatId = [System.Environment]::GetEnvironmentVariable("TG_CHAT_ID", "User")

if (-not $token -or -not $chatId) {
    $msg = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] ERROR: TG_BOT_TOKEN или TG_CHAT_ID не установлены!"
    $msg | Out-File -FilePath $log -Append -Encoding utf8
    Write-Host $msg -ForegroundColor Red
    exit 1
}

Set-Location $root

"[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] starting prompt_agent (token: ${token:0:10}..., chat_id: $chatId)" | Out-File -FilePath $log -Append -Encoding utf8

# Бот не требует venv - использует системный Python
python -m monitoring.prompt_agent *>> $log
