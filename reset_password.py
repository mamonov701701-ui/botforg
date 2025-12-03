import sqlite3
import sys
sys.path.insert(0, 'backend')
from security import get_password_hash

# Новый пароль
new_password = "Test123456!"
hashed = get_password_hash(new_password)

conn = sqlite3.connect('backend/botforg.db')
cursor = conn.cursor()

cursor.execute("UPDATE users SET hashed_password = ?, password_hash = ? WHERE email = 'mamonov701701@mail.ru'", (hashed, hashed))
conn.commit()

print("✅ Пароль успешно сброшен!")
print()
print("📧 Email:    mamonov701701@mail.ru")
print("🔑 Password: Test123456!")
print()
print("Теперь войдите с этими данными.")

conn.close()

