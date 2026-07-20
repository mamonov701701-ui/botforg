# Этап 6.14.10В-1 — backend: ответ пользователя на needs_information

## Назначение

Пользователь один раз отвечает на запрос дополнительных сведений.
Ответ сохраняется в `refund_audit_events`, заявка возвращается на рассмотрение,
администратору ставится email в существующий `notification_outbox`.

## Endpoint

`POST /api/me/refund-requests/{refund_id}/provide-information`

```json
{
  "message": "Текст ответа",
  "expected_version": 12
}
```

- `message`: trim, 1…2000, не blank;
- ownership → иначе 404;
- статус строго `needs_information` → иначе 409;
- `expected_version` → иначе 409;
- rate limit: 5 / 10 мин на `user:{id}:refund_provide_information`.

## Status transition

`needs_information` → `awaiting_admin_review`

Повторный ответ запрещён, пока админ снова не вызовет needs-information.

## Audit

Один `RefundAuditEvent`:

- `action = user_information_provided`
- `actor_type = user`
- `reason =` очищенный текст
- `previous_status / new_status` отражают переход

Отдельный `status_changed` для этого перехода **не** создаётся.
Исходный `user_comment` не меняется.

## Notification

Через существующий outbox producer:

- recipient: `REFUND_ADMIN_NOTIFY_EMAIL` (env);
- subject/title: «пользователь ответил по заявке на возврат»;
- нет email / невалидный → `skipped_no_recipient`, ответ сохраняется;
- DB enqueue error → rollback ответа и статуса;
- idempotency: `refund:{id}:{audit_id}:email:admin:{ver}`.

## Timeline

- User: «Дополнительная информация отправлена» + безопасный текст ответа.
- Admin: «Пользователь предоставил дополнительную информацию» + reason + transition.

## Повторные циклы

1. admin → needs_information  
2. user → provide-information → awaiting_admin_review  
3. admin снова needs_information  
4. user снова может ответить  

## Вне scope

Frontend (6.14.10В-2), вложения, `refund_messages`, inbox.
