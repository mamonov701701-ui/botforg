import os
import sys

# Добавляем корень проекта в sys.path для корректного импорта backend
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

os.environ.setdefault("TESTING", "true")
