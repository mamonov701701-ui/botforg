# 🚀 BotForg Deployment Guide

## Оглавление

1. [Требования](#требования)
2. [Локальная разработка](#локальная-разработка)
3. [Production деплой](#production-деплой)
4. [Мониторинг](#мониторинг)
5. [Бэкапы](#бэкапы)
6. [Troubleshooting](#troubleshooting)

---

## Требования

### Минимальные системные требования

| Компонент | Development | Production |
|-----------|-------------|------------|
| CPU | 2 cores | 4 cores |
| RAM | 4 GB | 8 GB |
| Disk | 20 GB SSD | 50 GB SSD |
| OS | Windows/Mac/Linux | Ubuntu 22.04 LTS |

### Программное обеспечение

- Docker 24.0+
- Docker Compose 2.0+
- Git 2.30+
- (опционально) Make

---

## Локальная разработка

### Быстрый старт

```bash
# Клонировать репозиторий
git clone https://github.com/mamonov701701-ui/botforg.git
cd botforg

# Скопировать конфигурацию
cp env.production.example .env

# Запустить в dev режиме
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Доступ к сервисам

| Сервис | URL | Описание |
|--------|-----|----------|
| Frontend | http://localhost:5173 | React приложение |
| Backend | http://localhost:8001 | FastAPI API |
| Adminer | http://localhost:8080 | Управление БД |
| PostgreSQL | localhost:5432 | База данных |
| Redis | localhost:6379 | Кэш |

### Полезные команды

```bash
# Остановить
docker-compose -f docker-compose.yml -f docker-compose.dev.yml down

# Посмотреть логи
docker-compose logs -f backend

# Перезапустить бэкенд
docker-compose restart backend

# Запустить тесты
docker-compose exec backend python -m pytest tests/ -v
```

---

## Production деплой

### 1. Подготовка сервера

```bash
# Скачать и запустить скрипт настройки
curl -fsSL https://raw.githubusercontent.com/mamonov701701-ui/botforg/main/scripts/setup-server.sh | sudo bash
```

Скрипт установит:
- Docker и Docker Compose
- Nginx
- Certbot для SSL
- UFW firewall

### 2. Конфигурация

```bash
cd /opt/botforg

# Скопировать и настроить переменные окружения
cp env.production.example .env
nano .env
```

**Обязательные переменные:**

```env
# Генерируйте с помощью: openssl rand -hex 32
SECRET_KEY=ваш-секретный-ключ-32-символа
JWT_SECRET=ваш-jwt-секрет-32-символа

# База данных
POSTGRES_PASSWORD=надежный-пароль
REDIS_PASSWORD=надежный-пароль

# Ваш домен
FRONTEND_ORIGIN=https://botforg.app
FRONTEND_URL=https://botforg.app
```

### 3. SSL сертификат

```bash
# Получить сертификат Let's Encrypt
sudo certbot --nginx -d botforg.app -d www.botforg.app

# Автообновление (уже настроено автоматически)
sudo certbot renew --dry-run
```

### 4. Запуск

```bash
# Собрать и запустить
docker-compose up -d --build

# Проверить статус
docker-compose ps

# Применить миграции
docker-compose exec backend alembic upgrade head
```

### 5. Настройка автозапуска

```bash
# Создать systemd сервис
sudo nano /etc/systemd/system/botforg.service
```

```ini
[Unit]
Description=BotForg Docker Compose
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/botforg
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable botforg
sudo systemctl start botforg
```

---

## Мониторинг

### Health Checks

```bash
# Backend health
curl http://localhost:8001/health

# Frontend health
curl http://localhost:80/health.html
```

### Логи

```bash
# Все логи
docker-compose logs -f

# Только backend
docker-compose logs -f backend

# Последние 100 строк
docker-compose logs --tail=100 backend
```

### Метрики (опционально)

Для продвинутого мониторинга рекомендуется настроить:

1. **Grafana + Prometheus** - метрики системы
2. **Sentry** - отслеживание ошибок
3. **Uptime Kuma** - мониторинг доступности

---

## Бэкапы

### Автоматические бэкапы

Бэкапы создаются автоматически при каждом деплое в `/opt/botforg-backups/`.

### Ручной бэкап

```bash
# Бэкап базы данных
docker-compose exec postgres pg_dump -U botforg botforg > backup_$(date +%Y%m%d).sql

# Восстановление
docker-compose exec -T postgres psql -U botforg botforg < backup_20240101.sql
```

### Бэкап volumes

```bash
# Остановить контейнеры
docker-compose down

# Бэкап всех volumes
docker run --rm -v botforg_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz /data

# Восстановление
docker run --rm -v botforg_postgres_data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres_backup.tar.gz -C /
```

---

## Troubleshooting

### Контейнер не запускается

```bash
# Проверить логи
docker-compose logs backend

# Проверить конфигурацию
docker-compose config

# Пересобрать
docker-compose up -d --build --force-recreate
```

### База данных недоступна

```bash
# Проверить статус PostgreSQL
docker-compose exec postgres pg_isready

# Подключиться к БД
docker-compose exec postgres psql -U botforg -d botforg
```

### Проблемы с SSL

```bash
# Проверить сертификат
sudo certbot certificates

# Обновить сертификат
sudo certbot renew

# Перезапустить nginx
docker-compose restart nginx
```

### Очистка и сброс

```bash
# Остановить и удалить всё
docker-compose down -v --remove-orphans

# Удалить все образы
docker system prune -af

# Начать заново
docker-compose up -d --build
```

---

## Обновление

### Автоматическое (через GitHub Actions)

При пуше в `main` ветку автоматически:
1. Запускаются тесты
2. Собираются Docker образы
3. Деплоится на сервер

### Ручное

```bash
cd /opt/botforg

# Получить изменения
git pull origin main

# Пересобрать и запустить
docker-compose up -d --build

# Применить миграции
docker-compose exec backend alembic upgrade head
```

---

## Поддержка

- 📧 Email: support@botforg.app
- 📖 Документация: https://docs.botforg.app
- 🐛 Issues: https://github.com/mamonov701701-ui/botforg/issues

