@echo off
cd /d "%USERPROFILE%\botforg"
REM Бот не требует venv - использует системный Python
python -m monitoring.prompt_agent

REM Если ошибка - держим окно открытым 10 секунд
if errorlevel 1 (
    echo.
    echo ================================
    echo ОШИБКА ЗАПУСКА БОТА!
    echo Проверьте переменные окружения:
    echo   TG_BOT_TOKEN=%TG_BOT_TOKEN%
    echo   TG_CHAT_ID=%TG_CHAT_ID%
    echo ================================
    timeout /t 10
)



