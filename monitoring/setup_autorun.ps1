$taskName = "BotForg PromptAgent"
$scriptPath = "$env:USERPROFILE\botforg\monitoring\startup.bat"

# Удаляем старую задачу, если есть
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Создаем новую задачу
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c start `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 2) `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew
Register-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -TaskName $taskName -Description "Автозапуск агента мониторинга BotForg при старте системы" -User "$env:USERNAME" -RunLevel Highest

Write-Host "✅ Автозапуск агента успешно добавлен!"



