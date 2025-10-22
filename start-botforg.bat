@echo off
title 🚀 BotForg Launcher
echo Запуск BotForg...

REM Запускаем Backend
start "Backend" cmd /k "cd backend && call venv\Scripts\activate && uvicorn main:app --reload --port 8000"

REM Ждём немного, чтобы backend успел стартовать
timeout /t 3 > nul

REM Запускаем Frontend
start "Frontend" cmd /k "cd frontend && npm install && npm run dev"

REM Ждём немного, чтобы frontend успел стартовать
timeout /t 5 > nul

REM Открываем сайт в браузере
start http://localhost:5173

echo Всё готово! Платформа запущена.
exit 