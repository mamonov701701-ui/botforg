# Тестовый скрипт для cloudflared
$tempFile = New-TemporaryFile
$proc = Start-Process -FilePath "cloudflared" -ArgumentList "tunnel", "--url", "http://localhost:8000" -RedirectStandardError $tempFile.FullName -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 10

$content = Get-Content $tempFile.FullName -Raw
Write-Output "=== CLOUDFLARED OUTPUT ==="
Write-Output $content
Write-Output "=== END ==="

Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

