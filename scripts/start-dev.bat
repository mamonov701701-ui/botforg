@echo off
REM scripts/start-dev.bat
REM Запускает backend и frontend в ОТДЕЛЬНЫХ окнах cmd, с авто-перезагрузкой

set ROOT=%~dp0..

REM Backend в новом окне
start "BotForg Backend" cmd /k "cd /d %ROOT%\backend && %ROOT%\venv\Scripts\activate.bat && python -m pip install --quiet -r %ROOT%\backend\requirements.txt 2>nul && uvicorn main:app --reload"

REM Frontend в новом окне
start "BotForg Frontend" cmd /k "cd /d %ROOT%\frontend && if exist package-lock.json (npm ci) else (npm install) && npm run dev -- --host"

echo Запущено: backend (http://127.0.0.1:8000) и frontend (http://localhost:5173)
pause






























