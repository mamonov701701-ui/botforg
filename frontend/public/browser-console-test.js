// ═══════════════════════════════════════════════════════════════
// ТЕСТ ВХОДА ИЗ КОНСОЛИ БРАУЗЕРА (актуальный эндпоинт /auth/email/login)
// ═══════════════════════════════════════════════════════════════
// Откройте приложение на http://localhost:5173, вставьте в консоль.

(async function testLogin() {
  const email = 'admin@example.com';
  const password = 'admin123456';

  const response = await fetch('/auth/email/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include',
  });

  console.log('Статус:', response.status);
  if (response.ok) {
    const data = await response.json();
    console.log('Токен:', data.access_token?.slice(0, 24) + '...');
    if (data.access_token) localStorage.setItem('auth_token', data.access_token);
  } else {
    console.log(await response.text());
  }
})();
