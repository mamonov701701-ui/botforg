# QA Tester Agent - single command for BotForg (Windows PowerShell)
# Run from project root: .\qa\run_qa.ps1
# Diagnostic and report only. No refactoring, no git push.

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $ProjectRoot "backend"))) { $ProjectRoot = (Get-Location).Path }
Set-Location $ProjectRoot

# --- Environment check: Node.js and npm required for frontend ---
$nodeOk = $false
$npmOk = $false
try {
    $v = & node -v 2>&1
    if ($v -match "v\d") { $nodeOk = $true }
} catch {}
if (-not $nodeOk) {
    Write-Host "ERROR: Node.js not found or not runnable."
    Write-Host "Install Node.js LTS: https://nodejs.org and restart QA."
    exit 1
}
try {
    $v = & npm -v 2>&1
    if ($v -match "^\d") { $npmOk = $true }
} catch {}
if (-not $npmOk) {
    Write-Host "ERROR: npm not found or not runnable."
    Write-Host "Install Node.js LTS (includes npm): https://nodejs.org and restart QA."
    exit 1
}

$BackendPort = 8001
$FrontendPort = 5173
$BackendUrl = "http://127.0.0.1:$BackendPort"
$FrontendUrl = "http://127.0.0.1:$FrontendPort"

# Timestamp subfolder: qa_artifacts/YYYY-MM-DD_HHmm/
$Timestamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$ArtifactsDir = Join-Path $ProjectRoot "qa_artifacts"
$RunDir = Join-Path $ArtifactsDir $Timestamp
$ScreensDir = Join-Path $RunDir "screens"

New-Item -ItemType Directory -Force -Path $RunDir | Out-Null
New-Item -ItemType Directory -Force -Path $ScreensDir | Out-Null

# Save env versions for report (node, npm, python)
$nodeVer = (node -v 2>&1) -join " "
$npmVer = (npm -v 2>&1) -join " "
$pyVer = (python --version 2>&1) -join " "
@("node: $nodeVer", "npm: $npmVer", "python: $pyVer") | Set-Content (Join-Path $RunDir "env_versions.txt") -Encoding UTF8

$backendProcess = $null
$frontendProcess = $null
$reportData = @{
    Summary = @{ Pass = $true; P0 = 0; P1 = 0; P2 = 0 }
    Backend = @{ Migrations = "unknown"; PytestAll = "unknown"; PytestSelected = "unknown"; Health = "unknown"; TopErrors = @() }
    Frontend = @{ Pages = @(); AuthFlow = "skipped"; AuthReason = "" }
    UiApi = @{ Problems = @(); UiWithoutBackend = @() }
    Recommendations = @{ P0 = @(); P1 = @(); P2 = @() }
}

function Write-QALog {
    param([string]$Message, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Message"
    Write-Host $line
    $logFile = Join-Path $RunDir "qa_run.log"
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

function Wait-ForUrl {
    param([string]$Url, [int]$TimeoutSec = 30, [string]$Name = "Service")
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue
            if ($r.StatusCode -eq 200) { return $true }
        } catch {}
        Start-Sleep -Seconds 2
    }
    Write-QALog "Timeout waiting for $Name at $Url" "WARN"
    return $false
}

function Stop-Services {
    if ($backendProcess -and -not $backendProcess.HasExited) {
        try { Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
    if ($frontendProcess -and -not $frontendProcess.HasExited) {
        try { Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
    Get-Process -Name "uvicorn" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

try {
    Write-QALog "=== QA started (artifacts: $RunDir) ==="
    $env:QA_ARTIFACTS_DIR = $RunDir
    $env:TESTING = "true"

    # --- A) Migrations ---
    Write-QALog "Running alembic upgrade head..."
    $migLog = Join-Path $RunDir "backend_alembic.log"
    $migOut = cmd /c "alembic -c alembic.ini upgrade head 2>&1"
    $migOut | Set-Content $migLog -Encoding UTF8
    if ($LASTEXITCODE -ne 0) {
        $reportData.Backend.Migrations = "failed"
        $reportData.Summary.Pass = $false
        $reportData.Recommendations.P0 += "Migrations failed (see backend_alembic.log)"
    } else {
        $reportData.Backend.Migrations = "ok"
    }

    # --- B) Backend ---
    Write-QALog "Starting backend on port $BackendPort..."
    $backendOut = Join-Path $RunDir "backend_stdout.log"
    $backendErr = Join-Path $RunDir "backend_stderr.log"
    $backendProcess = Start-Process -FilePath "python" -ArgumentList "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "$BackendPort" `
        -WorkingDirectory $ProjectRoot -PassThru -NoNewWindow `
        -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr
    $healthOk = Wait-ForUrl "$BackendUrl/health" -TimeoutSec 30 -Name "Backend"
    if (-not $healthOk) { $healthOk = Wait-ForUrl $BackendUrl -TimeoutSec 5 -Name "Backend root" }
    if (-not $healthOk) {
        $reportData.Backend.Health = "failed"
        $reportData.Summary.Pass = $false
        $reportData.Recommendations.P0 += "Backend did not become ready"
    } else {
        $reportData.Backend.Health = "ok"
    }

    # Routes + OpenAPI
    $env:QA_ARTIFACTS_DIR = $RunDir
    & python (Join-Path $ProjectRoot "qa\dump_routes.py") $RunDir
    try {
        $openApi = Invoke-RestMethod -Uri "$BackendUrl/openapi.json" -Method Get -TimeoutSec 5
        $openApi | ConvertTo-Json -Depth 20 | Set-Content (Join-Path $RunDir "openapi.json") -Encoding UTF8
    } catch {
        Write-QALog "OpenAPI not available (not an error in prod)" "INFO"
    }

    # Pytest
    Write-QALog "Running pytest (all)..."
    $pytestAllLog = Join-Path $RunDir "pytest_all.txt"
    $pytestAllOut = & python -m pytest -q --tb=short 2>&1
    $pytestAllOut | Set-Content $pytestAllLog -Encoding UTF8
    if ($LASTEXITCODE -ne 0) {
        $reportData.Backend.PytestAll = "failed"
        $reportData.Summary.Pass = $false
        $reportData.Recommendations.P0 += "Pytest failed (see pytest_all.txt)"
        $reportData.Backend.TopErrors = (@($pytestAllOut) | Select-Object -First 30) -join "`n"
    } else {
        $reportData.Backend.PytestAll = "ok"
    }

    Write-QALog "Running pytest (selected)..."
    $pytestSelLog = Join-Path $RunDir "pytest_selected.txt"
    $pytestSelOut = & python -m pytest -q tests/test_legal_152.py tests/test_max_webhook.py tests/test_whatsapp_channel.py tests/test_whatsapp_meta_cloud.py --tb=short 2>&1
    $pytestSelOut | Set-Content $pytestSelLog -Encoding UTF8
    if ($LASTEXITCODE -ne 0) {
        $reportData.Backend.PytestSelected = "failed"
    } else {
        $reportData.Backend.PytestSelected = "ok"
    }

    # --- C) Frontend (Windows: run npm via cmd.exe to avoid Win32 error) ---
    Write-QALog "Starting frontend..."
    $frontendOut = Join-Path $RunDir "frontend_stdout.log"
    $frontendErr = Join-Path $RunDir "frontend_stderr.log"
    $frontendDirPath = Join-Path $ProjectRoot "frontend"
    $frontendCmd = "cd /d `"$frontendDirPath`" && npm run dev -- --host 127.0.0.1 --port $FrontendPort"
    try {
        $frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $frontendCmd `
            -PassThru -NoNewWindow `
            -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr
    } catch {
        $_.Exception.Message | Set-Content $frontendErr -Encoding UTF8
        "Start-Process failed: $($_.Exception.Message)" | Add-Content (Join-Path $RunDir "qa_run.log") -Encoding UTF8
        $reportData.Summary.Pass = $false
        $reportData.Recommendations.P0 += "Frontend failed to start (see frontend_stderr.log). Install Node.js LTS: https://nodejs.org"
        Write-QALog "Frontend start failed: $($_.Exception.Message)" "ERROR"
    }
    $frontendReady = $false
    if ($frontendProcess) {
        $frontendReady = Wait-ForUrl $FrontendUrl -TimeoutSec 60 -Name "Frontend"
        if (-not $frontendReady) {
            Write-QALog "Frontend did not become ready at $FrontendUrl within 60s; E2E skipped" "WARN"
            $reportData.Summary.Pass = $false
            $reportData.Recommendations.P0 += "Frontend did not become ready (see frontend_stdout.log, frontend_stderr.log)"
        }
    }
    if ($frontendReady) {
        # Playwright: ensure installed
        $frontendDir = Join-Path $ProjectRoot "frontend"
        $pwPkg = Join-Path $frontendDir "node_modules\@playwright\test"
        if (-not (Test-Path $pwPkg)) {
            Write-QALog "Installing Playwright..."
            Push-Location $frontendDir
            npm i -D @playwright/test 2>&1 | Out-Null
            npx playwright install chromium 2>&1 | Out-Null
            Pop-Location
        }
        Write-QALog "Running Playwright E2E..."
        $env:QA_ARTIFACTS_DIR = $RunDir
        Push-Location $frontendDir
        $pwOut = & npx playwright test --config=..\qa\playwright.config.ts 2>&1
        $pwOut | Set-Content (Join-Path $RunDir "playwright_report.txt") -Encoding UTF8
        Pop-Location
    }

    # Copy static frontend routes
    $staticRoutes = Join-Path $ProjectRoot "qa\frontend_routes_static.txt"
    if (Test-Path $staticRoutes) {
        Copy-Item $staticRoutes (Join-Path $RunDir "frontend_routes.txt") -Force
    }

    # --- D) UI vs API reconcile ---
    $reconcileScript = Join-Path $ProjectRoot "qa\reconcile_ui_api.py"
    if (Test-Path $reconcileScript) {
        $env:QA_ARTIFACTS_DIR = $RunDir
        & python $reconcileScript $RunDir 2>&1
    }

    # --- E) Report ---
    $reportPath = Join-Path $ProjectRoot "QA_REPORT.md"
    $genScript = Join-Path $ProjectRoot "qa\generate_report.py"
    if (Test-Path $genScript) {
        & python $genScript $RunDir $reportPath 2>&1
    } else {
        # Fallback minimal report
        $sb = [System.Text.StringBuilder]::new()
        [void]$sb.AppendLine("# QA Report - BotForg")
        [void]$sb.AppendLine("Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | Artifacts: $RunDir")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("## 1) Summary")
        [void]$sb.AppendLine("- **Result:** $(if ($reportData.Summary.Pass) { 'PASS' } else { 'FAIL' })")
        [void]$sb.AppendLine("- P0: $($reportData.Summary.P0) | P1: $($reportData.Summary.P1) | P2: $($reportData.Summary.P2)")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("## 2) Backend")
        [void]$sb.AppendLine("- Migrations: $($reportData.Backend.Migrations)")
        [void]$sb.AppendLine("- /health: $($reportData.Backend.Health)")
        [void]$sb.AppendLine("- Pytest (all): $($reportData.Backend.PytestAll) | (selected): $($reportData.Backend.PytestSelected)")
        [void]$sb.AppendLine("- Routes: $RunDir\backend_routes.txt")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("## 3) Frontend")
        [void]$sb.AppendLine("- See $RunDir\playwright_report.txt and $RunDir\screens\")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("## 4) UI vs API")
        [void]$sb.AppendLine("- See $RunDir\ui_api_calls.json and backend_routes.txt")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("## 5) Recommendations")
        [void]$sb.AppendLine("- **P0:** $($reportData.Recommendations.P0 -join '; ')")
        [void]$sb.AppendLine("- **P1:** $($reportData.Recommendations.P1 -join '; ')")
        [void]$sb.AppendLine("- **P2:** $($reportData.Recommendations.P2 -join '; ')")
        [void]$sb.AppendLine("")
        [void]$sb.AppendLine("## 6) Artifacts")
        [void]$sb.AppendLine("- $RunDir")
        $sb.ToString() | Set-Content $reportPath -Encoding UTF8
    }
    Write-QALog "Report: QA_REPORT.md"
    # Final summary (where artifacts, report, PASS/FAIL)
    $reportPath = Join-Path $ProjectRoot "QA_REPORT.md"
    Write-Host ""
    Write-Host "--- QA run complete ---"
    Write-Host "Artifacts folder: $RunDir"
    Write-Host "Report file:      $reportPath"
    if (Test-Path $reportPath) {
        $summary = Get-Content $reportPath -Encoding UTF8 | Select-String -Pattern "^\*\*Result:\*\*|^\- P0:"
        foreach ($s in $summary) { Write-Host $s.Line }
    }
    Write-Host "-----------------------"
}
finally {
    Stop-Services
    Write-QALog "=== QA finished ==="
}
