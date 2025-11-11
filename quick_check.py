import os
if os.path.exists('backend/.env'):
    with open('backend/.env', 'r') as f:
        content = f.read()
    print("✅ .env существует!")
    print(f"Размер: {len(content)} байт")
    print("\nПервые 5 строк:")
    print('\n'.join(content.split('\n')[:5]))
else:
    print("❌ .env НЕ СУЩЕСТВУЕТ!")

