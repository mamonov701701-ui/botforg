import os
import win32com.client

# Путь к VBS-файлу запуска
project_dir = os.path.dirname(os.path.abspath(__file__))
target_path = os.path.join(project_dir, "start-botforg.vbs")

# Путь к рабочему столу пользователя
desktop = os.path.join(os.path.join(os.environ["USERPROFILE"]), "Desktop")
shortcut_path = os.path.join(desktop, "Запустить BotForg.lnk")

# Создание ярлыка
shell = win32com.client.Dispatch("WScript.Shell")
shortcut = shell.CreateShortCut(shortcut_path)
shortcut.TargetPath = target_path
shortcut.WorkingDirectory = project_dir
shortcut.IconLocation = "shell32.dll, 167"  # стандартная иконка Windows
shortcut.Save()
