# BotForg API Documentation

## Overview
BotForg - платформа для создания и управления чат-ботами с визуальным редактором потоков.

**Base URL**: `http://localhost:8000` (development)  
**API Version**: v1  
**Authentication**: JWT Bearer Token

## Authentication

### Register
```http
POST /auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Response:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "token_type": "bearer"
}
```

### Login
```http
POST /auth/login
Content-Type: application/x-www-form-urlencoded

username=john@example.com&password=SecurePass123
```

### Logout
```http
POST /auth/logout
Authorization: Bearer <token>
```

## Templates

### Get Templates
```http
GET /templates
```

### Get Template by ID
```http
GET /templates/{template_id}
```

## Bots

### Get Bots
```http
GET /bots
Authorization: Bearer <token>
```

### Create Bot
```http
POST /bots
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My Bot",
  "username": "my_bot",
  "token": "bot_token_from_telegram"
}
```

### Update Bot
```http
PATCH /bots/{bot_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Bot Name"
}
```

### Delete Bot
```http
DELETE /bots/{bot_id}
Authorization: Bearer <token>
```

## User Templates

### Get User Templates
```http
GET /user-templates
Authorization: Bearer <token>
```

### Create User Template
```http
POST /user-templates
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My Template",
  "description": "Template description",
  "template_id": 1
}
```

### Update User Template
```http
PUT /user-templates/{template_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Template",
  "description": "Updated description"
}
```

### Delete User Template
```http
DELETE /user-templates/{template_id}
Authorization: Bearer <token>
```

## Messages

### Get Messages
```http
GET /messages?bot_id={bot_id}&limit=50&offset=0
Authorization: Bearer <token>
```

### Create Message
```http
POST /messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "bot_id": 1,
  "direction": "incoming",
  "content": "Hello world",
  "user_id": 123
}
```

### Update Message
```http
PUT /messages/{message_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Updated message content"
}
```

### Delete Message
```http
DELETE /messages/{message_id}
Authorization: Bearer <token>
```

## Billing

### Get Billing Records
```http
GET /billing/records
Authorization: Bearer <token>
```

### Get Billing Summary
```http
GET /billing/summary
Authorization: Bearer <token>
```

### Update User Quota
```http
PUT /billing/quota
Authorization: Bearer <token>
Content-Type: application/json

{
  "free_messages": 100,
  "paid_messages": 50
}
```

## Payments

### Get Payments
```http
GET /payments
Authorization: Bearer <token>
```

### Create Payment
```http
POST /payments
Authorization: Bearer <token>
Content-Type: application/json

{
  "amount": 100.00,
  "currency": "RUB",
  "type": "subscription",
  "payload": "payment_data"
}
```

### Get Payment by ID
```http
GET /payments/{payment_id}
Authorization: Bearer <token>
```

## Error Responses

All endpoints return appropriate HTTP status codes:

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `422` - Validation Error
- `429` - Too Many Requests
- `500` - Internal Server Error

**Error Response Format:**
```json
{
  "detail": "Error message"
}
```

## Rate Limiting

API has rate limiting enabled:
- **Limit**: 1000 requests per minute per IP
- **Headers**: Rate limit information is included in response headers

## Testing Mode

При `TESTING=true` система отключает rate limiting. Используется для pytest.

## Password Compatibility

Поддержка старых bcrypt-хэшей и новых pbkdf2_sha256 для обратной совместимости.

## Security Headers

All responses include security headers:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `X-XSS-Protection: 1; mode=block`

## Interactive Documentation

Visit `/docs` for interactive Swagger UI documentation.
