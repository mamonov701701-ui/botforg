#!/usr/bin/env python3
"""
Скрипт для мониторинга здоровья фронтенда BotForg.
Проверяет доступность фронтенда и основных страниц.
"""

import json
import os
import requests
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional

# Конфигурация
FRONTEND_URL = "http://localhost:5173"
TELEGRAM_BOT_TOKEN = os.getenv("TG_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TG_CHAT_ID", "")

# Страницы для проверки
PAGES_TO_CHECK = [
    {"name": "home", "path": "/"},
    {"name": "templates", "path": "/templates"},
    {"name": "editor", "path": "/editor/1"},
]

# Путь для логов ошибок
ERRORS_LOG_PATH = Path("monitoring/frontend_errors.json")

class FrontendHealthMonitor:
    def __init__(self):
        self.errors = []
        self.session = requests.Session()
        self.session.timeout = 10  # 10 секунд таймаут
        
    def check_page(self, page_info: Dict[str, str]) -> Tuple[bool, str, Optional[int]]:
        """Проверяет доступность страницы."""
        url = f"{FRONTEND_URL}{page_info['path']}"
        try:
            response = self.session.get(url, allow_redirects=True)
            if response.status_code == 200:
                return True, "OK", response.status_code
            else:
                return False, f"HTTP {response.status_code}", response.status_code
        except requests.exceptions.ConnectionError:
            return False, "Connection error", None
        except requests.exceptions.Timeout:
            return False, "Timeout", None
        except Exception as e:
            return False, f"Error: {str(e)}", None
    
    def check_frontend_running(self) -> bool:
        """Проверяет, запущен ли фронтенд на порту 5173."""
        try:
            response = self.session.get(FRONTEND_URL, timeout=5)
            return response.status_code == 200
        except:
            return False
    
    def run_health_check(self) -> Dict:
        """Выполняет полную проверку здоровья фронтенда."""
        print(f"[CHECK] Проверяем фронтенд на {FRONTEND_URL}...")
        
        # Проверяем, запущен ли фронтенд
        frontend_running = self.check_frontend_running()
        if not frontend_running:
            error_msg = f"Frontend не запущен на {FRONTEND_URL}"
            print(f"[ERROR] {error_msg}")
            self.errors.append({
                "timestamp": datetime.now().isoformat(),
                "type": "frontend_down",
                "message": error_msg,
                "url": FRONTEND_URL
            })
            return {"status": "error", "errors": self.errors}
        
        print("[OK] Фронтенд запущен")
        
        # Проверяем каждую страницу
        page_results = []
        for page_info in PAGES_TO_CHECK:
            print(f"[CHECK] Проверяем {page_info['name']} ({page_info['path']})...")
            
            is_ok, message, status_code = self.check_page(page_info)
            page_result = {
                "name": page_info["name"],
                "path": page_info["path"],
                "url": f"{FRONTEND_URL}{page_info['path']}",
                "status": "ok" if is_ok else "error",
                "message": message,
                "status_code": status_code,
                "timestamp": datetime.now().isoformat()
            }
            page_results.append(page_result)
            
            if is_ok:
                print(f"[OK] {page_info['name']}: {message}")
            else:
                print(f"[ERROR] {page_info['name']}: {message}")
                self.errors.append(page_result)
        
        # Если есть ошибки, сохраняем их в лог
        if self.errors:
            self.save_errors_log()
            return {"status": "error", "errors": self.errors, "page_results": page_results}
        else:
            return {"status": "ok", "page_results": page_results}
    
    def save_errors_log(self):
        """Сохраняет логи ошибок в JSON файл."""
        # Создаем папку если не существует
        ERRORS_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        
        # Загружаем существующие ошибки или создаем новый список
        existing_errors = []
        if ERRORS_LOG_PATH.exists():
            try:
                with open(ERRORS_LOG_PATH, 'r', encoding='utf-8') as f:
                    existing_errors = json.load(f)
            except (json.JSONDecodeError, FileNotFoundError):
                existing_errors = []
        
        # Добавляем новые ошибки
        existing_errors.extend(self.errors)
        
        # Сохраняем только последние 100 ошибок
        if len(existing_errors) > 100:
            existing_errors = existing_errors[-100:]
        
        # Сохраняем в файл
        with open(ERRORS_LOG_PATH, 'w', encoding='utf-8') as f:
            json.dump(existing_errors, f, indent=2, ensure_ascii=False)
        
        print(f"[LOG] Ошибки сохранены в {ERRORS_LOG_PATH}")
    
    def send_telegram_notification(self, result: Dict):
        """Отправляет уведомление в Telegram о проблемах."""
        if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
            print("[WARN] Telegram токен или chat_id не настроены")
            return
        
        if result["status"] == "ok":
            return  # Не отправляем уведомления если все ОК
        
        # Формируем сообщение
        error_count = len(result["errors"])
        message = f"ALERT: Frontend Health Check Failed\n\n"
        message += f"ERRORS: {error_count}\n"
        message += f"TIME: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        
        # Добавляем краткий список ошибок
        for i, error in enumerate(result["errors"][:5]):  # Показываем только первые 5
            if error.get("type") == "frontend_down":
                message += f"• Frontend недоступен\n"
            else:
                message += f"• {error.get('name', 'Unknown')}: {error.get('message', 'Error')}\n"
        
        if len(result["errors"]) > 5:
            message += f"... и еще {len(result['errors']) - 5} ошибок\n"
        
        message += f"\nDETAILS: {ERRORS_LOG_PATH}"
        
        # Отправляем в Telegram
        try:
            url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
            data = {
                "chat_id": TELEGRAM_CHAT_ID,
                "text": message,
                "parse_mode": "HTML"
            }
            
            response = requests.post(url, data=data, timeout=30)
            if response.status_code == 200:
                print("[OK] Уведомление отправлено в Telegram")
            else:
                print(f"[ERROR] Ошибка отправки в Telegram: {response.status_code}")
                
        except Exception as e:
            print(f"[ERROR] Ошибка отправки в Telegram: {e}")
    
    def main(self):
        """Основная функция мониторинга."""
        print("Frontend Health Monitor")
        print("=" * 50)
        
        # Выполняем проверку
        result = self.run_health_check()
        
        # Выводим результат
        if result["status"] == "ok":
            print("\n[OK] OK - Все проверки пройдены успешно!")
        else:
            print(f"\n[ERROR] ERROR - Найдено {len(result['errors'])} ошибок")
            
            # Отправляем уведомление в Telegram
            self.send_telegram_notification(result)
        
        return result

def main():
    """Точка входа для запуска скрипта."""
    monitor = FrontendHealthMonitor()
    return monitor.main()

if __name__ == "__main__":
    main()
