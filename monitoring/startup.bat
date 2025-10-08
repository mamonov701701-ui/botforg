@echo off
cd /d "%USERPROFILE%\botforg"
call "%USERPROFILE%\botforg\venv\Scripts\activate.bat"
python -m monitoring.prompt_agent

pause



