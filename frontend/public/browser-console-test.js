// ═══════════════════════════════════════════════════════════════
// ТЕСТ ВХОДА ИЗ КОНСОЛИ БРАУЗЕРА
// ═══════════════════════════════════════════════════════════════
//
// Скопируйте этот код в консоль браузера (F12 → Console)
// и нажмите Enter для проверки входа
//
// ═══════════════════════════════════════════════════════════════

(async function testLogin() {
  console.log('%c🔍 ТЕСТ ВХОДА', 'font-size: 20px; font-weight: bold; color: #667eea');
  console.log('═'.repeat(60));

  const email = 'admin@example.com';
  const password = 'admin123456';

  console.log(`📧 Email: ${email}`);
  console.log(`🔑 Password: ${password}`);
  console.log('');

  try {
    console.log('⏳ Отправка запроса...');

    const response = await fetch('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        username: email,
        password: password,
      }),
      credentials: 'include',
    });

    console.log(`📡 Статус ответа: ${response.status}`);

    if (response.ok) {
      const data = await response.json();

      console.log(
        '%c✅ УСПЕХ! Вход работает!',
        'font-size: 16px; color: #10b981; font-weight: bold'
      );
      console.log('');
      console.log('🎫 Токен получен:');
      console.log(data.access_token);
      console.log('');

      // Сохраняем токен
      localStorage.setItem('auth_token', data.access_token);
      localStorage.setItem('token', data.access_token);

      console.log('💾 Токен сохранён в localStorage');
      console.log('');
      console.log(
        '%c→ Теперь перейдите на /dashboard',
        'font-size: 14px; color: #667eea; font-weight: bold'
      );
      console.log('   или выполните: window.location.href = "/dashboard"');

      // Показываем кнопку для перехода
      console.log('');
      console.log('%cВыполните для перехода в ЛК:', 'font-size: 12px; color: #666');
      console.log(
        '%cwindow.location.href = "/dashboard"',
        'background: #f3f4f6; padding: 5px; border-radius: 3px; font-family: monospace'
      );
    } else {
      const errorData = await response.json();
      console.error('%c❌ ОШИБКА ВХОДА', 'font-size: 16px; color: #ef4444; font-weight: bold');
      console.error('Детали:', errorData);
    }
  } catch (error) {
    console.error('%c❌ ОШИБКА ЗАПРОСА', 'font-size: 16px; color: #ef4444; font-weight: bold');
    console.error(error);
    console.error('');
    console.error('Возможные причины:');
    console.error('1. Backend не запущен (проверьте порт 8001)');
    console.error('2. Frontend не запущен (проверьте порт 5173)');
    console.error('3. Прокси не настроен в vite.config.js');
  }

  console.log('');
  console.log('═'.repeat(60));
})();
