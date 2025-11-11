import requests, time
time.sleep(5)
try:
    r = requests.post("http://localhost:8001/auth/email/login", 
                      json={"email": "mamonov701701@mail.ru", "password": "BotForg2024!"}, timeout=5)
    if r.status_code == 200:
        d = r.json()
        print("\n" + "="*60)
        print("✅✅✅ ВХОД РАБОТАЕТ!!!")
        print("="*60)
        print(f"Токен: {d['access_token'][:50]}...")
        print(f"Сообщение: {d['message']}")
        print("\n🎉 ОТКРОЙТЕ http://localhost:5173")
        print("📧 Email: mamonov701701@mail.ru")
        print("🔑 Пароль: BotForg2024!")
        print("="*60 + "\n")
    else:
        print(f"❌ Ошибка {r.status_code}: {r.text[:200]}")
except Exception as e:
    print(f"❌ {e}")

