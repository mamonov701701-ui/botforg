# 🔧 Решение проблем со входом

## Быстрая диагностика

Запустите в PowerShell:
```powershell
cd C:\Users\mamon\botforg
python test_all_login.py
```

## Типичные проблемы и решения

### Проблема: "Unexpected token '<', "<!DOCTYPE "... is not valid JSON"

**Причина:** Frontend обращается к неправильному URL или backend не работает.

**Решение:**
1. Проверьте, что backend запущен:
   ```powershell
   Get-NetTCPConnection -LocalPort 8001 -State Listen
   ```

2. Если нет — запустите:
   ```powershell
   cd backend
   .\venv\Scripts\Activate.ps1
   uvicorn main:app --reload --port 8001
   ```

3. Проверьте файл `frontend/src/api/useAuthApi.js`:
   - API_URL должен быть `http://localhost:8001`
   - Content-Type должен быть `application/x-www-form-urlencoded`

---

### Проблема: "Internal Server Error" (500)

**Причина:** Ошибка в коде backend при обработке запроса.

**Решение:**
1. Проверьте файл `backend/models/__init__.py`
2. Убедитесь, что все модели импортированы
3. Перезапустите backend

---

### Проблема: Страница не обновляется после изменений

**Причина:** Браузер кэширует старую версию JavaScript.

**Решение:**
1. **Жёсткое обновление:** Ctrl + Shift + R
2. **Очистка кэша:** F12 → Network → Disable cache → F5
3. **Полная очистка:** F12 → ПКМ на кнопке обновления → "Empty Cache and Hard Reload"

---

### Проблема: Серверы не запускаются

**Решение:**

Используйте автоматический скрипт:
```powershell
powershell -ExecutionPolicy Bypass -File start_servers.ps1
```

Или запустите вручную в двух разных терминалах:

**Терминал 1 (Backend):**
```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8001
```

**Терминал 2 (Frontend):**
```powershell
cd frontend
npm run dev
```

---

### Проблема: Пользователь не найден

**Решение:**

Создайте пользователя:
```powershell
cd backend
.\venv\Scripts\python.exe create_admin_simple.py
```

---

## Проверка конфигурации

### .env файл
Файл должен называться `.env.development` (с точкой!) и содержать:
```
VITE_API_URL=http://localhost:8001
```

### vite.config.js
Должен содержать прокси:
```javascript
proxy: {
  '/auth': {
    target: 'http://localhost:8001',
    changeOrigin: true,
  },
}
```

### useAuthApi.js
```javascript
const API_URL = 'http://localhost:8001'; // НЕ 8000!
```

---

## Полная диагностика

Скрипт `test_all_login.py` проверяет:

1. ✅ Backend API напрямую
2. ✅ Пользователя в БД
3. ✅ Frontend прокси
4. ✅ Конфигурационные файлы

Запустите и смотрите что именно не работает.

---

## Контакты для дебага

Все исправления задокументированы в:
- `SUCCESS_REPORT.md`
- `WAKE_UP_INSTRUCTIONS.md`
- `docs/DASHBOARD_IMPLEMENTATION.md`

