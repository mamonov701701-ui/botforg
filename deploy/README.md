# Развёртывание BotForg (продакшен)

Здесь лежат примеры конфигов для деплоя **без Docker**: systemd, Nginx. Ничего не устанавливается автоматически — только файлы и инструкции.

## Содержимое

- **systemd/botforg-backend.service** — unit для автозапуска backend.
- **nginx/botforg.conf** — пример reverse proxy и раздачи статики frontend.

## HTTPS (Certbot / Let's Encrypt)

1. Установите Certbot (Ubuntu):
   ```bash
   sudo apt update
   sudo apt install certbot python3-certbot-nginx
   ```

2. Подставьте свой домен в `botforg.conf` (YOUR_DOMAIN) и включите сайт в Nginx.

3. Получите сертификат (Nginx сам обновит конфиг):
   ```bash
   sudo certbot --nginx -d YOUR_DOMAIN -d www.YOUR_DOMAIN
   ```

4. Проверка продления:
   ```bash
   sudo certbot renew --dry-run
   ```

Домен должен указывать на IP сервера до запуска Certbot.
