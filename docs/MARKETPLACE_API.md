# Marketplace API Documentation

## Overview

API для маркетплейса предоставляет endpoints для управления товарами, заказами, профилями исполнителей и отзывами.

Base URL: `/api/market`

## Authentication

Все endpoints требуют аутентификации через Bearer token (кроме публичных GET запросов).

## Endpoints

### Market Items (Товары)

#### GET `/api/market/items`
Получить список товаров на маркетплейсе.

**Query Parameters:**
- `item_type` (optional): Фильтр по типу: `template`, `scenario`
- `category` (optional): Фильтр по категории
- `search` (optional): Поиск по названию и описанию
- `min_price` (optional): Минимальная цена
- `max_price` (optional): Максимальная цена
- `is_premium` (optional): Фильтр по premium товарам
- `is_published` (optional, default: true): Только опубликованные
- `sort_by` (optional, default: `created_at`): Сортировка: `created_at`, `price`, `sales_count`
- `order` (optional, default: `desc`): Порядок: `asc`, `desc`
- `page` (optional, default: 1): Номер страницы
- `page_size` (optional, default: 20): Размер страницы

**Response:** `MarketItemListResponse`

#### GET `/api/market/items/{item_id}`
Получить детальную информацию о товаре.

**Response:** `MarketItemDetailOut` (включает отзывы)

#### POST `/api/market/items`
Создать товар на маркетплейсе.

**Request Body:** `MarketItemCreate`
- `item_type`: `template` или `scenario`
- `source_bot_id`: ID бота-источника (для шаблонов)
- `source_scenario_id`: ID сценария-источника (для сценариев)
- `title`: Название товара
- `description`: Основное описание
- `additional_description`: Дополнительное описание
- `image_url`: URL изображения
- `price`: Цена (0 = бесплатно)
- `category`: Категория
- `tags`: Список тегов
- `is_premium`: Premium товар
- `is_published`: Опубликован ли товар

**Response:** `MarketItemOut`

#### PUT `/api/market/items/{item_id}`
Обновить товар.

**Request Body:** `MarketItemUpdate`

**Response:** `MarketItemOut`

#### DELETE `/api/market/items/{item_id}`
Удалить товар.

**Response:** 204 No Content

### Moderation (Модерация шаблонов)

#### POST `/api/market/templates/{template_id}/submit`
Отправить шаблон на модерацию (draft → pending).

**Требования:** тариф Developer, автор шаблона.

**Response:** `MarketItemOut` (moderation_status = pending)

#### POST `/api/admin/market/templates/{template_id}/approve`
Одобрить шаблон (pending → approved).

**Требования:** роль owner.

**Response:** `MarketItemOut` (moderation_status = approved)

#### POST `/api/admin/market/templates/{template_id}/reject`
Отклонить шаблон (pending → rejected).

**Требования:** роль owner.

**Request Body:**
```json
{
  "reason": "Причина отклонения"
}
```

**Response:** `MarketItemOut` (moderation_status = rejected, moderation_rejection_reason)

**Примечание:** В публичном `GET /api/market/items` возвращаются только шаблоны со статусом `approved`.

### Market Orders (Заказы)

#### GET `/api/market/orders`
Получить список заказов.

**Query Parameters:**
- `status` (optional): Фильтр по статусу: `open`, `in_progress`, `completed`, `cancelled`
- `category` (optional): Фильтр по категории
- `search` (optional): Поиск по названию и описанию
- `sort_by` (optional, default: `created_at`): Сортировка
- `order` (optional, default: `desc`): Порядок
- `page`, `page_size`: Пагинация

**Response:** `MarketOrderListResponse`

#### GET `/api/market/orders/{order_id}`
Получить детальную информацию о заказе (включает предложения).

**Response:** `MarketOrderDetailOut`

#### POST `/api/market/orders`
Создать заказ.

**Request Body:** `MarketOrderCreate`
- `title`: Название заказа
- `description`: Описание требований
- `budget_min`: Минимальный бюджет
- `budget_max`: Максимальный бюджет
- `deadline`: Срок выполнения
- `category`: Категория
- `skills`: Требуемые навыки

**Response:** `MarketOrderOut`

#### PUT `/api/market/orders/{order_id}`
Обновить заказ.

**Request Body:** `MarketOrderUpdate`

**Response:** `MarketOrderOut`

#### DELETE `/api/market/orders/{order_id}`
Удалить заказ.

**Response:** 204 No Content

### Order Proposals (Предложения на заказы)

#### POST `/api/market/orders/{order_id}/proposals`
Создать предложение на заказ.

**Request Body:** `OrderProposalCreate`
- `message`: Сообщение от исполнителя
- `proposed_price`: Предлагаемая цена
- `estimated_days`: Оценочное количество дней

**Response:** `OrderProposalOut`

#### POST `/api/market/orders/{order_id}/proposals/{proposal_id}/accept`
Принять предложение на заказ (только автор заказа).

**Response:** `MarketOrderOut` (статус заказа меняется на `in_progress`)

### Freelancer Profiles (Профили исполнителей)

#### GET `/api/market/freelancers`
Получить список исполнителей.

**Query Parameters:**
- `search` (optional): Поиск
- `skills` (optional): Фильтр по навыкам (через запятую)
- `is_verified` (optional): Фильтр по верификации
- `sort_by` (optional): Сортировка
- `page`, `page_size`: Пагинация

**Response:** `FreelancerListResponse`

#### GET `/api/market/freelancers/{user_id}`
Получить профиль исполнителя.

**Response:** `FreelancerProfileOut`

#### POST `/api/market/freelancers`
Создать профиль исполнителя.

**Request Body:** `FreelancerProfileCreate`
- `title`: Название специализации
- `description`: Описание услуг
- `hourly_rate`: Стоимость за час
- `skills`: Список навыков
- `portfolio_items`: Примеры работ

**Response:** `FreelancerProfileOut`

#### PUT `/api/market/freelancers/me`
Обновить свой профиль исполнителя.

**Request Body:** `FreelancerProfileUpdate`

**Response:** `FreelancerProfileOut`

### Reviews (Отзывы)

#### POST `/api/market/reviews`
Создать отзыв.

**Request Body:** `MarketReviewCreate`
- `item_type`: Тип объекта: `market_item`, `market_order`, `freelancer`
- `item_id`: ID товара/заказа/исполнителя
- `rating`: Рейтинг от 1 до 5
- `comment`: Текст отзыва

**Response:** `MarketReviewOut`

#### GET `/api/market/reviews`
Получить список отзывов для объекта.

**Query Parameters:**
- `item_type` (required): Тип объекта
- `item_id` (required): ID объекта
- `page`, `page_size`: Пагинация

**Response:** `List[MarketReviewOut]`

## Data Models

### MarketItemType
- `template`: Шаблон (готовый бот)
- `scenario`: Сценарий

### ModerationStatus (для шаблонов)
- `draft`: Черновик, не виден в маркетплейсе
- `pending`: На модерации
- `approved`: Одобрен, виден в публичном маркетплейсе
- `rejected`: Отклонён (с причиной в moderation_rejection_reason)

### MarketOrderStatus
- `open`: Открыт, принимаются предложения
- `in_progress`: Выбран исполнитель, работа ведется
- `completed`: Завершен
- `cancelled`: Отменен

## Notes

- Все цены хранятся как `Decimal` с точностью 2 знака после запятой
- Рейтинги вычисляются автоматически на основе отзывов
- Средний рейтинг и количество отзывов включаются в ответы для товаров и исполнителей
- Только владельцы могут редактировать/удалять свои товары и заказы
- Предложения на заказы могут создавать только пользователи, не являющиеся авторами заказа
