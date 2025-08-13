Set shell = CreateObject("WScript.Shell")
shell.Run "cmd /c start "" backend\venv\Scripts\activate && uvicorn backend.main:app --reload", 0
shell.Run "cmd /c start "" cd frontend && npm run dev", 0
WScript.Sleep 3000
shell.Run "C:\Users\mamon\AppData\Local\Yandex\YandexBrowser\Application\browser.exe http://localhost:5173" 