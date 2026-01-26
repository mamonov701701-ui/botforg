# Полная документация Marketplace

## Обзор

Marketplace - это полнофункциональная система маркетплейса для продажи шаблонов ботов, сценариев, размещения заказов и поиска исполнителей.

## Архитектура

### Backend (FastAPI)
- **Модели БД**: SQLAlchemy ORM
- **API**: RESTful endpoints
- **Аутентификация**: JWT токены
- **Миграции**: Alembic

### Frontend (React + TypeScript)
- **API клиент**: `frontend/src/api/market.ts`
- **Страница**: `frontend/src/pages/MarketplacePage.tsx`
- **Уведомления**: Toast через `utils/toast.ts`

## Функциональность

### 1. Размещение товаров

#### Шаблоны и сценарии
- Размещение из существующих ботов/сценариев
- Создание новых товаров с нуля
- Указание цены, категории, тегов
- Дополнительное описание для покупателей

#### Заказы
- Создание заказов на разработку
- Указание бюджета, сроков, навыков
- Поиск исполнителей

#### Профили исполнителей
- Создание профиля фрилансера
- Указание специализации, стоимости, навыков
- Портфолио работ

### 2. Просмотр и поиск

- Фильтрация по типу (шаблоны/сценарии)
- Поиск по названию и описанию
- Фильтрация по категории, цене
- Сортировка по дате, цене, популярности

### 3. Отзывы и рейтинги

- Оставление отзывов на товары
- Рейтинг от 1 до 5
- Автоматический расчет среднего рейтинга
- Подсчет количества отзывов

## API Endpoints

### Market Items
- `GET /api/market/items` - Список товаров
- `GET /api/market/items/{id}` - Детали товара
- `POST /api/market/items` - Создать товар
- `PUT /api/market/items/{id}` - Обновить товар
- `DELETE /api/market/items/{id}` - Удалить товар

### Market Orders
- `GET /api/market/orders` - Список заказов
- `GET /api/market/orders/{id}` - Детали заказа
- `POST /api/market/orders` - Создать заказ
- `PUT /api/market/orders/{id}` - Обновить заказ
- `DELETE /api/market/orders/{id}` - Удалить заказ

### Order Proposals
- `POST /api/market/orders/{id}/proposals` - Создать предложение
- `POST /api/market/proposals/{id}/accept` - Принять предложение

### Freelancer Profiles
- `GET /api/market/freelancers` - Список исполнителей
- `GET /api/market/freelancers/{user_id}` - Профиль исполнителя
- `POST /api/market/freelancers` - Создать профиль
- `PUT /api/market/freelancers/{user_id}` - Обновить профиль

### Reviews
- `GET /api/market/reviews` - Список отзывов
- `POST /api/market/reviews` - Создать отзыв

## Использование

### Размещение товара

1. Откройте `/market`
2. Выберите вкладку (Templates/Scenarios)
3. Нажмите "Разместить"
4. Выберите источник (из существующих или создать новый)
5. Заполните форму:
   - Название
   - Описание
   - Цена (0 = бесплатно)
   - Категория
   - Теги
   - Дополнительное описание (опционально)
6. Нажмите "Опубликовать"

### Просмотр товаров

1. Откройте `/market`
2. Выберите вкладку
3. Используйте поиск для фильтрации
4. Кликните на товар для просмотра деталей

## Технические детали

### Структура данных

#### MarketItem
```typescript
{
  id: number;
  item_type: 'template' | 'scenario';
  source_bot_id?: number;
  source_scenario_id?: number;
  title: string;
  description: string;
  additional_description?: string;
  price: number;
  category?: string;
  tags?: string[];
  is_published: boolean;
  is_premium: boolean;
  sales_count: number;
  average_rating?: number;
  rating_count: number;
  seller: SellerInfo;
}
```

### Загрузка данных

Frontend автоматически загружает товары при:
- Открытии страницы маркетплейса
- Смене вкладки (templates/scenarios)
- После создания нового товара

### Обработка ошибок

- Валидация обязательных полей на frontend
- Обработка ошибок API с понятными сообщениями
- Toast уведомления для всех операций

## Файлы проекта

### Backend
- `backend/models/market.py` - Модели БД
- `backend/routers/market.py` - API endpoints
- `backend/schemas/market.py` - Pydantic схемы
- `backend/migrations/versions/marketplace_tables_001.py` - Миграция
- `backend/dependencies/auth_optional.py` - Опциональная аутентификация

### Frontend
- `frontend/src/api/market.ts` - API клиент
- `frontend/src/pages/MarketplacePage.tsx` - Страница маркетплейса

### Документация
- `docs/MARKETPLACE_API.md` - API документация
- `MARKETPLACE_FRONTEND_INTEGRATION.md` - Интеграция frontend
- `TESTING_REPORT.md` - Отчет о тестировании

## Известные ограничения

1. Регистрация через API возвращает 500 ошибку
   - Решение: использовать существующих пользователей или создавать через SQL

2. Загрузка изображений не реализована
   - Планируется в следующих версиях

3. Детальные страницы товаров не реализованы
   - Планируется в следующих версиях

## Версия

**Текущая версия**: 1.1.0
**Дата обновления**: 2026-01-21
**Статус**: Полностью функциональна ✅
