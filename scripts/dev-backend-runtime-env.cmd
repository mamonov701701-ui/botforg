@echo off
rem Canonical local-only Custom Block Runner configuration for the Backend child tree.
rem Uvicorn's reloader and worker inherit these values from this cmd process.
setlocal
if defined CUSTOM_BLOCK_RUNNER_TOKEN_FILE (
  set "BOTFORG_RUNNER_TOKEN_FILE=%CUSTOM_BLOCK_RUNNER_TOKEN_FILE%"
) else (
  set "BOTFORG_RUNNER_TOKEN_FILE=%~dp0.dev-custom-runner-token"
)
if not exist "%BOTFORG_RUNNER_TOKEN_FILE%" (
  1>&2 echo ERROR: Development Runner token file is missing. Start scripts\dev-custom-runner.ps1 first.
  exit /b 1
)
set /p "CUSTOM_BLOCK_RUNNER_SHARED_TOKEN="<"%BOTFORG_RUNNER_TOKEN_FILE%"
if not defined CUSTOM_BLOCK_RUNNER_SHARED_TOKEN (
  1>&2 echo ERROR: Development Runner token file is empty.
  exit /b 1
)
set "CUSTOM_BLOCK_EXECUTION_ENABLED=true"
set "CUSTOM_BLOCK_RUNNER_URL=http://127.0.0.1:8090"
%*
set "BOTFORG_RUNTIME_EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %BOTFORG_RUNTIME_EXIT_CODE%
